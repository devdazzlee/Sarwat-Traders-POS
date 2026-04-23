import { z } from 'zod';

export const createEmployeeSchema = z.object({
  body: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    phone_number: z.string().optional(),
    cnic: z.string().optional(),
    gender: z.string().optional(),
    join_date: z.string().datetime(),
    employee_type_id: z.string().uuid(),
  }),
});

export const updateEmployeeSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone_number: z.string().optional(),
    cnic: z.string().optional(),
    gender: z.string().optional(),
    join_date: z.string().datetime().optional(),
    employee_type_id: z.string().uuid().optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const deleteEmployeeSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const listEmployeeSchema = z.object({
  query: z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
  }),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>['body'];

export const createEmployeeTypeSchema = z.object({
  body: z.object({
    name: z.string().min(2),
  }),
});

export const updateEmployeeTypeSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    is_active: z.boolean().optional(),
  }),
});