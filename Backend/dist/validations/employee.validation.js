"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateEmployeeTypeSchema = exports.createEmployeeTypeSchema = exports.listEmployeeSchema = exports.deleteEmployeeSchema = exports.updateEmployeeSchema = exports.createEmployeeSchema = void 0;
const zod_1 = require("zod");
exports.createEmployeeSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string(),
        email: zod_1.z.string().email().optional(),
        phone_number: zod_1.z.string().optional(),
        cnic: zod_1.z.string().optional(),
        gender: zod_1.z.string().optional(),
        join_date: zod_1.z.string().datetime(),
        employee_type_id: zod_1.z.string().uuid(),
    }),
});
exports.updateEmployeeSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().optional(),
        email: zod_1.z.string().email().optional(),
        phone_number: zod_1.z.string().optional(),
        cnic: zod_1.z.string().optional(),
        gender: zod_1.z.string().optional(),
        join_date: zod_1.z.string().datetime().optional(),
        employee_type_id: zod_1.z.string().uuid().optional(),
    }),
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
});
exports.deleteEmployeeSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid(),
    }),
});
exports.listEmployeeSchema = zod_1.z.object({
    query: zod_1.z.object({
        page: zod_1.z.coerce.number().optional(),
        limit: zod_1.z.coerce.number().optional(),
    }),
});
exports.createEmployeeTypeSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(2),
    }),
});
exports.updateEmployeeTypeSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(2).optional(),
        is_active: zod_1.z.boolean().optional(),
    }),
});
//# sourceMappingURL=employee.validation.js.map