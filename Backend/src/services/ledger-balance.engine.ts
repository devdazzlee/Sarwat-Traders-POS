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
}

export const ledgerBalanceEngine = new LedgerBalanceEngine();
