import { Prisma, LedgerEntryType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';

class CustomerLedgerService {
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
  }: {
    customerId: string;
    amount: number;
    createdBy: string;
    description?: string;
    referenceNo?: string;
  }) {
    if (amount <= 0) throw new AppError(400, 'Payment amount must be positive');

    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true, outstanding_balance: true },
      });
      if (!customer) throw new AppError(404, 'Customer not found');

      const newBalance = new Prisma.Decimal(customer.outstanding_balance).minus(amount);
      const finalBalance = newBalance.lt(0) ? new Prisma.Decimal(0) : newBalance;

      await tx.customer.update({
        where: { id: customerId },
        data: { outstanding_balance: finalBalance },
      });

      const entry = await tx.customerLedger.create({
        data: {
          customer_id: customerId,
          entry_type: LedgerEntryType.PAYMENT_RECEIVED,
          amount: new Prisma.Decimal(amount),
          description: description ?? 'Payment received',
          reference_no: referenceNo,
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

    // Fetch sale numbers for entries that have sale_id
    const saleIds = rawEntries.map((e) => e.sale_id).filter(Boolean) as string[];
    const salesMap: Record<string, { sale_number: string; payment_method: string }> = {};
    if (saleIds.length > 0) {
      const sales = await prisma.sale.findMany({
        where: { id: { in: saleIds } },
        select: { id: true, sale_number: true, payment_method: true },
      });
      for (const s of sales) {
        salesMap[s.id] = { sale_number: s.sale_number, payment_method: s.payment_method };
      }
    }

    // Map entries to a frontend-friendly shape
    const entries = rawEntries.map((e) => {
      const saleInfo = e.sale_id ? salesMap[e.sale_id] : null;
      return {
        id: e.id,
        date: e.created_at.toISOString(),
        type: e.entry_type,
        description: e.description ?? '',
        reference_no: e.reference_no ?? saleInfo?.sale_number ?? null,
        debit: e.entry_type === 'CREDIT_SALE' ? Number(e.amount) : 0,
        credit: e.entry_type === 'PAYMENT_RECEIVED' ? Number(e.amount) : 0,
        balance: Number(e.balance_after),
        payment_method: saleInfo?.payment_method ?? null,
      };
    });

    return {
      customer,
      entries,
      summary: {
        totalSales,
        totalPayments,
        currentBalance: Number(customer.outstanding_balance),
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
