"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BranchService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const date_fns_1 = require("date-fns");
class BranchService {
    async createBranch(data) {
        const lastBranch = await client_1.prisma.branch.findFirst({
            orderBy: {
                created_at: 'desc',
            },
        });
        const code = lastBranch ? (parseInt(lastBranch.code) + 1).toString() : '1000';
        const branch = await client_1.prisma.branch.create({
            data: {
                ...data,
                code,
            },
        });
        return branch;
    }
    async getBranchById(id) {
        const branch = await client_1.prisma.branch.findUnique({
            where: {
                id,
            },
        });
        if (!branch) {
            throw new apiError_1.AppError(404, 'Branch not found');
        }
        return branch;
    }
    async updateBranch(id, data) {
        const branch = await client_1.prisma.branch.findUnique({
            where: {
                id,
            },
        });
        if (!branch) {
            throw new apiError_1.AppError(404, 'Branch not found');
        }
        const updatedBranch = await client_1.prisma.branch.update({
            where: {
                id,
            },
            data,
        });
        return updatedBranch;
    }
    async toggleBranchStatus(id) {
        // Check if branch exists
        const branch = await client_1.prisma.branch.findUnique({ where: { id } });
        if (!branch) {
            throw new apiError_1.AppError(404, 'Branch not found');
        }
        // Toggle the is_active status
        const updatedBranch = await client_1.prisma.branch.update({
            where: { id },
            data: { is_active: !branch.is_active },
        });
        console.log('Updated Branch:', updatedBranch, 'is_active:', updatedBranch.is_active, branch);
        return updatedBranch;
    }
    async listBranches({ page = 1, limit = 10, search, is_active = true, fetch_all, }) {
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (is_active !== undefined) {
            where.is_active = is_active;
        }
        const take = fetch_all ? 1000 : limit;
        const skip = fetch_all ? 0 : (page - 1) * limit;
        const [total, branches] = await Promise.all([
            client_1.prisma.branch.count({ where }),
            client_1.prisma.branch.findMany({
                where,
                skip,
                take,
                orderBy: {
                    created_at: 'desc',
                },
            }),
        ]);
        return {
            data: branches,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async getBranchDetails(branchId) {
        const today = new Date();
        const branch = await client_1.prisma.branch.findUnique({
            where: { id: branchId },
            include: {
                employees: {
                    where: { is_active: true },
                    include: {
                        employee_type: true,
                    },
                },
                sales: {
                    where: {
                        sale_date: {
                            gte: (0, date_fns_1.startOfDay)(today),
                            lte: (0, date_fns_1.endOfDay)(today),
                        },
                    },
                    select: {
                        id: true,
                        sale_number: true,
                        total_amount: true,
                        sale_date: true,
                        payment_method: true,
                        status: true,
                    },
                },
            },
        });
        if (!branch) {
            throw new Error('Branch not found');
        }
        return branch;
    }
}
exports.BranchService = BranchService;
//# sourceMappingURL=branch.service.js.map