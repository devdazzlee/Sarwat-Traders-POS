import { prisma } from '../prisma/client';
import { CreateExpenseInput } from '../validations/expense.validation';
import { AppError } from '../utils/apiError';

export class ExpenseService {
    async createExpense(data: CreateExpenseInput) {
        return await prisma.expense.create({ data });
    }

    async listExpenses({ page = 1, limit = 10 }: { page?: number; limit?: number }) {
        const [expenses, total] = await Promise.all([
            prisma.expense.findMany({
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { created_at: 'desc' },
            }),
            prisma.expense.count(),
        ]);

        return {
            data: expenses,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async create(data: { name: string }) {
        return prisma.employeeType.create({ data });
    }

    async getAll() {
        return prisma.employeeType.findMany();
    }

    async getById(id: string) {
        return prisma.employeeType.findUniqueOrThrow({ where: { id } });
    }

    async update(id: string, data: { name?: string; is_active?: boolean }) {
        return prisma.employeeType.update({ where: { id }, data });
    }

    async delete(id: string) {
        const DEFAULT_DESIGNATION = 'General';

        const employeeType = await prisma.employeeType.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { employees: true },
                },
            },
        });

        if (!employeeType) {
            throw new AppError(404, 'Designation not found');
        }

        await prisma.$transaction(async (tx) => {
            if (employeeType._count.employees > 0) {
                let fallbackId: string;

                if (employeeType.name !== DEFAULT_DESIGNATION) {
                    let general = await tx.employeeType.findFirst({
                        where: { name: DEFAULT_DESIGNATION, id: { not: id } },
                    });
                    if (!general) {
                        general = await tx.employeeType.create({
                            data: { name: DEFAULT_DESIGNATION },
                        });
                    }
                    fallbackId = general.id;
                } else {
                    const other = await tx.employeeType.findFirst({
                        where: { id: { not: id } },
                        orderBy: { name: 'asc' },
                    });
                    if (other) {
                        fallbackId = other.id;
                    } else {
                        const staff = await tx.employeeType.create({
                            data: { name: 'Staff' },
                        });
                        fallbackId = staff.id;
                    }
                }

                await tx.employee.updateMany({
                    where: { employee_type_id: id },
                    data: { employee_type_id: fallbackId },
                });
            }

            await tx.employeeType.delete({ where: { id } });
        });

        return { message: 'Designation deleted successfully' };
    }
}
