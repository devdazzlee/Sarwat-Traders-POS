"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logReturnSchema = exports.logStockOutSchema = void 0;
const zod_1 = require("zod");
exports.logStockOutSchema = zod_1.z.object({
    body: zod_1.z.object({
        productId: zod_1.z.string().min(1, 'Product is required'),
        branchId: zod_1.z.string().min(1, 'Branch is required'),
        quantity: zod_1.z.number().positive('Quantity must be positive'),
        reason: zod_1.z.enum(['SALE', 'DAMAGE', 'LOSS', 'RETURN', 'EXPIRED']),
        notes: zod_1.z.string().optional(),
    }),
});
exports.logReturnSchema = zod_1.z.object({
    body: zod_1.z.object({
        productId: zod_1.z.string().min(1, 'Product is required'),
        branchId: zod_1.z.string().min(1, 'Branch is required'),
        quantity: zod_1.z.number().positive('Quantity must be positive'),
        notes: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=stock-out.validation.js.map