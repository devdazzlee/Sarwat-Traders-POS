"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSuppliersSchema = exports.getSupplierSchema = exports.updateSupplierSchema = exports.createSupplierSchema = void 0;
const zod_1 = require("zod");
const supplierBaseSchema = {
    name: zod_1.z.string().min(1, 'Name is required').max(100),
    phone_number: zod_1.z.string().optional(),
    fax_number: zod_1.z.string().optional(),
    mobile_number: zod_1.z.string().optional(),
    country: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    email: zod_1.z.string().email('Invalid email format').optional(),
    ntn: zod_1.z.string().optional(),
    strn: zod_1.z.string().optional(),
    gov_id: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    display_on_pos: zod_1.z.boolean().optional().default(true),
};
exports.createSupplierSchema = zod_1.z.object({
    body: zod_1.z.object(supplierBaseSchema),
});
exports.updateSupplierSchema = zod_1.z.object({
    body: zod_1.z.object({
        ...supplierBaseSchema,
        name: supplierBaseSchema.name.optional(),
    }),
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Supplier ID is required'),
    }),
});
exports.getSupplierSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().min(1, 'Supplier ID is required'),
    }),
});
exports.listSuppliersSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.string().optional().default('1'),
        limit: zod_1.z.string().optional().default('10'),
        search: zod_1.z.string().optional(),
        status: zod_1.z.string().optional(),
    }),
});
//# sourceMappingURL=supplier.validation.js.map