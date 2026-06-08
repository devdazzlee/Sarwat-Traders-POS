import { LedgerEntryType, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type LedgerRow = {
  entry_type: LedgerEntryType;
  amount: Prisma.Decimal;
  balance_after: Prisma.Decimal;
  reference_no: string | null;
  description: string | null;
};

/**
 * Single source of truth for customer running balances.
 * All balance mutations MUST go through this engine.
 * customer.outstanding_balance is derived only via recalculateRunningBalances().
 */
export class LedgerBalanceEngine {
  computeSignedDelta(entry: LedgerRow, prevBalance: number): number {
    const amt = Number(entry.amount);
    switch (entry.entry_type) {
      case LedgerEntryType.CREDIT_SALE:
        return amt;
      case LedgerEntryType.CASH_SALE:
        return 0;
      case LedgerEntryType.PAYMENT_RECEIVED:
      case LedgerEntryType.REFUND:
        return -amt;
      case LedgerEntryType.ADJUSTMENT:
        return this.resolveAdjustmentDelta(entry, prevBalance);
      default:
        return 0;
    }
  }

  private resolveAdjustmentDelta(entry: LedgerRow, prevBalance: number): number {
    const amt = Number(entry.amount);
    const signRef = entry.reference_no?.trim().toUpperCase();
    if (signRef === 'DEBIT') return amt;
    if (signRef === 'CREDIT') return -amt;
    if (signRef === 'AUDIT') return 0;

    const desc = (entry.description ?? '').toLowerCase();
    if (desc.includes('opening balance')) return amt;
    if (desc.includes('credit removed')) return -amt;
    if (desc.includes('credit assigned')) return amt;

    return Number(entry.balance_after) - prevBalance;
  }

  computeRunningBalance(entries: LedgerRow[]): number {
    let running = 0;
    for (const entry of entries) {
      running = Number((running + this.computeSignedDelta(entry, running)).toFixed(3));
    }
    return running;
  }

  async getRunningBalance(tx: TxClient, customerId: string): Promise<number> {
    const entries = await tx.customerLedger.findMany({
      where: { customer_id: customerId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: {
        entry_type: true,
        amount: true,
        balance_after: true,
        reference_no: true,
        description: true,
      },
    });
    return this.computeRunningBalance(entries);
  }

  async recalculateRunningBalances(tx: TxClient, customerId: string): Promise<number> {
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

  /** Sync customer.outstanding_balance + all balance_after from entry amounts. */
  async syncCustomerBalances(customerId: string) {
    return prisma.$transaction(
      async (tx) => this.recalculateRunningBalances(tx, customerId),
      { maxWait: 15_000, timeout: 30_000 },
    );
  }

  private adjustmentReferenceNo(signedDelta: number): 'DEBIT' | 'CREDIT' {
    return signedDelta >= 0 ? 'DEBIT' : 'CREDIT';
  }

  async postCashSale(
    tx: TxClient,
    params: {
      customerId: string;
      amount: number;
      saleId: string;
      createdBy: string;
      description?: string;
    }
  ) {
    if (params.amount <= 0) return null;

    const entry = await tx.customerLedger.create({
      data: {
        customer_id: params.customerId,
        entry_type: LedgerEntryType.CASH_SALE,
        amount: new Prisma.Decimal(params.amount),
        description: params.description ?? 'Cash sale',
        sale_id: params.saleId,
        balance_after: 0,
        created_by: params.createdBy,
      },
    });

    await this.recalculateRunningBalances(tx, params.customerId);
    return entry;
  }

  async postCreditSale(
    tx: TxClient,
    params: {
      customerId: string;
      amount: number;
      saleId: string;
      createdBy: string;
      description?: string;
    }
  ) {
    if (params.amount <= 0) return null;

    const entry = await tx.customerLedger.create({
      data: {
        customer_id: params.customerId,
        entry_type: LedgerEntryType.CREDIT_SALE,
        amount: new Prisma.Decimal(params.amount),
        description: params.description ?? 'Credit sale',
        sale_id: params.saleId,
        balance_after: 0,
        created_by: params.createdBy,
      },
    });

    await this.recalculateRunningBalances(tx, params.customerId);
    return entry;
  }

  async postPayment(
    tx: TxClient,
    params: {
      customerId: string;
      amount: number;
      createdBy: string;
      description?: string;
      referenceNo?: string;
      saleId?: string;
    }
  ) {
    if (params.amount <= 0) throw new Error('Payment amount must be positive');

    const entry = await tx.customerLedger.create({
      data: {
        customer_id: params.customerId,
        entry_type: LedgerEntryType.PAYMENT_RECEIVED,
        amount: new Prisma.Decimal(params.amount),
        description: params.description ?? 'Payment received',
        sale_id: params.saleId,
        reference_no: params.referenceNo?.trim() || params.saleId || null,
        balance_after: 0,
        created_by: params.createdBy,
      },
    });

    await this.recalculateRunningBalances(tx, params.customerId);
    return entry;
  }

  async postRefund(
    tx: TxClient,
    params: {
      customerId: string;
      amount: number;
      createdBy: string;
      description?: string;
      saleId?: string;
      referenceNo?: string;
    }
  ) {
    if (params.amount <= 0) return null;

    const entry = await tx.customerLedger.create({
      data: {
        customer_id: params.customerId,
        entry_type: LedgerEntryType.REFUND,
        amount: new Prisma.Decimal(params.amount),
        description: params.description ?? 'Refund',
        sale_id: params.saleId,
        reference_no: params.referenceNo,
        balance_after: 0,
        created_by: params.createdBy,
      },
    });

    await this.recalculateRunningBalances(tx, params.customerId);
    return entry;
  }

  async postSignedAdjustment(
    tx: TxClient,
    params: {
      customerId: string;
      signedDelta: number;
      createdBy?: string;
      description: string;
      saleId?: string;
      referenceNo?: string;
    }
  ) {
    if (Math.abs(params.signedDelta) <= 0.009) return null;

    const entry = await tx.customerLedger.create({
      data: {
        customer_id: params.customerId,
        entry_type: LedgerEntryType.ADJUSTMENT,
        amount: new Prisma.Decimal(Math.abs(params.signedDelta)),
        description: params.description,
        sale_id: params.saleId,
        reference_no: params.referenceNo ?? this.adjustmentReferenceNo(params.signedDelta),
        balance_after: 0,
        created_by: params.createdBy,
      },
    });

    await this.recalculateRunningBalances(tx, params.customerId);
    return entry;
  }

  /**
   * Keep one ledger row per sale (CREDIT_SALE / CASH_SALE / upfront PAYMENT_RECEIVED).
   * Sale edits update those rows in place — never append delta ADJUSTMENT rows.
   */
  async syncSaleLedgerEntries(
    tx: TxClient,
    params: {
      customerId: string;
      saleNumber: string;
      paymentMethod: string;
      creditOwedAmount: number;
      upfrontPaymentAmount: number;
      cashSaleAmount: number;
      createdBy?: string;
    },
  ) {
    const { customerId, saleNumber } = params;
    const method = params.paymentMethod.toUpperCase();
    const isCredit = method === 'CREDIT';

    const existing = await tx.customerLedger.findMany({
      where: { customer_id: customerId, sale_id: saleNumber },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    const creditSale = existing.find((e) => e.entry_type === LedgerEntryType.CREDIT_SALE);
    const upfrontPayment = existing.find(
      (e) =>
        e.entry_type === LedgerEntryType.PAYMENT_RECEIVED &&
        e.description?.toLowerCase().startsWith('upfront payment on'),
    );
    const cashSale = existing.find((e) => e.entry_type === LedgerEntryType.CASH_SALE);
    const staleAdjustments = existing.filter(
      (e) =>
        e.entry_type === LedgerEntryType.ADJUSTMENT &&
        (e.description?.toLowerCase().includes('sale edit') ?? false),
    );

    for (const row of staleAdjustments) {
      await tx.customerLedger.delete({ where: { id: row.id } });
    }

    if (isCredit) {
      const owed = Math.max(0, params.creditOwedAmount);
      const paid = Math.max(0, params.upfrontPaymentAmount);
      const creditDesc =
        paid > 0.009 ? `Partial credit sale - ${saleNumber}` : `Credit sale - ${saleNumber}`;

      if (owed > 0.009) {
        if (creditSale) {
          await tx.customerLedger.update({
            where: { id: creditSale.id },
            data: { amount: new Prisma.Decimal(owed), description: creditDesc },
          });
        } else {
          await this.postCreditSale(tx, {
            customerId,
            amount: owed,
            saleId: saleNumber,
            createdBy: params.createdBy ?? '',
            description: creditDesc,
          });
        }
      } else if (creditSale) {
        await tx.customerLedger.delete({ where: { id: creditSale.id } });
      }

      if (paid > 0.009) {
        if (upfrontPayment) {
          await tx.customerLedger.update({
            where: { id: upfrontPayment.id },
            data: {
              amount: new Prisma.Decimal(paid),
              description: `Upfront payment on ${saleNumber}`,
            },
          });
        } else {
          await this.postPayment(tx, {
            customerId,
            amount: paid,
            saleId: saleNumber,
            createdBy: params.createdBy ?? '',
            description: `Upfront payment on ${saleNumber}`,
          });
        }
      } else if (upfrontPayment) {
        await tx.customerLedger.delete({ where: { id: upfrontPayment.id } });
      }

      if (cashSale) {
        await tx.customerLedger.delete({ where: { id: cashSale.id } });
      }
    } else {
      const cashTotal = Math.max(0, params.cashSaleAmount);
      const paidLabel = method === 'CARD' ? 'Card' : 'Cash';

      if (cashTotal > 0.009) {
        if (cashSale) {
          await tx.customerLedger.update({
            where: { id: cashSale.id },
            data: {
              amount: new Prisma.Decimal(cashTotal),
              description: `${paidLabel} sale - ${saleNumber}`,
            },
          });
        } else {
          await this.postCashSale(tx, {
            customerId,
            amount: cashTotal,
            saleId: saleNumber,
            createdBy: params.createdBy ?? '',
            description: `${paidLabel} sale - ${saleNumber}`,
          });
        }
      } else if (cashSale) {
        await tx.customerLedger.delete({ where: { id: cashSale.id } });
      }

      if (creditSale) {
        await tx.customerLedger.delete({ where: { id: creditSale.id } });
      }
      if (upfrontPayment) {
        await tx.customerLedger.delete({ where: { id: upfrontPayment.id } });
      }
    }

    await this.recalculateRunningBalances(tx, customerId);
  }
}

export const ledgerBalanceEngine = new LedgerBalanceEngine();
