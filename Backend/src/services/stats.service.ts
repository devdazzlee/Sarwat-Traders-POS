import { LedgerEntryType, Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";

export class StatsService {
    private saleBaseWhere(branchId?: string, past24Hours?: Date): Prisma.SaleWhereInput {
        return {
            status: "COMPLETED",
            ...(past24Hours ? { created_at: { gte: past24Hours } } : {}),
            ...(branchId && branchId !== "Not Found" ? { branch_id: branchId } : {}),
        };
    }
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
            where: this.saleBaseWhere(branchId, past24Hours),
            select: {
                id: true,
                total_amount: true,
                sale_number: true,
                status: true,
                payment_method: true,
                sale_date: true,
                created_at: true,
                customer: {
                    select: {
                        name: true,
                        email: true,
                    },
                },
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
            where: this.saleBaseWhere(branchId, past24Hours),
        });
        return revenue._sum.total_amount ? Number(revenue._sum.total_amount) : 0;
    }

    private async dailyCredit(branchId?: string) {
        const past24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const credit = await prisma.sale.aggregate({
            _sum: { total_amount: true },
            where: {
                ...this.saleBaseWhere(branchId, past24Hours),
                payment_method: "CREDIT",
            },
        });
        return credit._sum.total_amount ? Number(credit._sum.total_amount) : 0;
    }

    private async dailyCash(branchId?: string) {
        const past24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const cash = await prisma.sale.aggregate({
            _sum: { total_amount: true },
            where: {
                ...this.saleBaseWhere(branchId, past24Hours),
                payment_method: { in: ["CASH", "CARD"] },
            },
        });
        return cash._sum.total_amount ? Number(cash._sum.total_amount) : 0;
    }

    private collectionsWhere(startDate?: Date, endDate?: Date): Prisma.CustomerLedgerWhereInput {
        const past24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const start = startDate ?? past24Hours;
        const end = endDate ?? new Date();

        return {
            entry_type: LedgerEntryType.PAYMENT_RECEIVED,
            created_at: {
                gte: start,
                lte: end,
            },
        };
    }

    private async dailyCollections(startDate?: Date, endDate?: Date) {
        const collections = await prisma.customerLedger.aggregate({
            _sum: { amount: true },
            where: this.collectionsWhere(startDate, endDate),
        });
        return collections._sum.amount ? Number(collections._sum.amount) : 0;
    }

    async getCollectionEntries({
        startDate,
        endDate,
        search,
    }: {
        startDate?: Date;
        endDate?: Date;
        search?: string;
    }) {
        const rows = await prisma.customerLedger.findMany({
            where: this.collectionsWhere(startDate, endDate),
            select: {
                id: true,
                amount: true,
                description: true,
                reference_no: true,
                created_at: true,
                customer: {
                    select: {
                        id: true,
                        name: true,
                        phone_number: true,
                    },
                },
            },
            orderBy: { created_at: "desc" },
        });

        if (!search?.trim()) return rows;

        const q = search.trim().toLowerCase();
        return rows.filter((row) => {
            const haystack = [
                row.customer?.name,
                row.customer?.phone_number,
                row.description,
                row.reference_no,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return haystack.includes(q);
        });
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
        const [totalCustomers, lowStockProducts, todaySales, dailyRevenue, dailyCredit, dailyCash, dailyCollections, dailyExpense] = await Promise.all([
            this.totalCustomers(branchId),
            this.lowStockProducts(branchId),
            this.todaySales(branchId),
            this.dailyRevenue(branchId),
            this.dailyCredit(branchId),
            this.dailyCash(branchId),
            this.dailyCollections(),
            this.dailyExpense(branchId),
        ]);

        const cashReceived = dailyCash + dailyCollections;

        return {
            totalCustomers,
            lowStockProducts,
            todaySales,
            dailyRevenue,
            dailyCredit,
            dailyCash,
            dailyCollections,
            dailyCashReceived: cashReceived,
            dailyExpense,
        };
    }
}