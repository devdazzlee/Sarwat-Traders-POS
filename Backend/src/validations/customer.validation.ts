import { z } from "zod";

const cusRegisterationSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address'),
    }),
});

const customerLoginSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address'),
        password: z.string().min(6, 'Password must be at least 6 characters long'),
    }),
});

const customerUpdateSchema = z.object({
    body: z.object({
        name: z.string().min(1, 'Name is required').optional(),
        phone_number: z
            .string()
            .min(10, 'Phone number must be at least 10 digits')
            .max(15, 'Phone number must be at most 15 digits')
            .optional(),
        address: z.string().min(1, 'Address is required').optional(),
        billing_address: z.string().min(1, 'Billing address is required').optional(),
    }),
});

export {
    cusRegisterationSchema,
    customerLoginSchema,
    customerUpdateSchema,
}