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
        name: zod_1.z.string().min(1, 'Name is required').optional(),
        phone_number: zod_1.z
            .string()
            .min(10, 'Phone number must be at least 10 digits')
            .max(15, 'Phone number must be at most 15 digits')
            .optional(),
        address: zod_1.z.string().min(1, 'Address is required').optional(),
        billing_address: zod_1.z.string().min(1, 'Billing address is required').optional(),
    }),
});
exports.customerUpdateSchema = customerUpdateSchema;
//# sourceMappingURL=customer.validation.js.map