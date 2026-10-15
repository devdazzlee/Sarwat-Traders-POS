import { prisma } from '../prisma/client';
import { Prisma } from '@prisma/client';

type ReportsQuery = {
  branchId?: string;
  userRole?: string;
  startDate?: Date;
  endDate?: Date;
  paymentMethod?: string;
  limit?: number;
};

function buildSaleWhere({
  branchId,
  userRole,
  startDate,
  endDate,
  paymentMethod,
}: Omit<ReportsQuery, 'limit'>): Prisma.SaleWhereInput {
  const where: Prisma.SaleWhereInput = {
    status: 'COMPLETED',
  };

  if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN' && branchId) {
    where.branch_id = branchId;
  }

  if (startDate || endDate) {
    where.sale_date = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  if (paymentMethod && paymentMethod !== 'ALL') {
    where.payment_method = paymentMethod as any;
  }

  return where;
}

export class ReportsService {
  /**
   * Get all sales for reports (admin sees all, branch users see only their branch)
   */
  async getSalesForReports(query: ReportsQuery) {
    const where = buildSaleWhere(query);

    return prisma.sale.findMany({
      where,
      include: {
        sale_items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
        customer: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
      orderBy: { sale_date: 'desc' },
    });
  }

  /**
   * Get best selling products
   */
  async getBestSellingProducts(query: ReportsQuery) {
    const saleWhere = buildSaleWhere(query);
    const where: Prisma.SaleItemWhereInput = {
      sale: saleWhere,
    };

    const products = await prisma.saleItem.groupBy({
      by: ['product_id'],
      where,
      _sum: {
        quantity: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: query.limit ?? 10,
    });

    const productIds = products.map((p) => p.product_id);
    const productDetails = await prisma.product.findMany({
      where: {
        id: { in: productIds },
      },
      include: {
        category: true,
      },
    });

    return products.map((item) => {
      const product = productDetails.find((p) => p.id === item.product_id);
      return {
        id: item.product_id,
        name: product?.name || 'Unknown',
        sku: product?.sku || '',
        quantity_sold: Number(item._sum.quantity || 0),
        order_count: item._count.id,
        price: Number(product?.sales_rate_inc_dis_and_tax || product?.sales_rate_exc_dis_and_tax || 0),
        purchase_rate: Number(product?.purchase_rate || 0),
        category: product?.category?.name || 'Uncategorized',
      };
    });
  }

  /**
   * Get dashboard stats for reports
   */
  async getReportsStats(query: ReportsQuery) {
    const where = buildSaleWhere(query);

    const [totalSales, totalRevenue, uniqueCustomers, salesForCogs] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.aggregate({
        where,
        _sum: {
          total_amount: true,
        },
      }),
      prisma.sale.findMany({
        where,
        select: {
          customer_id: true,
        },
        distinct: ['customer_id'],
      }),
      prisma.sale.findMany({
        where,
        select: {
          sale_items: {
            select: {
              quantity: true,
              product: { select: { purchase_rate: true } },
            },
          },
        },
      }),
    ]);

    let totalCogs = 0;
    salesForCogs.forEach((sale) => {
      sale.sale_items.forEach((item) => {
        totalCogs += Number(item.quantity || 0) * Number(item.product?.purchase_rate || 0);
      });
    });

    const revenueNum = Number(totalRevenue._sum.total_amount || 0);
    const grossMargin = revenueNum - totalCogs;

    return {
      totalSales,
      totalRevenue: revenueNum,
      totalCogs,
      grossMargin,
      uniqueCustomers: uniqueCustomers.filter((c) => c.customer_id).length,
    };
  }
}
