"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupplierService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
class SupplierService {
    async createSupplier(data) {
        const [existingSupplier, lastSupplier] = await Promise.all([
            client_1.prisma.supplier.findFirst({
                where: {
                    name: data.name,
                },
            }),
            client_1.prisma.supplier.findFirst({
                orderBy: { created_at: 'desc' },
                select: { code: true },
            }),
        ]);
        if (existingSupplier)
            throw new apiError_1.AppError(400, 'Supplier already exists');
        const newCode = lastSupplier ? (parseInt(lastSupplier.code) + 1).toString() : '1000';
        const supplier = await client_1.prisma.supplier.create({
            data: {
                ...data,
                code: newCode
            },
        });
        return supplier;
    }
    async getSupplierById(id) {
        const supplier = await client_1.prisma.supplier.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true },
                },
            },
        });
        if (!supplier)
            throw new apiError_1.AppError(404, 'Supplier not found');
        return supplier;
    }
    async updateSupplier(id, data) {
        await this.getSupplierById(id); // Verify exists
        return client_1.prisma.supplier.update({
            where: { id },
            data,
        });
    }
    async toggleSupplierStatus(id) {
        const supplier = await this.getSupplierById(id);
        const newStatus = supplier.status === 'active' ? 'inactive' : 'active';
        return client_1.prisma.supplier.update({
            where: { id },
            data: { status: newStatus },
        });
    }
    async listSuppliers({ page = 1, limit = 10, search, is_active = true, display_on_pos = true, }) {
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { phone_number: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (is_active !== undefined) {
            where.is_active = is_active;
        }
        if (display_on_pos !== undefined) {
            where.display_on_pos = display_on_pos;
        }
        const [suppliers, total] = await Promise.all([
            client_1.prisma.supplier.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    _count: {
                        select: { products: true },
                    },
                },
            }),
            client_1.prisma.supplier.count({ where }),
        ]);
        return {
            data: suppliers.map(s => ({
                ...s,
                product_count: s._count.products,
                _count: undefined,
            })),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}
exports.SupplierService = SupplierService;
//# sourceMappingURL=supplier.service.js.map