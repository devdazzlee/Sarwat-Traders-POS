"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColorService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
class ColorService {
    async createColor(data) {
        const [existingColor, lastColor] = await Promise.all([
            client_1.prisma.color.findFirst({
                where: {
                    name: data.name,
                },
            }),
            client_1.prisma.color.findFirst({
                orderBy: { created_at: 'desc' },
                select: { code: true },
            }),
        ]);
        if (existingColor)
            throw new apiError_1.AppError(400, 'Color already exists');
        const newCode = lastColor ? (parseInt(lastColor.code) + 1).toString() : '1000';
        const color = await client_1.prisma.color.create({
            data: {
                ...data,
                code: newCode
            },
        });
        return color;
    }
    async getColorById(id) {
        const color = await client_1.prisma.color.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true },
                },
            },
        });
        if (!color)
            throw new apiError_1.AppError(404, 'Color not found');
        return color;
    }
    async updateColor(id, data) {
        await this.getColorById(id); // Verify exists
        return client_1.prisma.color.update({
            where: { id },
            data,
        });
    }
    async listColors({ page = 1, limit = 10, search, }) {
        const where = {};
        if (search) {
            // Use OR condition for search
            where.AND = [
                { is_active: true }, // Only active colors
                {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { code: { contains: search, mode: 'insensitive' } },
                    ],
                },
            ];
        }
        const [colors, total] = await Promise.all([
            client_1.prisma.color.findMany({
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
            client_1.prisma.color.count({ where }),
        ]);
        return {
            data: colors.map(c => ({
                ...c,
                product_count: c._count.products,
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
exports.ColorService = ColorService;
//# sourceMappingURL=color.service.js.map