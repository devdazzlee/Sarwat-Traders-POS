"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SizeService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
class SizeService {
    async createSize(data) {
        const [existingSize, lastSize] = await Promise.all([
            client_1.prisma.size.findFirst({
                where: {
                    name: data.name,
                },
            }),
            client_1.prisma.size.findFirst({
                orderBy: { created_at: 'desc' },
                select: { code: true },
            }),
        ]);
        if (existingSize)
            throw new apiError_1.AppError(400, 'Size already exists');
        const newCode = lastSize ? (parseInt(lastSize.code) + 1).toString() : '1000';
        const size = await client_1.prisma.size.create({
            data: {
                ...data,
                code: newCode
            },
        });
        return size;
    }
    async getSizeById(id) {
        const size = await client_1.prisma.size.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true },
                },
            },
        });
        if (!size)
            throw new apiError_1.AppError(404, 'Size not found');
        return size;
    }
    async updateSize(id, data) {
        await this.getSizeById(id);
        return client_1.prisma.size.update({
            where: { id },
            data,
        });
    }
    async listSizes({ page = 1, limit = 10, search, is_active, display_on_pos, }) {
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
        if (display_on_pos !== undefined) {
            where.display_on_pos = display_on_pos;
        }
        const [sizes, total] = await Promise.all([
            client_1.prisma.size.findMany({
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
            client_1.prisma.size.count({ where }),
        ]);
        return {
            data: sizes.map(s => ({
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
exports.SizeService = SizeService;
//# sourceMappingURL=size.service.js.map