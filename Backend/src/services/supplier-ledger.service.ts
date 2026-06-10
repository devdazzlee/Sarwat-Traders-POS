import { Prisma, SupplierLedgerEntryType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { asNumber } from '../utils/helpers';
import {
  supplierLedgerBalanceEngine,
  SupplierTxClient,
} from './supplier-ledger-balance.engine';

type PurchaseBatchSummary = {
  purchaseNumber: string;
  totalAmount: number;
  paymentMade: number;
  paymentStatus: string;
  paymentMethod: string;
  invoiceRef: string | null;
  purchaseDate: Date;
};

class SupplierLedgerService {
  private computeSignedDelta = supplierLedgerBalanceEngine.computeSignedDelta.bind(
    supplierLedgerBalanceEngine,
  );

  private purchaseLineTotal(qty: Prisma.Decimal, cost: Prisma.Decimal): number {
    return asNumber(qty) * asNumber(cost);
  }

  private async getPurchaseBatchSummaries(
    tx: SupplierTxClient,
    supplierId: string,
  ): Promise<Map<string, PurchaseBatchSummary>> {
    const rows = await tx.purchase.findMany({
      where: { supplier_id: supplierId, purchase_number: { not: null } },
      orderBy: [{ purchase_date: 'asc' }, { created_at: 'asc' }],
      select: {
        purchase_number: true,
        quantity: true,
        cost_price: true,
        payment_made: true,
        payment_status: true,
        payment_method: true,
        invoice_ref: true,
        purchase_date: true,
      },
    });

    const batches = new Map<string, PurchaseBatchSummary>();
    for (const row of rows) {
      const key = row.purchase_number!;
      const lineTotal = this.purchaseLineTotal(row.quantity, row.cost_price);
      const existing = batches.get(key);
      if (existing) {
        existing.totalAmount += lineTotal;
        existing.paymentMade = Math.max(existing.paymentMade, asNumber(row.payment_made));
      } else {
        batches.set(key, {
          purchaseNumber: key,
          totalAmount: lineTotal,
          paymentMade: asNumber(row.payment_made),
          paymentStatus: row.payment_status,
          paymentMethod: row.payment_method,
          invoiceRef: row.invoice_ref,
          purchaseDate: row.purchase_date,
        });
      }
    }
    return batches;
  }

  private async applyPaymentFifo(
    tx: SupplierTxClient,
    supplierId: string,
    amount: Prisma.Decimal | number,
  ): Promise<Prisma.Decimal> {
    let remaining = new Prisma.Decimal(amount);
    if (remaining.lte(0)) return remaining;

    const batches = await this.getPurchaseBatchSummaries(tx, supplierId);
    const openBatches = [...batches.values()]
      .filter(
        (b) =>
          b.paymentMethod === 'CREDIT' && b.totalAmount - b.paymentMade > 0.009,
      )
      .sort(
        (a, b) =>
          a.purchaseDate.getTime() - b.purchaseDate.getTime() ||
          a.purchaseNumber.localeCompare(b.purchaseNumber),
      );

    for (const batch of openBatches) {
      if (remaining.lte(0)) break;

      const due = new Prisma.Decimal(batch.totalAmount).minus(batch.paymentMade);
      if (due.lte(0)) continue;

      const applied = Prisma.Decimal.min(due, remaining);
      const paymentMadeAfter = new Prisma.Decimal(batch.paymentMade).plus(applied);
      const dueAfter = new Prisma.Decimal(batch.totalAmount).minus(paymentMadeAfter);

      await tx.purchase.updateMany({
        where: { supplier_id: supplierId, purchase_number: batch.purchaseNumber },
        data: {
          payment_made: paymentMadeAfter,
          payment_status: dueAfter.lte(0)
            ? 'PAID'
            : paymentMadeAfter.gt(0)
              ? 'PARTIAL'
              : 'PENDING',
        },
      });

      batch.paymentMade = asNumber(paymentMadeAfter);
      remaining = remaining.minus(applied);
    }

    return remaining;
  }

  private async getTotalPaymentMadeOnPurchases(
    tx: SupplierTxClient,
    supplierId: string,
  ): Promise<number> {
    const batches = await this.getPurchaseBatchSummaries(tx, supplierId);
    return [...batches.values()]
      .filter((b) => b.paymentMethod === 'CREDIT')
      .reduce((sum, b) => sum + b.paymentMade, 0);
  }

  private async reconcilePurchasePayments(tx: SupplierTxClient, supplierId: string) {
    const [paymentAgg, totalOnPurchases] = await Promise.all([
      tx.supplierLedger.aggregate({
        where: { supplier_id: supplierId, entry_type: SupplierLedgerEntryType.PAYMENT_MADE },
        _sum: { amount: true },
      }),
      this.getTotalPaymentMadeOnPurchases(tx, supplierId),
    ]);

    const totalPayments = Number(paymentAgg._sum.amount ?? 0);
    const unallocated = totalPayments - totalOnPurchases;

    if (unallocated > 0.009) {
      await this.applyPaymentFifo(tx, supplierId, unallocated);
    }
  }

  private recalculateRunningBalances(tx: SupplierTxClient, supplierId: string) {
    return supplierLedgerBalanceEngine.recalculateRunningBalances(tx, supplierId);
  }

  private async reapplyAllPaymentAllocations(tx: SupplierTxClient, supplierId: string) {
    const batches = await this.getPurchaseBatchSummaries(tx, supplierId);
    for (const batch of batches.values()) {
      await tx.purchase.updateMany({
        where: { supplier_id: supplierId, purchase_number: batch.purchaseNumber },
        data: { payment_made: 0, payment_status: 'PENDING' },
      });
    }

    const payments = await tx.supplierLedger.findMany({
      where: { supplier_id: supplierId, entry_type: SupplierLedgerEntryType.PAYMENT_MADE },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    for (const payment of payments) {
      let remaining = new Prisma.Decimal(payment.amount);
      const purchaseRef = payment.purchase_id?.trim();

      if (purchaseRef) {
        const batch = batches.get(purchaseRef);
        if (batch) {
          const dueBefore = batch.totalAmount - batch.paymentMade;
          if (dueBefore > 0.009) {
            const applied = Prisma.Decimal.min(new Prisma.Decimal(dueBefore), remaining);
            const paymentMadeAfter = new Prisma.Decimal(batch.paymentMade).plus(applied);
            const dueAfter = new Prisma.Decimal(batch.totalAmount).minus(paymentMadeAfter);

            await tx.purchase.updateMany({
              where: { supplier_id: supplierId, purchase_number: batch.purchaseNumber },
              data: {
                payment_made: paymentMadeAfter,
                payment_status: dueAfter.lte(0)
                  ? 'PAID'
                  : paymentMadeAfter.gt(0)
                    ? 'PARTIAL'
                    : 'PENDING',
              },
            });

            batch.paymentMade = asNumber(paymentMadeAfter);
            remaining = remaining.minus(applied);
          }
        }
      }

      if (remaining.gt(0)) {
        await this.applyPaymentFifo(tx, supplierId, remaining);
      }
    }
  }

  /** Backfill ledger entries from existing purchases without ledger rows. */
  async syncPurchasesToLedger(supplierId: string, createdBy?: string) {
    return prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true },
      });
      if (!supplier) throw new AppError(404, 'Supplier not found');

      const purchases = await tx.purchase.findMany({
        where: { supplier_id: supplierId },
        orderBy: [{ purchase_date: 'asc' }, { created_at: 'asc' }],
      });

      const groups = new Map<string, typeof purchases>();
      for (const p of purchases) {
        const key =
          p.purchase_number ??
          (p.invoice_ref
            ? `${p.invoice_ref}::${p.purchase_date.toISOString().slice(0, 10)}`
            : p.id);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
      }

      for (const [groupKey, lines] of groups) {
        const purchaseNumber = lines[0].purchase_number ?? groupKey;
        if (!lines[0].purchase_number) {
          await tx.purchase.updateMany({
            where: { id: { in: lines.map((l) => l.id) } },
            data: { purchase_number: purchaseNumber },
          });
        }

        const existing = await tx.supplierLedger.findFirst({
          where: {
            supplier_id: supplierId,
            purchase_id: purchaseNumber,
            entry_type: {
              in: [SupplierLedgerEntryType.CREDIT_PURCHASE, SupplierLedgerEntryType.CASH_PURCHASE],
            },
          },
        });
        if (existing) continue;

        const total = lines.reduce(
          (sum, l) => sum + this.purchaseLineTotal(l.quantity, l.cost_price),
          0,
        );
        if (total <= 0.009) continue;

        const method = lines[0].payment_method;
        const invoiceRef = lines[0].invoice_ref;
        const desc =
          method === 'CREDIT'
            ? `Credit purchase${invoiceRef ? ` - ${invoiceRef}` : ''} - ${purchaseNumber}`
            : `Cash purchase${invoiceRef ? ` - ${invoiceRef}` : ''} - ${purchaseNumber}`;

        if (method === 'CREDIT') {
          await supplierLedgerBalanceEngine.postCreditPurchase(tx, {
            supplierId,
            amount: total,
            purchaseId: purchaseNumber,
            createdBy: createdBy ?? lines[0].created_by,
            description: desc,
          });
        } else {
          await supplierLedgerBalanceEngine.postCashPurchase(tx, {
            supplierId,
            amount: total,
            purchaseId: purchaseNumber,
            createdBy: createdBy ?? lines[0].created_by,
            description: desc,
          });
        }
      }

      await this.recalculateRunningBalances(tx, supplierId);
    });
  }

  async recordPurchaseBatch({
    supplierId,
    purchaseNumber,
    totalAmount,
    paymentMethod,
    createdBy,
    invoiceRef,
  }: {
    supplierId: string;
    purchaseNumber: string;
    totalAmount: number;
    paymentMethod: string;
    createdBy: string;
    invoiceRef?: string;
  }) {
    if (totalAmount <= 0.009) return null;

    return prisma.$transaction(async (tx) => {
      const method = paymentMethod.toUpperCase();
      const desc =
        method === 'CREDIT'
          ? `Credit purchase${invoiceRef ? ` - ${invoiceRef}` : ''} - ${purchaseNumber}`
          : `Cash purchase${invoiceRef ? ` - ${invoiceRef}` : ''} - ${purchaseNumber}`;

      if (method === 'CREDIT') {
        return supplierLedgerBalanceEngine.postCreditPurchase(tx, {
          supplierId,
          amount: totalAmount,
          purchaseId: purchaseNumber,
          createdBy,
          description: desc,
        });
      }

      return supplierLedgerBalanceEngine.postCashPurchase(tx, {
        supplierId,
        amount: totalAmount,
        purchaseId: purchaseNumber,
        createdBy,
        description: desc,
      });
    });
  }

  async recordPayment({
    supplierId,
    amount,
    createdBy,
    description,
    referenceNo,
    purchaseId,
  }: {
    supplierId: string;
    amount: number;
    createdBy: string;
    description?: string;
    referenceNo?: string;
    purchaseId?: string;
  }) {
    if (amount <= 0) throw new AppError(400, 'Payment amount must be positive');

    return prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true },
      });
      if (!supplier) throw new AppError(404, 'Supplier not found');

      let resolvedPurchaseNumber: string | undefined;
      let remaining = new Prisma.Decimal(amount);

      if (purchaseId?.trim()) {
        const batches = await this.getPurchaseBatchSummaries(tx, supplierId);
        const batch =
          batches.get(purchaseId.trim()) ??
          [...batches.values()].find((b) => b.invoiceRef === purchaseId.trim());

        if (!batch) {
          throw new AppError(404, 'Purchase invoice not found for this supplier');
        }

        const dueBefore = batch.totalAmount - batch.paymentMade;
        if (dueBefore <= 0.009) {
          throw new AppError(
            409,
            `Purchase ${batch.purchaseNumber} is already fully settled`,
          );
        }

        const appliedToPurchase = Prisma.Decimal.min(
          new Prisma.Decimal(dueBefore),
          remaining,
        );
        const paymentMadeAfter = new Prisma.Decimal(batch.paymentMade).plus(appliedToPurchase);
        const dueAfter = new Prisma.Decimal(batch.totalAmount).minus(paymentMadeAfter);

        await tx.purchase.updateMany({
          where: { supplier_id: supplierId, purchase_number: batch.purchaseNumber },
          data: {
            payment_made: paymentMadeAfter,
            payment_status: dueAfter.lte(0)
              ? 'PAID'
              : paymentMadeAfter.gt(0)
                ? 'PARTIAL'
                : 'PENDING',
          },
        });

        resolvedPurchaseNumber = batch.purchaseNumber;
        remaining = remaining.minus(appliedToPurchase);
      }

      if (remaining.gt(0)) {
        await this.applyPaymentFifo(tx, supplierId, remaining);
      }

      const entry = await supplierLedgerBalanceEngine.postPayment(tx, {
        supplierId,
        amount,
        createdBy,
        description:
          description ??
          (resolvedPurchaseNumber
            ? `Payment made against ${resolvedPurchaseNumber}`
            : 'Payment made to supplier'),
        referenceNo: referenceNo?.trim() || resolvedPurchaseNumber,
        purchaseId: resolvedPurchaseNumber,
      });

      const newBalance = await supplierLedgerBalanceEngine.getRunningBalance(tx, supplierId);
      return { entry, newBalance };
    });
  }

  private assertEntryEditable(entry: { entry_type: SupplierLedgerEntryType }) {
    if (
      entry.entry_type === SupplierLedgerEntryType.CREDIT_PURCHASE ||
      entry.entry_type === SupplierLedgerEntryType.CASH_PURCHASE
    ) {
      throw new AppError(
        409,
        'Purchase entries cannot be edited here. Update or delete the purchase from Purchase History instead.',
      );
    }
    if (entry.entry_type === SupplierLedgerEntryType.REFUND) {
      throw new AppError(
        409,
        'Refund entries cannot be edited here. Manage the related return record instead.',
      );
    }
  }

  async updateLedgerEntry({
    supplierId,
    entryId,
    amount,
    description,
    referenceNo,
    date,
    direction,
    updatedBy,
  }: {
    supplierId: string;
    entryId: string;
    amount?: number;
    description?: string;
    referenceNo?: string;
    date?: Date;
    direction?: 'debit' | 'credit';
    updatedBy: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const entry = await tx.supplierLedger.findFirst({
        where: { id: entryId, supplier_id: supplierId },
      });
      if (!entry) throw new AppError(404, 'Ledger entry not found');

      this.assertEntryEditable(entry);

      const updateData: Prisma.SupplierLedgerUpdateInput = {};

      if (description !== undefined) {
        updateData.description = description.trim() || null;
      }
      if (referenceNo !== undefined) {
        updateData.reference_no = referenceNo.trim() || null;
      }
      if (date !== undefined) {
        if (Number.isNaN(date.getTime())) throw new AppError(400, 'Invalid date');
        updateData.created_at = date;
      }
      if (amount !== undefined) {
        if (amount <= 0) throw new AppError(400, 'Amount must be positive');
        updateData.amount = new Prisma.Decimal(amount);
        if (entry.entry_type === SupplierLedgerEntryType.ADJUSTMENT) {
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
        entry.entry_type === SupplierLedgerEntryType.ADJUSTMENT &&
        (direction === 'debit' || direction === 'credit')
      ) {
        updateData.reference_no = direction === 'debit' ? 'DEBIT' : 'CREDIT';
      }

      const updated = await tx.supplierLedger.update({
        where: { id: entryId },
        data: updateData,
      });

      await this.recalculateRunningBalances(tx, supplierId);

      if (entry.entry_type === SupplierLedgerEntryType.PAYMENT_MADE) {
        await this.reapplyAllPaymentAllocations(tx, supplierId);
      }

      return { entry: updated };
    });
  }

  async deleteLedgerEntry({
    supplierId,
    entryId,
    deletedBy,
    reason,
  }: {
    supplierId: string;
    entryId: string;
    deletedBy: string;
    reason?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const entry = await tx.supplierLedger.findFirst({
        where: { id: entryId, supplier_id: supplierId },
      });
      if (!entry) throw new AppError(404, 'Ledger entry not found');

      this.assertEntryEditable(entry);

      const allEntries = await tx.supplierLedger.findMany({
        where: { supplier_id: supplierId },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      });
      const entryIndex = allEntries.findIndex((e) => e.id === entryId);
      const prevBalance = entryIndex > 0 ? Number(allEntries[entryIndex - 1].balance_after) : 0;
      const signedDelta = this.computeSignedDelta(entry, prevBalance);
      const deletedAmount = Number(entry.amount);
      const deletedDescription = entry.description;
      const deletedType = entry.entry_type;

      await tx.supplierLedger.delete({ where: { id: entryId } });

      const runningBalance = await this.recalculateRunningBalances(tx, supplierId);

      if (entry.entry_type === SupplierLedgerEntryType.PAYMENT_MADE) {
        await this.reapplyAllPaymentAllocations(tx, supplierId);
      }

      if (Math.abs(signedDelta) > 0.009) {
        await tx.supplierLedger.create({
          data: {
            supplier_id: supplierId,
            entry_type: SupplierLedgerEntryType.ADJUSTMENT,
            amount: new Prisma.Decimal(Math.abs(signedDelta)),
            description:
              reason?.trim() ||
              `Deleted ${deletedType.toLowerCase().replace(/_/g, ' ')}${
                deletedDescription ? `: ${deletedDescription}` : ''
              } (${deletedAmount.toLocaleString()} reversed)`,
            purchase_id: entry.purchase_id,
            reference_no: 'AUDIT',
            balance_after: runningBalance,
            created_by: deletedBy,
          },
        });
      }

      return { deletedEntryId: entryId };
    });
  }

  async getSupplierLedger({
    supplierId,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  }: {
    supplierId: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: {
        id: true,
        name: true,
        phone_number: true,
        mobile_number: true,
        email: true,
        outstanding_balance: true,
        code: true,
      },
    });
    if (!supplier) throw new AppError(404, 'Supplier not found');

    await this.syncPurchasesToLedger(supplierId);

    await prisma.$transaction(async (tx) => {
      await this.reconcilePurchasePayments(tx, supplierId);
      await supplierLedgerBalanceEngine.recalculateRunningBalances(tx, supplierId);
    });

    const refreshedSupplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: {
        id: true,
        name: true,
        phone_number: true,
        mobile_number: true,
        email: true,
        outstanding_balance: true,
        code: true,
      },
    });
    if (!refreshedSupplier) throw new AppError(404, 'Supplier not found');

    const where: Prisma.SupplierLedgerWhereInput = {
      supplier_id: supplierId,
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
    const [total, rawEntries, allEntries, purchaseLines, purchaseOrderCount, paymentRecords] =
      await Promise.all([
      prisma.supplierLedger.count({ where }),
      prisma.supplierLedger.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.supplierLedger.findMany({
        where: { supplier_id: supplierId },
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          entry_type: true,
          amount: true,
          balance_after: true,
          reference_no: true,
          description: true,
        },
      }),
      prisma.purchase.findMany({
        where: { supplier_id: supplierId },
        orderBy: { purchase_date: 'desc' },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              ProductImage: {
                where: { is_active: true },
                take: 1,
                select: { image: true },
              },
            },
          },
        },
      }),
      prisma.purchaseOrder.count({ where: { supplier_id: supplierId } }),
      prisma.supplierLedger.findMany({
        where: { supplier_id: supplierId, entry_type: SupplierLedgerEntryType.PAYMENT_MADE },
        orderBy: { created_at: 'desc' },
      }),
      ]);

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

    let totalPurchases = 0;
    let totalPayments = 0;
    for (const e of allEntries) {
      const amt = Number(e.amount);
      if (e.entry_type === 'CREDIT_PURCHASE') totalPurchases += amt;
      else if (e.entry_type === 'PAYMENT_MADE') totalPayments += amt;
    }

    const batchSummaries = new Map<string, PurchaseBatchSummary>();
    for (const line of purchaseLines) {
      const key = line.purchase_number ?? line.id;
      const lineTotal = this.purchaseLineTotal(line.quantity, line.cost_price);
      const existing = batchSummaries.get(key);
      if (existing) {
        existing.totalAmount += lineTotal;
        existing.paymentMade = Math.max(existing.paymentMade, asNumber(line.payment_made));
      } else {
        batchSummaries.set(key, {
          purchaseNumber: line.purchase_number ?? line.id,
          totalAmount: lineTotal,
          paymentMade: asNumber(line.payment_made),
          paymentStatus: line.payment_status,
          paymentMethod: line.payment_method,
          invoiceRef: line.invoice_ref,
          purchaseDate: line.purchase_date,
        });
      }
    }

    const purchaseRefs = [
      ...new Set(rawEntries.map((e) => e.purchase_id).filter(Boolean)),
    ] as string[];

    const purchasesByRef: Record<string, PurchaseBatchSummary> = {};
    for (const batch of batchSummaries.values()) {
      purchasesByRef[batch.purchaseNumber] = batch;
      if (batch.invoiceRef) purchasesByRef[batch.invoiceRef] = batch;
    }
    for (const ref of purchaseRefs) {
      if (!purchasesByRef[ref]) {
        const batch = batchSummaries.get(ref);
        if (batch) purchasesByRef[ref] = batch;
      }
    }

    const entries = rawEntries.map((e) => {
      const purchaseInfo = e.purchase_id ? purchasesByRef[e.purchase_id] : null;
      const isCreditPurchase = e.entry_type === 'CREDIT_PURCHASE';
      const isCashPurchase = e.entry_type === 'CASH_PURCHASE';
      const isPurchaseEntry = isCreditPurchase || isCashPurchase;

      const invoiceTotal =
        isPurchaseEntry && purchaseInfo ? Number(purchaseInfo.totalAmount) : 0;
      const invoicePaid =
        isCreditPurchase && purchaseInfo
          ? Number(purchaseInfo.paymentMade)
          : isCashPurchase
            ? invoiceTotal
            : 0;
      const invoiceDue =
        isCreditPurchase && purchaseInfo ? Math.max(0, invoiceTotal - invoicePaid) : 0;

      const amounts = debitCreditById.get(e.id) ?? { debit: 0, credit: 0 };
      const isRefund = e.entry_type === 'REFUND';

      return {
        id: e.id,
        date: e.created_at.toISOString(),
        type: e.entry_type,
        description: e.description ?? '',
        reference_no: e.reference_no ?? purchaseInfo?.invoiceRef ?? null,
        debit: amounts.debit,
        credit: amounts.credit,
        balance: runningBalances.get(e.id) ?? Number(e.balance_after),
        amount: Number(e.amount),
        invoiceTotal,
        invoicePaid,
        invoiceDue,
        purchaseId: purchaseInfo?.purchaseNumber ?? e.purchase_id ?? null,
        paymentStatus: purchaseInfo?.paymentStatus ?? null,
        isPayable: isCreditPurchase && invoiceDue > 0.009,
        isEditable: !isPurchaseEntry && !isRefund,
        isDeletable: !isPurchaseEntry && !isRefund,
        editRestrictedReason: isPurchaseEntry
          ? 'Edit or delete this from Purchase History'
          : isRefund
            ? 'Manage from Returns & Exchanges'
            : null,
        payment_method: isPurchaseEntry ? (isCashPurchase ? 'CASH' : 'CREDIT') : null,
      };
    });

    const productMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        sku: string | null;
        imageUrl: string | null;
        totalQuantity: number;
        totalAmount: number;
        purchaseCount: number;
        lastPurchaseDate: string;
        lastRate: number;
      }
    >();

    const purchaseDetails = purchaseLines.map((line) => {
      const qty = asNumber(line.quantity);
      const rate = asNumber(line.cost_price);
      const lineTotal = qty * rate;
      const productId = line.product.id;
      const imageUrl = line.product.ProductImage?.[0]?.image ?? null;

      const agg = productMap.get(productId);
      if (agg) {
        agg.totalQuantity += qty;
        agg.totalAmount += lineTotal;
        agg.purchaseCount += 1;
        if (line.purchase_date.toISOString() > agg.lastPurchaseDate) {
          agg.lastPurchaseDate = line.purchase_date.toISOString();
          agg.lastRate = rate;
        }
        if (!agg.imageUrl && imageUrl) agg.imageUrl = imageUrl;
      } else {
        productMap.set(productId, {
          productId,
          productName: line.product.name,
          sku: line.product.sku,
          imageUrl,
          totalQuantity: qty,
          totalAmount: lineTotal,
          purchaseCount: 1,
          lastPurchaseDate: line.purchase_date.toISOString(),
          lastRate: rate,
        });
      }

      return {
        id: line.id,
        purchaseNumber: line.purchase_number,
        invoiceRef: line.invoice_ref,
        productId,
        productName: line.product.name,
        sku: line.product.sku,
        quantity: qty,
        costPrice: rate,
        lineTotal,
        purchaseDate: line.purchase_date.toISOString(),
        paymentStatus: line.payment_status,
      };
    });

    const currentBalance = Number(refreshedSupplier.outstanding_balance);
    const purchaseHistoryTotal = purchaseLines.reduce(
      (sum, line) => sum + this.purchaseLineTotal(line.quantity, line.cost_price),
      0,
    );

    const purchaseInvoices = [...batchSummaries.values()]
      .sort((a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime())
      .map((batch) => ({
        purchaseNumber: batch.purchaseNumber,
        invoiceRef: batch.invoiceRef,
        purchaseDate: batch.purchaseDate.toISOString(),
        totalAmount: batch.totalAmount,
        paymentMade: batch.paymentMade,
        paymentDue: Math.max(0, batch.totalAmount - batch.paymentMade),
        paymentStatus: batch.paymentStatus,
        paymentMethod: batch.paymentMethod,
      }));

    const payments = paymentRecords.map((p) => ({
      id: p.id,
      date: p.created_at.toISOString(),
      amount: Number(p.amount),
      referenceNo: p.reference_no,
      purchaseId: p.purchase_id,
      description: p.description ?? '',
    }));

    const trendsMap = new Map<string, { month: string; purchases: number; payments: number }>();
    const monthKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    for (const line of purchaseLines) {
      const key = monthKey(line.purchase_date);
      const row = trendsMap.get(key) ?? { month: key, purchases: 0, payments: 0 };
      row.purchases += this.purchaseLineTotal(line.quantity, line.cost_price);
      trendsMap.set(key, row);
    }
    for (const p of paymentRecords) {
      const key = monthKey(p.created_at);
      const row = trendsMap.get(key) ?? { month: key, purchases: 0, payments: 0 };
      row.payments += Number(p.amount);
      trendsMap.set(key, row);
    }
    const trends = [...trendsMap.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);

    const paymentStatus = this.derivePaymentStatus(
      currentBalance,
      totalPurchases,
      totalPayments,
    );

    return {
      supplier: refreshedSupplier,
      entries,
      purchaseDetails,
      purchaseInvoices,
      payments,
      trends,
      productSummary: [...productMap.values()].sort(
        (a, b) => b.totalAmount - a.totalAmount,
      ),
      summary: {
        totalPurchases,
        totalPayments,
        totalDebits,
        totalCredits,
        currentBalance,
        balanceDue: Math.max(0, currentBalance),
        advanceBalance: Math.max(0, -currentBalance),
        purchaseHistoryTotal,
        purchaseOrderCount,
        productCount: productMap.size,
        paymentStatus,
      },
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private derivePaymentStatus(
    outstanding: number,
    totalPurchases: number,
    totalPaid: number,
  ): 'PAID' | 'PARTIAL' | 'DUE' | 'ADVANCE' | 'NONE' {
    if (totalPurchases <= 0.009 && Math.abs(outstanding) <= 0.009) return 'NONE';
    if (outstanding < -0.009) return 'ADVANCE';
    if (outstanding <= 0.009) return 'PAID';
    if (totalPaid > 0.009) return 'PARTIAL';
    return 'DUE';
  }

  async listSupplierSummaries({ search }: { search?: string } = {}) {
    const where: Prisma.SupplierWhereInput = {};
    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { code: { contains: search.trim(), mode: 'insensitive' } },
        { phone_number: { contains: search.trim(), mode: 'insensitive' } },
        { mobile_number: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        phone_number: true,
        mobile_number: true,
        email: true,
        status: true,
        is_active: true,
        display_on_pos: true,
        outstanding_balance: true,
        created_at: true,
        _count: { select: { products: true } },
      },
    });

    if (suppliers.length === 0) return [];

    const supplierIds = suppliers.map((s) => s.id);

    const [purchases, paymentGroups] = await Promise.all([
      prisma.purchase.findMany({
        where: { supplier_id: { in: supplierIds } },
        select: {
          supplier_id: true,
          quantity: true,
          cost_price: true,
          purchase_date: true,
        },
      }),
      prisma.supplierLedger.groupBy({
        by: ['supplier_id'],
        where: {
          supplier_id: { in: supplierIds },
          entry_type: SupplierLedgerEntryType.PAYMENT_MADE,
        },
        _sum: { amount: true },
      }),
    ]);

    const paymentBySupplier = new Map(
      paymentGroups.map((g) => [g.supplier_id, Number(g._sum.amount ?? 0)]),
    );

    const statsBySupplier = new Map<
      string,
      { totalPurchases: number; lastPurchaseDate: Date | null }
    >();

    for (const p of purchases) {
      const lineTotal = this.purchaseLineTotal(p.quantity, p.cost_price);
      const existing = statsBySupplier.get(p.supplier_id);
      if (existing) {
        existing.totalPurchases += lineTotal;
        if (!existing.lastPurchaseDate || p.purchase_date > existing.lastPurchaseDate) {
          existing.lastPurchaseDate = p.purchase_date;
        }
      } else {
        statsBySupplier.set(p.supplier_id, {
          totalPurchases: lineTotal,
          lastPurchaseDate: p.purchase_date,
        });
      }
    }

    return suppliers.map((s) => {
      const stats = statsBySupplier.get(s.id);
      const totalPurchases = stats?.totalPurchases ?? 0;
      const totalPaid = paymentBySupplier.get(s.id) ?? 0;
      const outstanding = Number(s.outstanding_balance);
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        phone_number: s.phone_number,
        mobile_number: s.mobile_number,
        email: s.email,
        status: s.status,
        is_active: s.is_active,
        display_on_pos: s.display_on_pos,
        outstanding_balance: outstanding,
        product_count: s._count.products,
        created_at: s.created_at,
        totalPurchases,
        totalPaid,
        lastPurchaseDate: stats?.lastPurchaseDate?.toISOString() ?? null,
        paymentStatus: this.derivePaymentStatus(outstanding, totalPurchases, totalPaid),
      };
    });
  }

  async getPayablesSummary() {
    const result = await prisma.supplier.aggregate({
      _sum: { outstanding_balance: true },
      where: { outstanding_balance: { gt: 0 } },
    });

    const topCreditors = await prisma.supplier.findMany({
      where: { outstanding_balance: { gt: 0 } },
      select: {
        id: true,
        name: true,
        phone_number: true,
        outstanding_balance: true,
        code: true,
      },
      orderBy: { outstanding_balance: 'desc' },
      take: 10,
    });

    return {
      totalOutstanding: result._sum.outstanding_balance ?? new Prisma.Decimal(0),
      topCreditors,
    };
  }
}

export default SupplierLedgerService;
