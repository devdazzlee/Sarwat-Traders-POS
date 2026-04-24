import { prisma } from "../prisma/client";

export class StatsService {
    private async totalCustomers(branchId?: string) {
        const total = await prisma.customer.count();
        return total;
    }

    private async lowStockProducts(branchId?: string) {
        const lowStock = await prisma.stock.findMany({
            where: {
                current_quantity: {
                    lt: 10,
                },
                product: {
                    is_active: true,
                },
                ...(branchId && branchId !== "Not Found" ? { branch_id: branchId } : {})
            },
            select: {
                id: true,
                current_quantity: true,
                product_id: true,
                product: {
                    select: {
                        name: true,
                        sku: true,
                        is_active: true,
                    },
                },
            },
        });
        return lowStock;
    }

    private async todaySales(branchId?: string) {
        const past24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const sales = await prisma.sale.findMany({
            where: {
                created_at: {
                    gte: past24Hours,
                },
                ...(branchId && branchId !== "Not Found" ? { branch_id: branchId } : {})
            },
            select: {
                id: true,
                total_amount: true,
                sale_number: true,
                status: true,
                created_at: true,
            },
            orderBy: {
                created_at: "desc",
            },
        });

        return sales;
    }

    private async dailyRevenue(branchId?: string) {
        const past24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const revenue = await prisma.sale.aggregate({
            _sum: { total_amount: true },
            where: {
                created_at: { gte: past24Hours },
                ...(branchId && branchId !== "Not Found" ? { branch_id: branchId } : {})
            }
        });
        return revenue._sum.total_amount ? Number(revenue._sum.total_amount) : 0;
    }

    private async dailyCredit(branchId?: string) {
        const past24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const credit = await prisma.sale.aggregate({
            _sum: { total_amount: true },
            where: {
                payment_method: 'CREDIT',
                created_at: { gte: past24Hours },
                ...(branchId && branchId !== "Not Found" ? { branch_id: branchId } : {})
            }
        });
        return credit._sum.total_amount ? Number(credit._sum.total_amount) : 0;
    }

    private async dailyExpense(branchId?: string) {
        const past24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const expenses = await prisma.expense.aggregate({
            _sum: { amount: true },
            where: {
                created_at: { gte: past24Hours },
                ...(branchId && branchId !== "Not Found" ? { cashflow: { branch_id: branchId } } : {})
            }
        });
        return expenses._sum.amount ? Number(expenses._sum.amount) : 0;
    }

    public async getDashboardStats(branchId?: string) {
        const [totalCustomers, lowStockProducts, todaySales, dailyRevenue, dailyCredit, dailyExpense] = await Promise.all([
            this.totalCustomers(branchId),
            this.lowStockProducts(branchId),
            this.todaySales(branchId),
            this.dailyRevenue(branchId),
            this.dailyCredit(branchId),
            this.dailyExpense(branchId),
        ]);

        return {
            totalCustomers,
            lowStockProducts,
            todaySales,
            dailyRevenue,
            dailyCredit,
            dailyExpense,
        };
    }
}