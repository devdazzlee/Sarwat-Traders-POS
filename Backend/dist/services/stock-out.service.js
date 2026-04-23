"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockOutService = void 0;
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const helpers_1 = require("../utils/helpers");
const STOCK_OUT_TYPES = ['SALE', 'DAMAGE', 'LOSS', 'RETURN', 'EXPIRED'];
class StockOutService {
    async logStockOut(data) {
        if (data.quantity <= 0) {
            throw new apiError_1.AppError(400, 'Quantity must be greater than 0');
        }
        if (!STOCK_OUT_TYPES.includes(data.reason)) {
            throw new apiError_1.AppError(400, 'Invalid stock out reason');
        }
        return client_1.prisma.$transaction(async (tx) => {
            const stock = await tx.stock.findUnique({
                where: {
                    product_id_branch_id: {
                        product_id: data.productId,
                        branch_id: data.branchId,
                    },
                },
            });
            if (!stock)
                throw new apiError_1.AppError(404, 'Stock not found');
            const currentQty = (0, helpers_1.asNumber)(stock.current_quantity);
            if (currentQty < data.quantity) {
                throw new apiError_1.AppError(400, 'Insufficient stock to remove');
            }
            const newQty = (0, helpers_1.addDecimal)(stock.current_quantity, -data.quantity);
            await tx.stock.update({
                where: {
                    product_id_branch_id: {
                        product_id: data.productId,
                        branch_id: data.branchId,
                    },
                },
                data: { current_quantity: newQty },
            });
            await tx.stockMovement.create({
                data: {
                    product_id: data.productId,
                    branch_id: data.branchId,
                    movement_type: data.reason,
                    quantity_change: -data.quantity,
                    previous_qty: stock.current_quantity,
                    new_qty: newQty,
                    notes: data.notes || `${data.reason} - Stock out`,
                    created_by: data.createdBy,
                },
            });
            return { newQty, success: true };
        });
    }
    async logReturn(data) {
        if (data.quantity <= 0) {
            throw new apiError_1.AppError(400, 'Quantity must be greater than 0');
        }
        return client_1.prisma.$transaction(async (tx) => {
            let stock = await tx.stock.findUnique({
                where: {
                    product_id_branch_id: {
                        product_id: data.productId,
                        branch_id: data.branchId,
                    },
                },
            });
            let previousQty = 0;
            let newQty = data.quantity;
            if (stock) {
                previousQty = (0, helpers_1.asNumber)(stock.current_quantity);
                newQty = (0, helpers_1.addDecimal)(stock.current_quantity, data.quantity);
                await tx.stock.update({
                    where: {
                        product_id_branch_id: {
                            product_id: data.productId,
                            branch_id: data.branchId,
                        },
                    },
                    data: { current_quantity: newQty },
                });
            }
            else {
                await tx.stock.create({
                    data: {
                        product_id: data.productId,
                        branch_id: data.branchId,
                        current_quantity: data.quantity,
                    },
                });
            }
            await tx.stockMovement.create({
                data: {
                    product_id: data.productId,
                    branch_id: data.branchId,
                    movement_type: 'RETURN',
                    quantity_change: data.quantity,
                    previous_qty: previousQty,
                    new_qty: typeof newQty === 'number' ? newQty : (0, helpers_1.asNumber)(newQty),
                    notes: data.notes || 'Return - Stock re-added',
                    created_by: data.createdBy,
                },
            });
            return { newQty, success: true };
        });
    }
}
exports.StockOutService = StockOutService;
//# sourceMappingURL=stock-out.service.js.map