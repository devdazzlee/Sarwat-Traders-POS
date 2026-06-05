import { Prisma, LedgerEntryType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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
        select: { id: true, name: true, credit_limit: true, outstanding_balance: true },
      });
      if (!customer) throw new AppError(404, 'Customer not found');

      const newBalance = new Prisma.Decimal(customer.outstanding_balance).plus(amount);

      // Warn if over credit limit (but don't block — per user preference)
      const creditLimit = new Prisma.Decimal(customer.credit_limit);
      const overLimit = creditLimit.gt(0) && newBalance.gt(creditLimit);

      // Update outstanding balance
      await tx.customer.update({
        where: { id: customerId },
        data: { outstanding_balance: newBalance },
      });

      // Create ledger entry
      const entry = await tx.customerLedger.create({
        data: {
          customer_id: customerId,
          entry_type: LedgerEntryType.CREDIT_SALE,
          amount: new Prisma.Decimal(amount),
          description: description ?? 'Credit sale',
          sale_id: saleId,
          balance_after: newBalance,
          created_by: createdBy,
        },
      });

      return { entry, newBalance, overLimit };
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

      // Important: allow negative outstanding balance to represent customer advance/credit.
      const finalBalance = new Prisma.Decimal(customer.outstanding_balance).minus(amount);

      await tx.customer.update({
        where: { id: customerId },
        data: { outstanding_balance: finalBalance },
      });

      const entry = await tx.customerLedger.create({
        data: {
          customer_id: customerId,
          entry_type: LedgerEntryType.PAYMENT_RECEIVED,
          amount: new Prisma.Decimal(amount),
          description:
            description ??
            (resolvedSaleNumber
              ? `Payment received against ${resolvedSaleNumber}`
              : 'Payment received'),
          sale_id: resolvedSaleNumber,
          reference_no: referenceNo?.trim() || resolvedSaleNumber || null,
          balance_after: finalBalance,
          created_by: createdBy,
        },
      });

      return { entry, newBalance: finalBalance };
    });
  }

  private computeSignedDelta(
    entry: { entry_type: LedgerEntryType; amount: Prisma.Decimal; balance_after: Prisma.Decimal },
    prevBalance: number
  ): number {
    const amt = Number(entry.amount);
    switch (entry.entry_type) {
      case LedgerEntryType.CREDIT_SALE:
        return amt;
      case LedgerEntryType.PAYMENT_RECEIVED:
      case LedgerEntryType.REFUND:
        return -amt;
      case LedgerEntryType.ADJUSTMENT:
        return Number(entry.balance_after) - prevBalance;
      default:
        return 0;
    }
  }

  /** Rebuild running balances from entry amounts and sync customer outstanding_balance. */
  async syncCustomerBalances(customerId: string) {
    return prisma.$transaction(async (tx) => {
      const balance = await this.recalculateRunningBalances(tx, customerId);
      return { balance };
    });
  }

  private async recalculateRunningBalances(tx: TxClient, customerId: string) {
    const entries = await tx.customerLedger.findMany({
      where: { customer_id: customerId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    let running = 0;
    for (const entry of entries) {
      const delta = this.computeSignedDelta(entry, running);
      running = Number((running + delta).toFixed(3));
      if (Math.abs(Number(entry.balance_after) - running) > 0.009) {
        await tx.customerLedger.update({
          where: { id: entry.id },
          data: { balance_after: running },
        });
      }
    }

    await tx.customer.update({
      where: { id: customerId },
      data: { outstanding_balance: running },
    });

    return running;
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
    if (entry.entry_type === LedgerEntryType.CREDIT_SALE) {
      throw new AppError(
        409,
        'Credit sale entries cannot be edited here. Update or delete the sale from Sales History instead.'
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
          const priorEntries = await tx.customerLedger.findMany({
            where: { customer_id: customerId },
            orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          });
          const entryIndex = priorEntries.findIndex((e) => e.id === entryId);
          const prevBalance =
            entryIndex > 0 ? Number(priorEntries[entryIndex - 1].balance_after) : 0;
          const currentDelta = this.computeSignedDelta(entry, prevBalance);
          const sign =
            direction === 'debit'
              ? 1
              : direction === 'credit'
                ? -1
                : Math.sign(currentDelta) || 1;
          const newBalance = Number((prevBalance + sign * amount).toFixed(3));
          updateData.balance_after = newBalance;
        }
      } else if (
        entry.entry_type === LedgerEntryType.ADJUSTMENT &&
        (direction === 'debit' || direction === 'credit')
      ) {
        const priorEntries = await tx.customerLedger.findMany({
          where: { customer_id: customerId },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        });
        const entryIndex = priorEntries.findIndex((e) => e.id === entryId);
        const prevBalance =
          entryIndex > 0 ? Number(priorEntries[entryIndex - 1].balance_after) : 0;
        const sign = direction === 'debit' ? 1 : -1;
        const newBalance = Number((prevBalance + sign * Number(entry.amount)).toFixed(3));
        updateData.balance_after = newBalance;
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
            reference_no: entry.reference_no,
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
    });

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
    const [total, rawEntries, allEntries] = await Promise.all([
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
        select: { id: true, entry_type: true, amount: true, balance_after: true },
      }),
    ]);

    // Derive debit/credit from entry amounts (not balance_after deltas — avoids stale balance bugs)
    const debitCreditById = new Map<string, { debit: number; credit: number }>();
    const runningBalances = new Map<string, number>();
    let running = 0;
    let totalDebits = 0;
    let totalCredits = 0;
    for (const e of allEntries) {
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
    for (const e of allEntries) {
      const amt = Number(e.amount);
      if (e.entry_type === 'CREDIT_SALE') totalSales += amt;
      else if (e.entry_type === 'PAYMENT_RECEIVED') totalPayments += amt;
    }

    const saleRefs = [
      ...new Set(rawEntries.map((e) => e.sale_id).filter(Boolean)),
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

    const entries = rawEntries.map((e) => {
      const saleInfo = e.sale_id ? salesByRef[e.sale_id] : null;
      const invoiceTotal =
        e.entry_type === 'CREDIT_SALE' && saleInfo ? Number(saleInfo.total_amount) : 0;
      const invoicePaid =
        e.entry_type === 'CREDIT_SALE' && saleInfo ? Number(saleInfo.payment_received) : 0;
      const invoiceDue = saleInfo ? Math.max(0, invoiceTotal - invoicePaid) : 0;

      const amounts = debitCreditById.get(e.id) ?? { debit: 0, credit: 0 };

      const isCreditSale = e.entry_type === 'CREDIT_SALE';
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
        isCollectable: e.entry_type === 'CREDIT_SALE' && invoiceDue > 0.009,
        isEditable: !isCreditSale && !isRefund,
        isDeletable: !isCreditSale && !isRefund,
        editRestrictedReason: isCreditSale
          ? 'Edit this from Sales History'
          : isRefund
            ? 'Manage from Returns & Exchanges'
            : null,
        payment_method:
          e.entry_type === 'CREDIT_SALE' ? saleInfo?.payment_method ?? 'CREDIT' : null,
      };
    });

    const currentBalance = Number(customer.outstanding_balance);

    return {
      customer,
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
