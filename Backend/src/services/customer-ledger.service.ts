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
        select: { entry_type: true, amount: true },
      }),
    ]);

    // Compute summary from all entries (not just this page)
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
      const invoiceDue =
        e.entry_type === 'CREDIT_SALE' && saleInfo
          ? Math.max(0, invoiceTotal - invoicePaid)
          : 0;

      return {
        id: e.id,
        date: e.created_at.toISOString(),
        type: e.entry_type,
        description: e.description ?? '',
        reference_no: e.reference_no ?? saleInfo?.sale_number ?? null,
        debit: e.entry_type === 'CREDIT_SALE' ? Number(e.amount) : 0,
        credit: e.entry_type === 'PAYMENT_RECEIVED' ? Number(e.amount) : 0,
        balance: Number(e.balance_after),
        invoiceTotal,
        invoicePaid,
        invoiceDue,
        saleId: saleInfo?.id ?? null,
        paymentStatus: saleInfo?.payment_status ?? null,
        isCollectable: e.entry_type === 'CREDIT_SALE' && invoiceDue > 0.009,
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
