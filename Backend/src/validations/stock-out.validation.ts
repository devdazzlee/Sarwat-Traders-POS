import { z } from 'zod';

export const logStockOutSchema = z.object({
  body: z.object({
    productId: z.string().min(1, 'Product is required'),
    branchId: z.string().min(1, 'Branch is required'),
    quantity: z.number().positive('Quantity must be positive'),
    reason: z.enum(['SALE', 'DAMAGE', 'LOSS', 'RETURN', 'EXPIRED']),
    notes: z.string().optional(),
  }),
});

export const logReturnSchema = z.object({
  body: z.object({
    productId: z.string().min(1, 'Product is required'),
    branchId: z.string().min(1, 'Branch is required'),
    quantity: z.number().positive('Quantity must be positive'),
    notes: z.string().optional(),
  }),
});
