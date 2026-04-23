import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { addDecimal, asNumber } from '../utils/helpers';

const STOCK_OUT_TYPES = ['SALE', 'DAMAGE', 'LOSS', 'RETURN', 'EXPIRED'] as const;
type StockOutReason = (typeof STOCK_OUT_TYPES)[number];

export class StockOutService {
  async logStockOut(data: {
    productId: string;
    branchId: string;
    quantity: number;
    reason: StockOutReason;
    notes?: string;
    createdBy: string;
  }) {
    if (data.quantity <= 0) {
      throw new AppError(400, 'Quantity must be greater than 0');
    }
    if (!STOCK_OUT_TYPES.includes(data.reason)) {
      throw new AppError(400, 'Invalid stock out reason');
    }

    return prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findUnique({
        where: {
          product_id_branch_id: {
            product_id: data.productId,
            branch_id: data.branchId,
          },
        },
      });

      if (!stock) throw new AppError(404, 'Stock not found');

      const currentQty = asNumber(stock.current_quantity);
      if (currentQty < data.quantity) {
        throw new AppError(400, 'Insufficient stock to remove');
      }

      const newQty = addDecimal(stock.current_quantity, -data.quantity);

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

  async logReturn(data: {
    productId: string;
    branchId: string;
    quantity: number;
    notes?: string;
    createdBy: string;
  }) {
    if (data.quantity <= 0) {
      throw new AppError(400, 'Quantity must be greater than 0');
    }

    return prisma.$transaction(async (tx) => {
      let stock = await tx.stock.findUnique({
        where: {
          product_id_branch_id: {
            product_id: data.productId,
            branch_id: data.branchId,
          },
        },
      });

      let previousQty = 0;
      let newQty: number | Prisma.Decimal = data.quantity;

      if (stock) {
        previousQty = asNumber(stock.current_quantity);
        newQty = addDecimal(stock.current_quantity, data.quantity);
        await tx.stock.update({
          where: {
            product_id_branch_id: {
              product_id: data.productId,
              branch_id: data.branchId,
            },
          },
          data: { current_quantity: newQty },
        });
      } else {
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
          new_qty: typeof newQty === 'number' ? newQty : asNumber(newQty),
          notes: data.notes || 'Return - Stock re-added',
          created_by: data.createdBy,
        },
      });

      return { newQty, success: true };
    });
  }
}
