"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerUpdateSchema = exports.customerLoginSchema = exports.cusRegisterationSchema = void 0;
const zod_1 = require("zod");
const cusRegisterationSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Invalid email address'),
    }),
});
exports.cusRegisterationSchema = cusRegisterationSchema;
const customerLoginSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Invalid email address'),
        password: zod_1.z.string().min(6, 'Password must be at least 6 characters long'),
    }),
});
exports.customerLoginSchema = customerLoginSchema;
const customerUpdateSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('Invalid email address').optional(),
        name: zod_1.z.string().optional().nullish(),
        phone_number: zod_1.z
            .string()
            .max(15, 'Phone number must be at most 15 digits')
            .optional()
            .nullish(),
        address: zod_1.z.string().optional().nullish(),
        billing_address: zod_1.z.string().optional().nullish(),
        credit_limit: zod_1.z.number().optional().nullish(),
    }),
});
exports.customerUpdateSchema = customerUpdateSchema;
//# sourceMappingURL=customer.validation.js.map