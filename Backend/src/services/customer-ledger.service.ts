import { Prisma, LedgerEntryType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { ledgerBalanceEngine, TxClient } from './ledger-balance.engine';
import { isSaleLinkedShadowAdjustment } from '../utils/sale-ledger-revision';

class CustomerLedgerService {
  /**
   * Apply payment amount to open credit invoices (oldest first).
   * Returns amount not applied to any invoice (becomes customer advance).
   */
  private async applyPaymentFifo(
    tx: TxClient,
    customerId: string,
    amount: Prisma.Decimal | number
  ): Promise<Prisma.Decimal> {
    let remaining = new Prisma.Decimal(amount);
    if (remaining.lte(0)) return remaining;

    const openSales = await tx.sale.findMany({
      where: {
        customer_id: customerId,
        payment_method: 'CREDIT',
      },
      orderBy: [{ sale_date: 'asc' }, { created_at: 'asc' }],
      select: {
        id: true,
        total_amount: true,
        payment_received: true,
        payment_status: true,
      },
    });

    for (const sale of openSales) {
      if (remaining.lte(0)) break;

      const due = new Prisma.Decimal(sale.total_amount).minus(sale.payment_received);
      if (due.lte(0)) continue;

      const applied = Prisma.Decimal.min(due, remaining);
      const paymentReceivedAfter = new Prisma.Decimal(sale.payment_received).plus(applied);
      const dueAfter = new Prisma.Decimal(sale.total_amount).minus(paymentReceivedAfter);

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          payment_received: paymentReceivedAfter,
          payment_status: dueAfter.lte(0)
            ? 'PAID'
            : paymentReceivedAfter.gt(0)
              ? 'PARTIAL'
              : 'PENDING',
        },
      });

      remaining = remaining.minus(applied);
    }

    return remaining;
  }

  /**
   * Sync sale.payment_received with total payments when they drift
   * (e.g. overpayment on one invoice that should clear others).
   */
  private async reconcileInvoicePayments(tx: TxClient, customerId: string) {
    const [paymentAgg, salesAgg] = await Promise.all([
      tx.customerLedger.aggregate({
        where: { customer_id: customerId, entry_type: LedgerEntryType.PAYMENT_RECEIVED },
        _sum: { amount: true },
      }),
      tx.sale.aggregate({
        where: { customer_id: customerId, payment_method: 'CREDIT' },
        _sum: { payment_received: true },
      }),
    ]);

    const totalPayments = Number(paymentAgg._sum.amount ?? 0);
    const totalOnSales = Number(salesAgg._sum.payment_received ?? 0);
    const unallocated = totalPayments - totalOnSales;

    if (unallocated > 0.009) {
      await this.applyPaymentFifo(tx, customerId, unallocated);
    }
  }

  /**
   * Record a credit sale — increases outstanding balance
   */
  async recordCreditSale({
    customerId,
    amount,
    saleId,
    createdBy,
    description,
  }: {
    customerId: string;
    amount: number;
    saleId: string;
    createdBy: string;
    description?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true, name: true, credit_limit: true },
      });
      if (!customer) throw new AppError(404, 'Customer not found');

      const runningBefore = await ledgerBalanceEngine.getRunningBalance(tx, customerId);
      const entry = await ledgerBalanceEngine.postCreditSale(tx, {
        customerId,
        amount,
        saleId,
        createdBy,
        description,
      });
      const newBalance = await ledgerBalanceEngine.getRunningBalance(tx, customerId);

      const creditLimit = new Prisma.Decimal(customer.credit_limit);
      const overLimit = creditLimit.gt(0) && new Prisma.Decimal(newBalance).gt(creditLimit);

      return { entry, newBalance, overLimit, runningBefore };
    });
  }

  /**
   * Record a payment received — decreases outstanding balance
   */
  async recordPayment({
    customerId,
    amount,
    createdBy,
    description,
    referenceNo,
    saleId,
  }: {
    customerId: string;
    amount: number;
    createdBy: string;
    description?: string;
    referenceNo?: string;
    saleId?: string;
  }) {
    if (amount <= 0) throw new AppError(400, 'Payment amount must be positive');

    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true, outstanding_balance: true },
      });
      if (!customer) throw new AppError(404, 'Customer not found');

      // Multiple partial payments against the same invoice are allowed (same sale_id / reference_no).
      // Duplicate POST protection is handled by idempotency middleware (X-Operation-Id).

      let resolvedSaleNumber: string | undefined;
      let remaining = new Prisma.Decimal(amount);

      if (saleId?.trim()) {
        const sale = await tx.sale.findFirst({
          where: {
            customer_id: customerId,
            OR: [{ id: saleId.trim() }, { sale_number: saleId.trim() }],
          },
          select: {
            id: true,
            sale_number: true,
            total_amount: true,
            payment_received: true,
            payment_status: true,
          },
        });

        if (!sale) {
          throw new AppError(404, 'Invoice not found for this customer');
        }

        const dueBefore = new Prisma.Decimal(sale.total_amount).minus(sale.payment_received);
        if (dueBefore.lte(0)) {
          throw new AppError(409, `Invoice ${sale.sale_number} is already fully settled`);
        }

        const appliedToSale = Prisma.Decimal.min(dueBefore, remaining);
        const paymentReceivedAfter = new Prisma.Decimal(sale.payment_received).plus(appliedToSale);
        const dueAfter = new Prisma.Decimal(sale.total_amount).minus(paymentReceivedAfter);

        await tx.sale.update({
          where: { id: sale.id },
          data: {
            payment_received: paymentReceivedAfter,
            payment_status: dueAfter.lte(0)
              ? 'PAID'
              : paymentReceivedAfter.gt(0)
                ? 'PARTIAL'
                : 'PENDING',
          },
        });

        resolvedSaleNumber = sale.sale_number;
        remaining = remaining.minus(appliedToSale);
      }

      if (remaining.gt(0)) {
        await this.applyPaymentFifo(tx, customerId, remaining);
      }

      const entry = await ledgerBalanceEngine.postPayment(tx, {
        customerId,
        amount,
        createdBy,
        description:
          description ??
          (resolvedSaleNumber
            ? `Payment received against ${resolvedSaleNumber}`
            : 'Payment received'),
        referenceNo: referenceNo?.trim() || resolvedSaleNumber,
        saleId: resolvedSaleNumber,
      });

      const newBalance = await ledgerBalanceEngine.getRunningBalance(tx, customerId);
      return { entry, newBalance };
    });
  }

  /** Rebuild running balances from entry amounts and sync customer outstanding_balance. */
  async syncCustomerBalances(customerId: string) {
    const balance = await ledgerBalanceEngine.syncCustomerBalances(customerId);
    return { balance };
  }

  private computeSignedDelta = ledgerBalanceEngine.computeSignedDelta.bind(ledgerBalanceEngine);

  private recalculateRunningBalances(tx: TxClient, customerId: string) {
    return ledgerBalanceEngine.recalculateRunningBalances(tx, customerId);
  }

  private async reapplyAllPaymentAllocations(tx: TxClient, customerId: string) {
    const creditSales = await tx.sale.findMany({
      where: { customer_id: customerId, payment_method: 'CREDIT' },
      select: { id: true, total_amount: true },
    });

    for (const sale of creditSales) {
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          payment_received: 0,
          payment_status: 'PENDING',
        },
      });
    }

    const payments = await tx.customerLedger.findMany({
      where: { customer_id: customerId, entry_type: LedgerEntryType.PAYMENT_RECEIVED },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    for (const payment of payments) {
      let remaining = new Prisma.Decimal(payment.amount);
      const saleRef = payment.sale_id?.trim();

      if (saleRef) {
        const sale = await tx.sale.findFirst({
          where: {
            customer_id: customerId,
            OR: [{ id: saleRef }, { sale_number: saleRef }],
          },
          select: {
            id: true,
            total_amount: true,
            payment_received: true,
          },
        });

        if (sale) {
          const dueBefore = new Prisma.Decimal(sale.total_amount).minus(sale.payment_received);
          if (dueBefore.gt(0)) {
            const applied = Prisma.Decimal.min(dueBefore, remaining);
            const paymentReceivedAfter = new Prisma.Decimal(sale.payment_received).plus(applied);
            const dueAfter = new Prisma.Decimal(sale.total_amount).minus(paymentReceivedAfter);

            await tx.sale.update({
              where: { id: sale.id },
              data: {
                payment_received: paymentReceivedAfter,
                payment_status: dueAfter.lte(0)
                  ? 'PAID'
                  : paymentReceivedAfter.gt(0)
                    ? 'PARTIAL'
                    : 'PENDING',
              },
            });

            remaining = remaining.minus(applied);
          }
        }
      }

      if (remaining.gt(0)) {
        await this.applyPaymentFifo(tx, customerId, remaining);
      }
    }
  }

  private assertEntryEditable(entry: {
    entry_type: LedgerEntryType;
    sale_id: string | null;
  }) {
    if (
      entry.entry_type === LedgerEntryType.CREDIT_SALE ||
      entry.entry_type === LedgerEntryType.CASH_SALE
    ) {
      throw new AppError(
        409,
        'Sale entries cannot be edited here. Update or delete the sale from Sales History instead.'
      );
    }
    if (entry.entry_type === LedgerEntryType.REFUND) {
      throw new AppError(
        409,
        'Refund entries cannot be edited here. Manage the related return or exchange record instead.'
      );
    }
  }

  private assertEntryDeletable(entry: {
    entry_type: LedgerEntryType;
    sale_id: string | null;
  }) {
    this.assertEntryEditable(entry);
  }

  /**
   * Update an existing ledger entry (payments and adjustments)
   */
  async updateLedgerEntry({
    customerId,
    entryId,
    amount,
    description,
    referenceNo,
    date,
    direction,
    updatedBy,
  }: {
    customerId: string;
    entryId: string;
    amount?: number;
    description?: string;
    referenceNo?: string;
    date?: Date;
    direction?: 'debit' | 'credit';
    updatedBy: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const entry = await tx.customerLedger.findFirst({
        where: { id: entryId, customer_id: customerId },
      });
      if (!entry) throw new AppError(404, 'Ledger entry not found');

      this.assertEntryEditable(entry);

      const updateData: Prisma.CustomerLedgerUpdateInput = {};

      if (description !== undefined) {
        updateData.description = description.trim() || null;
      }

      if (referenceNo !== undefined) {
        updateData.reference_no = referenceNo.trim() || null;
      }

      if (date !== undefined) {
        if (Number.isNaN(date.getTime())) {
          throw new AppError(400, 'Invalid date');
        }
        updateData.created_at = date;
      }

      if (amount !== undefined) {
        if (amount <= 0) throw new AppError(400, 'Amount must be positive');
        updateData.amount = new Prisma.Decimal(amount);

        if (entry.entry_type === LedgerEntryType.ADJUSTMENT) {
          const sign =
            direction === 'debit'
              ? 'DEBIT'
              : direction === 'credit'
                ? 'CREDIT'
                : entry.reference_no?.trim().toUpperCase() === 'CREDIT'
                  ? 'CREDIT'
                  : 'DEBIT';
          updateData.reference_no = sign;
        }
      } else if (
        entry.entry_type === LedgerEntryType.ADJUSTMENT &&
        (direction === 'debit' || direction === 'credit')
      ) {
        updateData.reference_no = direction === 'debit' ? 'DEBIT' : 'CREDIT';
      }

      const updated = await tx.customerLedger.update({
        where: { id: entryId },
        data: updateData,
      });

      await this.recalculateRunningBalances(tx, customerId);

      if (entry.entry_type === LedgerEntryType.PAYMENT_RECEIVED) {
        await this.reapplyAllPaymentAllocations(tx, customerId);
      }

      return { entry: updated };
    });
  }

  /**
   * Delete a ledger entry and recalculate balances.
   * Creates a reversal adjustment entry for audit trail before removal.
   */
  async deleteLedgerEntry({
    customerId,
    entryId,
    deletedBy,
    reason,
  }: {
    customerId: string;
    entryId: string;
    deletedBy: string;
    reason?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const entry = await tx.customerLedger.findFirst({
        where: { id: entryId, customer_id: customerId },
      });
      if (!entry) throw new AppError(404, 'Ledger entry not found');

      this.assertEntryDeletable(entry);

      const allEntries = await tx.customerLedger.findMany({
        where: { customer_id: customerId },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      });
      const entryIndex = allEntries.findIndex((e) => e.id === entryId);
      const prevBalance = entryIndex > 0 ? Number(allEntries[entryIndex - 1].balance_after) : 0;
      const signedDelta = this.computeSignedDelta(entry, prevBalance);
      const deletedAmount = Number(entry.amount);
      const deletedDescription = entry.description;
      const deletedType = entry.entry_type;

      await tx.customerLedger.delete({ where: { id: entryId } });

      const runningBalance = await this.recalculateRunningBalances(tx, customerId);

      if (entry.entry_type === LedgerEntryType.PAYMENT_RECEIVED) {
        await this.reapplyAllPaymentAllocations(tx, customerId);
      }

      if (Math.abs(signedDelta) > 0.009) {
        await tx.customerLedger.create({
          data: {
            customer_id: customerId,
            entry_type: LedgerEntryType.ADJUSTMENT,
            amount: new Prisma.Decimal(Math.abs(signedDelta)),
            description:
              reason?.trim() ||
              `Deleted ${deletedType.toLowerCase().replace(/_/g, ' ')}${
                deletedDescription ? `: ${deletedDescription}` : ''
              } (${deletedAmount.toLocaleString()} reversed)`,
            sale_id: entry.sale_id,
            reference_no: 'AUDIT',
            balance_after: runningBalance,
            created_by: deletedBy,
          },
        });
      }

      return { deletedEntryId: entryId };
    });
  }

  /**
   * Get ledger entries for a customer with optional date filtering
   */
  async getCustomerLedger({
    customerId,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  }: {
    customerId: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        phone_number: true,
        mobile_number: true,
        whatsapp_number: true,
        outstanding_balance: true,
        credit_limit: true,
      },
    });
    if (!customer) throw new AppError(404, 'Customer not found');

    await prisma.$transaction(async (tx) => {
      await this.reconcileInvoicePayments(tx, customerId);
      await ledgerBalanceEngine.consolidateSaleLinkedAdjustments(tx, customerId);
      await ledgerBalanceEngine.recalculateRunningBalances(tx, customerId);
    });

    const refreshedCustomer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        phone_number: true,
        mobile_number: true,
        whatsapp_number: true,
        outstanding_balance: true,
        credit_limit: true,
      },
    });
    if (!refreshedCustomer) throw new AppError(404, 'Customer not found');

    const where: Prisma.CustomerLedgerWhereInput = {
      customer_id: customerId,
      ...(startDate || endDate
        ? {
            created_at: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    const skip = (page - 1) * limit;
    const [total, rawEntries, allEntries, revisions] = await Promise.all([
      prisma.customerLedger.count({ where }),
      prisma.customerLedger.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.customerLedger.findMany({
        where: { customer_id: customerId },
        orderBy: { created_at: 'asc' },
        select: { id: true, entry_type: true, amount: true, balance_after: true, reference_no: true, description: true, sale_id: true },
      }),
      prisma.customerSaleLedgerRevision.findMany({
        where: { customer_id: customerId },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const visibleRawEntries = rawEntries.filter((e) => !isSaleLinkedShadowAdjustment(e));
    const visibleAllEntries = allEntries.filter((e) => !isSaleLinkedShadowAdjustment(e));

    const revisionsBySale = new Map<string, typeof revisions>();
    for (const revision of revisions) {
      const group = revisionsBySale.get(revision.sale_number) ?? [];
      group.push(revision);
      revisionsBySale.set(revision.sale_number, group);
    }

    // Derive debit/credit from entry amounts (not balance_after deltas — avoids stale balance bugs)
    const debitCreditById = new Map<string, { debit: number; credit: number }>();
    const runningBalances = new Map<string, number>();
    let running = 0;
    let totalDebits = 0;
    let totalCredits = 0;
    for (const e of visibleAllEntries) {
      const delta = this.computeSignedDelta(e, running);
      let debit = 0;
      let credit = 0;
      if (delta > 0.009) {
        debit = delta;
        totalDebits += delta;
      } else if (delta < -0.009) {
        credit = Math.abs(delta);
        totalCredits += Math.abs(delta);
      }
      running = Number((running + delta).toFixed(3));
      debitCreditById.set(e.id, { debit, credit });
      runningBalances.set(e.id, running);
    }

    let totalSales = 0;
    let totalPayments = 0;
    for (const e of visibleAllEntries) {
      const amt = Number(e.amount);
      if (e.entry_type === 'CREDIT_SALE') totalSales += amt;
      else if (e.entry_type === 'PAYMENT_RECEIVED') totalPayments += amt;
      // CASH_SALE: tracked in entries list only — does not affect balance totals
    }

    const saleRefs = [
      ...new Set(visibleRawEntries.map((e) => e.sale_id).filter(Boolean)),
    ] as string[];

    type SaleRow = {
      id: string;
      sale_number: string;
      payment_method: string;
      total_amount: Prisma.Decimal;
      payment_received: Prisma.Decimal;
      payment_status: string;
    };

    const salesByRef: Record<string, SaleRow> = {};
    if (saleRefs.length > 0) {
      const sales = await prisma.sale.findMany({
        where: {
          customer_id: customerId,
          OR: [{ sale_number: { in: saleRefs } }, { id: { in: saleRefs } }],
        },
        select: {
          id: true,
          sale_number: true,
          payment_method: true,
          total_amount: true,
          payment_received: true,
          payment_status: true,
        },
      });
      for (const s of sales) {
        salesByRef[s.id] = s;
        salesByRef[s.sale_number] = s;
      }
    }

    const entries = visibleRawEntries.map((e) => {
      const saleInfo = e.sale_id ? salesByRef[e.sale_id] : null;
      const isCreditSale = e.entry_type === 'CREDIT_SALE';
      const isCashSale = e.entry_type === 'CASH_SALE';
      const isSaleEntry = isCreditSale || isCashSale;
      const saleRevisions = e.sale_id ? revisionsBySale.get(e.sale_id) ?? [] : [];
      const saleLinkedRevisions = isSaleEntry
        ? saleRevisions.filter(
            (r) =>
              !r.ledger_entry_id ||
              r.ledger_entry_id === e.id ||
              (isCreditSale && r.field === 'CREDIT_OWED') ||
              (isCashSale && r.field === 'CASH_TOTAL'),
          )
        : [];
      const originalLedgerAmount =
        saleLinkedRevisions.length > 0
          ? Number(saleLinkedRevisions[0].previous_amount)
          : Number(e.amount);
      const adjustmentHistory = saleLinkedRevisions.map((r) => ({
        id: r.id,
        field: r.field,
        previousAmount: Number(r.previous_amount),
        newAmount: Number(r.new_amount),
        signedDelta: Number(r.signed_delta),
        reason: r.reason,
        createdAt: r.created_at.toISOString(),
      }));

      const invoiceTotal =
        isSaleEntry && saleInfo ? Number(saleInfo.total_amount) : 0;
      const invoicePaid =
        isCreditSale && saleInfo ? Number(saleInfo.payment_received) : isCashSale ? invoiceTotal : 0;
      const invoiceDue = isCreditSale && saleInfo ? Math.max(0, invoiceTotal - invoicePaid) : 0;

      const amounts = debitCreditById.get(e.id) ?? { debit: 0, credit: 0 };

      const isRefund = e.entry_type === 'REFUND';

      return {
        id: e.id,
        date: e.created_at.toISOString(),
        type: e.entry_type,
        description: e.description ?? '',
        reference_no: e.reference_no ?? saleInfo?.sale_number ?? null,
        debit: amounts.debit,
        credit: amounts.credit,
        balance: runningBalances.get(e.id) ?? Number(e.balance_after),
        amount: Number(e.amount),
        invoiceTotal,
        invoicePaid,
        invoiceDue,
        saleId: saleInfo?.id ?? null,
        paymentStatus: saleInfo?.payment_status ?? null,
        isCollectable: isCreditSale && invoiceDue > 0.009,
        isEditable: !isSaleEntry && !isRefund,
        isDeletable: !isSaleEntry && !isRefund,
        editRestrictedReason: isSaleEntry
          ? 'Edit or delete this from Sales History'
          : isRefund
            ? 'Manage from Returns & Exchanges'
            : null,
        payment_method: isSaleEntry ? saleInfo?.payment_method ?? (isCashSale ? 'CASH' : 'CREDIT') : null,
        originalLedgerAmount,
        adjustmentHistory,
      };
    });

    const currentBalance = Number(refreshedCustomer.outstanding_balance);

    return {
      customer: refreshedCustomer,
      entries,
      summary: {
        totalSales,
        totalPayments,
        totalDebits,
        totalCredits,
        currentBalance,
        balanceDue: Math.max(0, currentBalance),
        advanceBalance: Math.max(0, -currentBalance),
      },
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all customers with outstanding balances (for the dashboard summary)
   */
  async getCreditSummary() {
    const result = await prisma.customer.aggregate({
      _sum: { outstanding_balance: true },
      where: { outstanding_balance: { gt: 0 } },
    });

    const topDebtors = await prisma.customer.findMany({
      where: { outstanding_balance: { gt: 0 } },
      select: {
        id: true,
        name: true,
        phone_number: true,
        outstanding_balance: true,
        credit_limit: true,
      },
      orderBy: { outstanding_balance: 'desc' },
      take: 10,
    });

    return {
      totalOutstanding: result._sum.outstanding_balance ?? new Prisma.Decimal(0),
      topDebtors,
    };
  }
}

export default CustomerLedgerService;
