import { Prisma, LedgerEntryType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { ledgerBalanceEngine, TxClient } from './ledger-balance.engine';
import { isSaleLinkedShadowAdjustment, isSaleManagedInSalePayment } from '../utils/sale-ledger-revision';

/** Ledger writes can sync many sale rows — default Prisma 5s timeout is too short. */
const LEDGER_WRITE_TX_OPTIONS = { maxWait: 20_000, timeout: 60_000 } as const;

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
   * Align one sale's ledger rows with its sale record.
   * Separates paid-at-sale (upfront row) from later collections (PAYMENT_RECEIVED rows).
   */
  private async syncSingleSaleLedgerFromRecord(
    tx: TxClient,
    customerId: string,
    sale: { sale_number: string; total_amount: Prisma.Decimal; payment_received: Prisma.Decimal },
    options?: { skipBalanceRecalc?: boolean },
  ) {
    await ledgerBalanceEngine.syncCreditSaleLedgerFromRecord(tx, {
      customerId,
      saleNumber: sale.sale_number,
      totalAmount: Number(sale.total_amount),
      paymentReceived: Number(sale.payment_received),
      reason: 'Auto-sync from sale record',
      skipBalanceRecalc: options?.skipBalanceRecalc ?? true,
    });
  }

  private async syncCustomerSaleLedgersFromSales(
    tx: TxClient,
    customerId: string,
    options?: { onlySettled?: boolean },
  ) {
    const sales = await tx.sale.findMany({
      where: {
        customer_id: customerId,
        status: 'COMPLETED',
        payment_method: 'CREDIT',
        ...(options?.onlySettled
          ? { OR: [{ payment_status: 'PAID' }, { payment_status: 'PARTIAL' }] }
          : {}),
      },
      select: {
        sale_number: true,
        total_amount: true,
        payment_received: true,
      },
    });

    for (const sale of sales) {
      await this.syncSingleSaleLedgerFromRecord(tx, customerId, sale, {
        skipBalanceRecalc: true,
      });
    }
  }

  /** Single reconciliation pipeline — run on manual entry edits/deletes only. */
  private async reconcileCustomerLedger(tx: TxClient, customerId: string) {
    await this.reconcileInvoicePayments(tx, customerId);
    await ledgerBalanceEngine.consolidateSaleLinkedAdjustments(tx, customerId);
    await ledgerBalanceEngine.recalculateRunningBalances(tx, customerId);
  }

  /**
   * Lighter reconcile after recording a payment — updates sale FIFO allocation and balances only.
   * Does NOT sync/delete credit-sale ledger rows (account payments are separate ledger lines).
   */
  private async reconcileCustomerLedgerAfterPayment(tx: TxClient, customerId: string) {
    await this.reconcileInvoicePayments(tx, customerId);
    await ledgerBalanceEngine.recalculateRunningBalances(tx, customerId);
  }

  /** Fast check: sale-linked ledger rows vs sale.payment_received. */
  private async saleLedgerDriftDetected(tx: TxClient, customerId: string): Promise<boolean> {
    const sales = await tx.sale.findMany({
      where: { customer_id: customerId, status: 'COMPLETED', payment_method: 'CREDIT' },
      select: { sale_number: true, total_amount: true, payment_received: true },
    });
    if (sales.length === 0) return false;

    const saleLedger = await tx.customerLedger.findMany({
      where: { customer_id: customerId, sale_id: { not: null } },
      select: { sale_id: true, entry_type: true, amount: true, description: true },
    });

    const creditBySale = new Map<string, number>();
    const upfrontBySale = new Map<string, number>();
    for (const row of saleLedger) {
      const saleId = row.sale_id as string;
      if (row.entry_type === LedgerEntryType.CREDIT_SALE) {
        creditBySale.set(saleId, Number(row.amount));
      }
      if (
        row.entry_type === LedgerEntryType.PAYMENT_RECEIVED &&
        isSaleManagedInSalePayment(row)
      ) {
        upfrontBySale.set(saleId, Number(row.amount));
      }
    }

    for (const sale of sales) {
      const total = Number(sale.total_amount);
      const paid = Number(sale.payment_received);
      const expectedCredit = Math.max(0, Number((total - paid).toFixed(3)));
      const ledgerCredit = creditBySale.get(sale.sale_number) ?? 0;

      if (Math.abs(expectedCredit - ledgerCredit) > 0.009) return true;
      if (expectedCredit <= 0.009 && creditBySale.has(sale.sale_number)) return true;

      const laterCollected = saleLedger
        .filter(
          (e) =>
            e.sale_id === sale.sale_number &&
            e.entry_type === LedgerEntryType.PAYMENT_RECEIVED &&
            !isSaleManagedInSalePayment(e),
        )
        .reduce((sum, e) => sum + Number(e.amount), 0);
      const paidAtSale = Math.max(0, Number((paid - laterCollected).toFixed(3)));
      const expectedUpfront = expectedCredit > 0.009 && paidAtSale > 0.009 ? paidAtSale : 0;
      const ledgerUpfront = upfrontBySale.get(sale.sale_number) ?? 0;
      if (Math.abs(expectedUpfront - ledgerUpfront) > 0.009) return true;
      if (expectedUpfront <= 0.009 && upfrontBySale.has(sale.sale_number)) return true;
    }

    return false;
  }

  /**
   * Read-only: derive display balances from existing rows — never mutates stored ledger data.
   */
  private computeLedgerTotals(
    entries: Array<{
      id: string;
      entry_type: LedgerEntryType;
      amount: Prisma.Decimal;
      balance_after: Prisma.Decimal;
      reference_no: string | null;
      description: string | null;
    }>,
  ) {
    const debitCreditById = new Map<string, { debit: number; credit: number }>();
    const runningBalances = new Map<string, number>();
    let running = 0;
    let totalDebits = 0;
    let totalCredits = 0;
    let totalSales = 0;
    let totalPayments = 0;

    for (const e of entries) {
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

      const amt = Number(e.amount);
      if (e.entry_type === 'CREDIT_SALE') totalSales += amt;
      else if (e.entry_type === 'PAYMENT_RECEIVED') totalPayments += amt;
    }

    return {
      debitCreditById,
      runningBalances,
      currentBalance: running,
      totalDebits,
      totalCredits,
      totalSales,
      totalPayments,
    };
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

    return prisma.$transaction(
      async (tx) => {
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
        skipBalanceRecalc: true,
      });

      await this.reconcileCustomerLedgerAfterPayment(tx, customerId);

      const newBalance = await ledgerBalanceEngine.getRunningBalance(tx, customerId);
      return { entry, newBalance };
    },
      LEDGER_WRITE_TX_OPTIONS,
    );
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
    return prisma.$transaction(
      async (tx) => {
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
        await this.reconcileCustomerLedger(tx, customerId);
      }

      return { entry: updated };
    },
      LEDGER_WRITE_TX_OPTIONS,
    );
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
    return prisma.$transaction(
      async (tx) => {
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

      if (entry.entry_type === LedgerEntryType.PAYMENT_RECEIVED) {
        await this.reconcileCustomerLedger(tx, customerId);
      }

      return { deletedEntryId: entryId };
    },
      LEDGER_WRITE_TX_OPTIONS,
    );
  }

  /**
   * READ-ONLY: credit sales missing from ledger after erroneous payment-sync deletes.
   * Reconstructs statement lines from sale records without writing to the database.
   */
  private buildMissingCreditSaleRows(
    customerId: string,
    creditSales: Array<{
      id: string;
      sale_number: string;
      total_amount: Prisma.Decimal;
      sale_date: Date | null;
      created_at: Date;
    }>,
    ledgerRows: Array<{ sale_id: string | null; entry_type: LedgerEntryType }>,
  ) {
    const creditSaleRefs = new Set(
      ledgerRows
        .filter((e) => e.entry_type === LedgerEntryType.CREDIT_SALE && e.sale_id?.trim())
        .map((e) => e.sale_id!.trim()),
    );

    return creditSales
      .filter((s) => !creditSaleRefs.has(s.sale_number))
      .map((s) => ({
        id: `synthetic-credit-${s.sale_number}`,
        customer_id: customerId,
        entry_type: LedgerEntryType.CREDIT_SALE,
        amount: s.total_amount,
        description: `Credit sale - ${s.sale_number}`,
        sale_id: s.sale_number,
        reference_no: s.sale_number,
        balance_after: new Prisma.Decimal(0),
        created_at: s.sale_date ?? s.created_at,
        updated_at: s.sale_date ?? s.created_at,
        created_by: 'system',
      }));
  }

  private entryInDateRange(createdAt: Date, startDate?: Date, endDate?: Date) {
    if (startDate && createdAt < startDate) return false;
    if (endDate && createdAt > endDate) return false;
    return true;
  }

  /**
   * READ-ONLY: same balance math as the ledger statement (includes reconstructed credit sales).
   */
  async computeDisplayBalance(customerId: string): Promise<number> {
    const map = await this.computeDisplayBalances([customerId]);
    return map.get(customerId) ?? 0;
  }

  async computeDisplayBalances(customerIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (customerIds.length === 0) return result;

    const uniqueIds = [...new Set(customerIds)];
    const [ledgerByCustomer, salesByCustomer] = await Promise.all([
      prisma.customerLedger
        .findMany({
          where: { customer_id: { in: uniqueIds } },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        })
        .then((rows) => {
          const grouped = new Map<string, typeof rows>();
          for (const row of rows) {
            const group = grouped.get(row.customer_id) ?? [];
            group.push(row);
            grouped.set(row.customer_id, group);
          }
          return grouped;
        }),
      prisma.sale
        .findMany({
          where: {
            customer_id: { in: uniqueIds },
            status: 'COMPLETED',
            payment_method: 'CREDIT',
          },
          select: {
            customer_id: true,
            id: true,
            sale_number: true,
            total_amount: true,
            sale_date: true,
            created_at: true,
          },
        })
        .then((rows) => {
          const grouped = new Map<string, typeof rows>();
          for (const row of rows) {
            if (!row.customer_id) continue;
            const group = grouped.get(row.customer_id) ?? [];
            group.push(row);
            grouped.set(row.customer_id, group);
          }
          return grouped;
        }),
    ]);

    for (const customerId of uniqueIds) {
      const dbEntries = ledgerByCustomer.get(customerId) ?? [];
      const creditSales = salesByCustomer.get(customerId) ?? [];
      const syntheticRows = this.buildMissingCreditSaleRows(customerId, creditSales, dbEntries);
      const visibleAsc = [...dbEntries, ...syntheticRows]
        .filter((e) => !isSaleLinkedShadowAdjustment(e))
        .sort((a, b) => {
          const diff = a.created_at.getTime() - b.created_at.getTime();
          return diff !== 0 ? diff : a.id.localeCompare(b.id);
        });
      const { currentBalance } = this.computeLedgerTotals(visibleAsc);
      result.set(customerId, currentBalance);
    }

    return result;
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

    // READ-ONLY: never auto-reconcile or rewrite existing ledger rows on view.
    const skip = (page - 1) * limit;
    const [dbEntries, creditSales, revisions] = await Promise.all([
      prisma.customerLedger.findMany({
        where: { customer_id: customerId },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      }),
      prisma.sale.findMany({
        where: {
          customer_id: customerId,
          status: 'COMPLETED',
          payment_method: 'CREDIT',
        },
        select: {
          id: true,
          sale_number: true,
          total_amount: true,
          payment_received: true,
          payment_status: true,
          payment_method: true,
          sale_date: true,
          created_at: true,
        },
        orderBy: [{ sale_date: 'asc' }, { created_at: 'asc' }],
      }),
      prisma.customerSaleLedgerRevision.findMany({
        where: { customer_id: customerId },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const syntheticRows = this.buildMissingCreditSaleRows(customerId, creditSales, dbEntries);
    const mergedAsc = [...dbEntries, ...syntheticRows].sort((a, b) => {
      const diff = a.created_at.getTime() - b.created_at.getTime();
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });

    const mergedFilteredAsc = mergedAsc.filter((e) =>
      this.entryInDateRange(e.created_at, startDate, endDate),
    );
    const visibleAllAsc = mergedFilteredAsc.filter((e) => !isSaleLinkedShadowAdjustment(e));
    const visibleDesc = [...visibleAllAsc].sort((a, b) => {
      const diff = b.created_at.getTime() - a.created_at.getTime();
      return diff !== 0 ? diff : b.id.localeCompare(a.id);
    });
    const total = visibleDesc.length;
    const visibleRawEntries = visibleDesc.slice(skip, skip + limit);

    const revisionsBySale = new Map<string, typeof revisions>();
    for (const revision of revisions) {
      const group = revisionsBySale.get(revision.sale_number) ?? [];
      group.push(revision);
      revisionsBySale.set(revision.sale_number, group);
    }

    const {
      debitCreditById,
      runningBalances,
      currentBalance,
      totalDebits,
      totalCredits,
      totalSales,
      totalPayments,
    } = this.computeLedgerTotals(visibleAllAsc);

    type SaleRow = {
      id: string;
      sale_number: string;
      payment_method: string;
      total_amount: Prisma.Decimal;
      payment_received: Prisma.Decimal;
      payment_status: string;
    };

    const salesByRef: Record<string, SaleRow> = {};
    for (const s of creditSales) {
      salesByRef[s.id] = s;
      salesByRef[s.sale_number] = s;
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

    const currentBalanceStored = Number(customer.outstanding_balance);

    return {
      customer: {
        ...customer,
        // Expose computed balance for UI; stored column left unchanged in DB.
        outstanding_balance: currentBalance,
      },
      entries,
      summary: {
        totalSales,
        totalPayments,
        totalDebits,
        totalCredits,
        currentBalance,
        storedBalance: currentBalanceStored,
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
    const customers = await prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        phone_number: true,
        outstanding_balance: true,
        credit_limit: true,
      },
    });
    const balances = await this.computeDisplayBalances(customers.map((c) => c.id));

    const debtors = customers
      .map((c) => ({
        ...c,
        outstanding_balance: new Prisma.Decimal(
          balances.get(c.id) ?? Number(c.outstanding_balance),
        ),
      }))
      .filter((c) => Number(c.outstanding_balance) > 0.009)
      .sort((a, b) => Number(b.outstanding_balance) - Number(a.outstanding_balance));

    const totalOutstanding = debtors.reduce((sum, c) => sum + Number(c.outstanding_balance), 0);

    return {
      totalOutstanding: new Prisma.Decimal(totalOutstanding),
      topDebtors: debtors.slice(0, 10),
    };
  }
}

export default CustomerLedgerService;
