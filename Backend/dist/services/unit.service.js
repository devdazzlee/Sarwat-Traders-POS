"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnitService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
class UnitService {
    async createUnit(data) {
        const [existingUnit, lastUnit] = await Promise.all([
            client_1.prisma.unit.findFirst({
                where: {
                    name: data.name,
                },
            }),
            client_1.prisma.unit.findFirst({
                orderBy: { created_at: 'desc' },
                select: { code: true },
            }),
        ]);
        if (existingUnit)
            throw new apiError_1.AppError(400, 'Unit already exists');
        const newCode = lastUnit ? (parseInt(lastUnit.code) + 1).toString() : '1000';
        const unit = await client_1.prisma.unit.create({
            data: {
                ...data,
                code: newCode
            },
        });
        return unit;
    }
    async getUnitById(id) {
        const unit = await client_1.prisma.unit.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true },
                },
            },
        });
        if (!unit)
            throw new apiError_1.AppError(404, 'Unit not found');
        return unit;
    }
    async updateUnit(id, data) {
        await this.getUnitById(id);
        return client_1.prisma.unit.update({
            where: { id },
            data,
        });
    }
    async listUnits({ page = 1, limit = 10, search, is_active, display_on_pos = true, }) {
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
        const [units, total] = await Promise.all([
            client_1.prisma.unit.findMany({
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
            client_1.prisma.unit.count({ where }),
        ]);
        return {
            data: units.map(u => ({
                ...u,
                product_count: u._count.products,
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
exports.UnitService = UnitService;
//# sourceMappingURL=unit.service.js.map