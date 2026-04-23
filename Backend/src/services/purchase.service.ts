import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { addDecimal, asNumber } from '../utils/helpers';
import { Prisma } from '@prisma/client';

export class PurchaseService {
  async createBulkPurchase(data: {
    supplierId: string;
    warehouseBranchId: string;
    purchaseDate: Date;
    invoiceRef?: string;
    notes?: string;
    deliveryStatus: "PARTIAL" | "COMPLETE";
    items: Array<{
      productId: string;
      quantity: number;
      costPrice: number;
      salePrice: number;
      batchNo?: string;
      expiryDate?: string;
    }>;
    createdBy: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const results = [];
      for (const item of data.items) {
        const purchase = await tx.purchase.create({
          data: {
            product_id: item.productId,
            supplier_id: data.supplierId,
            warehouse_branch_id: data.warehouseBranchId,
            quantity: item.quantity,
            cost_price: item.costPrice,
            sale_price: item.salePrice,
            purchase_date: data.purchaseDate,
            invoice_ref: data.invoiceRef,
            batch_no: item.batchNo,
            expiry_date: item.expiryDate ? new Date(item.expiryDate) : null,
            notes: data.notes,
            delivery_status: data.deliveryStatus,
            created_by: data.createdBy,
          },
        });

        // Update Stock
        let stock = await tx.stock.findUnique({
          where: { product_id_branch_id: { product_id: item.productId, branch_id: data.warehouseBranchId } },
        });

        const qty = item.quantity;
        const previousQty = stock ? asNumber(stock.current_quantity) : 0;
        const newQty = stock ? addDecimal(stock.current_quantity, qty) : qty;

        if (stock) {
          await tx.stock.update({
            where: { product_id_branch_id: { product_id: item.productId, branch_id: data.warehouseBranchId } },
            data: { current_quantity: newQty },
          });
        } else {
          await tx.stock.create({
            data: {
              product_id: item.productId,
              branch_id: data.warehouseBranchId,
              current_quantity: qty,
            },
          });
        }

        // Create Stock Movement
        await tx.stockMovement.create({
          data: {
            product_id: item.productId,
            branch_id: data.warehouseBranchId,
            movement_type: "PURCHASE",
            reference_id: purchase.id,
            reference_type: "purchase",
            quantity_change: qty,
            previous_qty: previousQty,
            new_qty: typeof newQty === "number" ? newQty : asNumber(newQty as Prisma.Decimal),
            unit_cost: item.costPrice,
            notes: data.notes,
            created_by: data.createdBy,
          },
        });

        // Update Product Cost Rate
        await tx.product.update({
          where: { id: item.productId },
          data: { 
            purchase_rate: item.costPrice,
            sales_rate_exc_dis_and_tax: item.salePrice
          }
        });

        results.push(purchase);
      }
      return results;
    });
  }

  async listPurchases(params: {
    page?: number;
    limit?: number;
    productId?: string;
    supplierId?: string;
    branchId?: string;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseWhereInput = {};
    if (params.productId) where.product_id = params.productId;
    if (params.supplierId) where.supplier_id = params.supplierId;
    if (params.branchId) where.warehouse_branch_id = params.branchId;
    if (params.userId) where.created_by = params.userId;
    if (params.startDate || params.endDate) {
      where.purchase_date = {};
      if (params.startDate) where.purchase_date.gte = params.startDate;
      if (params.endDate) where.purchase_date.lte = params.endDate;
    }

    const [total, purchases] = await Promise.all([
      prisma.purchase.count({ where }),
      prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { purchase_date: 'desc' },
        include: {
          product: true,
          supplier: true,
          warehouse_branch: true,
          user: { select: { email: true } },
        },
      }),
    ]);

    return {
      data: purchases,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getPurchaseById(id: string) {
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        product: true,
        supplier: true,
        warehouse_branch: true,
        user: { select: { email: true } },
      },
    });
    if (!purchase) throw new AppError(404, 'Purchase not found');
    return purchase;
  }

  async getMonthlyStats(warehouseBranchId?: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const where: Prisma.PurchaseWhereInput = {
      purchase_date: { gte: startOfMonth },
    };
    if (warehouseBranchId) where.warehouse_branch_id = warehouseBranchId;

    const purchases = await prisma.purchase.findMany({
      where,
      include: { product: true },
    });

    const totalQuantity = purchases.reduce(
      (sum, p) => sum + asNumber(p.quantity),
      0
    );
    const totalValue = purchases.reduce(
      (sum, p) => sum + asNumber(p.quantity) * asNumber(p.cost_price),
      0
    );

    return {
      totalPurchases: purchases.length,
      totalQuantity,
      totalValue,
    };
  }
}
