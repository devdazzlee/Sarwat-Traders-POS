import { Prisma, SaleItemType, SaleStatus, StockMovementType, LedgerEntryType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';

interface ReturnItem {
  productId: string;
  quantity: number;
  disposition?: 'RESTOCK' | 'DAMAGED' | 'UNSELLABLE';
}

interface ExchangeItem {
  productId: string;
  quantity: number;
  price: number;
}

interface HoldSaleCartItem {
  id: string;
  productId?: string;
  name: string;
  price: number;
  originalPrice?: number;
  actualUnitPrice?: number;
  quantity: number;
  category?: string;
  unitId?: string;
  unitName?: string;
  unit?: string;
}

class SaleService {
  /**
   * Sum of RETURN line quantities already posted against each original sale_item id
   * (from follow-up sales with original_sale_id pointing at the original sale).
   */
  private async getReturnedQtyByOriginalSaleLineIds(originalSaleId: string) {
    const prior = await prisma.sale.findMany({
      where: {
        original_sale_id: originalSaleId,
        status: { in: [SaleStatus.REFUNDED, SaleStatus.EXCHANGED] },
      },
      select: { sale_items: true },
    });
    const map = new Map<string, Prisma.Decimal>();
    for (const s of prior) {
      for (const si of s.sale_items) {
        if (si.item_type === SaleItemType.RETURN && si.ref_sale_item_id) {
          const q = si.quantity.abs();
          const k = si.ref_sale_item_id;
          map.set(k, (map.get(k) ?? new Prisma.Decimal(0)).plus(q));
        }
      }
    }
    return map;
  }

  /** For return/exchange rows with no customer, show the original sale's customer in lists. */
  private async hydrateReturnSaleCustomers<
    T extends {
      id: string;
      customer_id: string | null;
      customer: unknown;
      original_sale_id: string | null;
      status: SaleStatus;
    },
  >(sales: T[]): Promise<T[]> {
    const originalIds = [
      ...new Set(
        sales
          .filter(
            (s) =>
              (s.status === SaleStatus.REFUNDED || s.status === SaleStatus.EXCHANGED) &&
              !s.customer_id &&
              s.original_sale_id,
          )
          .map((s) => s.original_sale_id!),
      ),
    ];
    if (originalIds.length === 0) return sales;

    const originals = await prisma.sale.findMany({
      where: { id: { in: originalIds } },
      select: { id: true, customer: true },
    });
    const customerByOriginalId = new Map(originals.map((o) => [o.id, o.customer]));

    return sales.map((s) => {
      if (
        (s.status === SaleStatus.REFUNDED || s.status === SaleStatus.EXCHANGED) &&
        !s.customer_id &&
        s.original_sale_id
      ) {
        const c = customerByOriginalId.get(s.original_sale_id);
        if (c) return { ...s, customer: c } as T;
      }
      return s;
    });
  }

  async getSales({
    branchId,
    page,
    limit,
    search,
    startDate,
    endDate,
  }: {
    branchId?: string;
    page?: number;
    limit?: number;
    search?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: Prisma.SaleWhereInput = {
      ...(branchId ? { branch_id: branchId } : {}),
      ...(search
        ? {
            OR: [
              { sale_number: { contains: search, mode: 'insensitive' } },
              { customer: { email: { contains: search, mode: 'insensitive' } } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(startDate || endDate
        ? {
            sale_date: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    const include = {
      sale_items: {
        include: { product: true },
      },
      customer: true,
      branch: {
        select: {
          id: true,
          name: true,
          address: true,
        },
      },
    };

    // Backward-compatible behavior: when pagination is not requested, return all rows.
    if (!page || !limit) {
      const data = await prisma.sale.findMany({
        where,
        include,
        orderBy: { sale_date: 'desc' },
      });
      const hydrated = await this.hydrateReturnSaleCustomers(data);
      return {
        data: hydrated,
        meta: {
          total: hydrated.length,
          page: 1,
          limit: hydrated.length,
          totalPages: 1,
        },
      };
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Number(limit) || 10);
    const skip = (safePage - 1) * safeLimit;

    const [total, data] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        include,
        orderBy: { sale_date: 'desc' },
        skip,
        take: safeLimit,
      }),
    ]);

    const hydrated = await this.hydrateReturnSaleCustomers(data);
    return {
      data: hydrated,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  /**
   * For original (COMPLETED) sales: compute whether anything is still returnable and if a return/exchange
   * was already posted against this sale (for UI badges in Process Return dropdown).
   */
  private async getReturnProcessingFlagsForSales(
    sales: Array<{
      id: string;
      sale_items: Array<{ id: string; quantity: Prisma.Decimal; item_type: SaleItemType }>;
    }>,
  ): Promise<Map<string, { fully_returned: boolean; has_prior_returns: boolean }>> {
    const out = new Map<string, { fully_returned: boolean; has_prior_returns: boolean }>();
    const originalIds = sales.map((s) => s.id);
    if (originalIds.length === 0) return out;

    const childSales = await prisma.sale.findMany({
      where: {
        original_sale_id: { in: originalIds },
        status: { in: [SaleStatus.REFUNDED, SaleStatus.EXCHANGED] },
      },
      select: {
        original_sale_id: true,
        sale_items: {
          select: { item_type: true, ref_sale_item_id: true, quantity: true },
        },
      },
    });

    const returnedByLineByOriginal = new Map<string, Map<string, Prisma.Decimal>>();
    for (const id of originalIds) {
      returnedByLineByOriginal.set(id, new Map());
    }
    for (const c of childSales) {
      const oid = c.original_sale_id!;
      const m = returnedByLineByOriginal.get(oid)!;
      for (const si of c.sale_items) {
        if (si.item_type === SaleItemType.RETURN && si.ref_sale_item_id) {
          const k = si.ref_sale_item_id;
          const prev = m.get(k) ?? new Prisma.Decimal(0);
          m.set(k, prev.plus(si.quantity.abs()));
        }
      }
    }

    for (const sale of sales) {
      const lineMap = returnedByLineByOriginal.get(sale.id)!;
      const originalLines = sale.sale_items.filter((l) => l.item_type === SaleItemType.ORIGINAL);
      const lines = originalLines.length > 0 ? originalLines : sale.sale_items;

      const has_prior_returns = childSales.some((c) => c.original_sale_id === sale.id);

      if (lines.length === 0) {
        out.set(sale.id, { fully_returned: false, has_prior_returns });
        continue;
      }

      let anyReturnable = false;
      for (const line of lines) {
        if (originalLines.length > 0 && line.item_type !== SaleItemType.ORIGINAL) continue;
        const already = lineMap.get(line.id)?.toNumber() ?? 0;
        if (line.quantity.toNumber() - already > 0) {
          anyReturnable = true;
          break;
        }
      }

      out.set(sale.id, {
        fully_returned: !anyReturnable,
        has_prior_returns,
      });
    }

    return out;
  }

  async getSalesForReturns({ branchId, search }: { branchId?: string; search?: string }) {
    const normalizedSearch = search?.replace(/\s+/g, ' ').trim();

    const sales = await prisma.sale.findMany({
      where: {
        branch_id: branchId,
        status: 'COMPLETED', // Only completed sales can be returned
        ...(normalizedSearch
          ? {
              OR: [
                { sale_number: { contains: normalizedSearch, mode: 'insensitive' } },
                { customer: { name: { contains: normalizedSearch, mode: 'insensitive' } } },
                { customer: { email: { contains: normalizedSearch, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        sale_items: {
          include: { product: true },
        },
        customer: true,
      },
      orderBy: { sale_date: 'desc' },
      take: 100,
    });

    const flags = await this.getReturnProcessingFlagsForSales(
      sales.map((s) => ({
        id: s.id,
        sale_items: s.sale_items.map((it) => ({
          id: it.id,
          quantity: it.quantity,
          item_type: it.item_type,
        })),
      })),
    );

    return sales.map((s) => {
      const f = flags.get(s.id) ?? { fully_returned: false, has_prior_returns: false };
      return {
        ...s,
        return_eligibility: {
          fully_returned: f.fully_returned,
          has_prior_returns: f.has_prior_returns,
        },
      };
    });
  }

  async getSaleById(saleId: string) {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        sale_items: {
          include: { product: true },
        },
        customer: true,
      },
    });
    if (!sale) throw new AppError(404, 'Sale not found');

    let original_sale: { id: string; sale_number: string } | null = null;
    if (sale.original_sale_id) {
      const orig = await prisma.sale.findUnique({
        where: { id: sale.original_sale_id },
        select: { id: true, sale_number: true },
      });
      if (orig) original_sale = orig;
    }

    if (sale.status !== SaleStatus.COMPLETED) {
      return { ...sale, original_sale };
    }

    const returnedMap = await this.getReturnedQtyByOriginalSaleLineIds(saleId);
    const saleItems = sale.sale_items.map((item) => {
      const already = returnedMap.get(item.id)?.toNumber() ?? 0;
      const origQty = item.quantity.toNumber();
      return {
        ...item,
        quantity_already_returned: already,
        quantity_returnable: Math.max(0, origQty - already),
      };
    });

    return { ...sale, sale_items: saleItems, original_sale };
  }

  async getHoldSales() {
    return prisma.holdSale.findMany({
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone_number: true,
            mobile_number: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async createHoldSale({
    customerId,
    createdBy,
    items,
  }: {
    customerId?: string;
    createdBy?: string;
    items: HoldSaleCartItem[];
  }) {
    if (!items?.length) {
      throw new AppError(400, 'No items provided for hold sale');
    }

    const normalizedItems = items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      price: Number(item.price),
      originalPrice: Number(item.originalPrice ?? item.price),
      actualUnitPrice: Number(item.actualUnitPrice ?? item.price),
      quantity: Number(item.quantity),
      category: item.category,
      unitId: item.unitId,
      unitName: item.unitName,
      unit: item.unit,
    }));

    const subtotal = normalizedItems.reduce(
      (sum, item) => sum + (item.actualUnitPrice || item.price) * item.quantity,
      0,
    );

    return prisma.holdSale.create({
      data: {
        customer_id: customerId,
        created_by: createdBy,
        items: normalizedItems as Prisma.InputJsonValue,
        subtotal: new Prisma.Decimal(subtotal),
        total_items: normalizedItems.length,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone_number: true,
            mobile_number: true,
          },
        },
      },
    });
  }

  async retrieveHoldSale({ holdSaleId }: { holdSaleId: string }) {
    return prisma.$transaction(async (tx) => {
      const holdSale = await tx.holdSale.findUnique({
        where: { id: holdSaleId },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone_number: true,
              mobile_number: true,
            },
          },
        },
      });

      if (!holdSale) {
        throw new AppError(404, 'Hold sale not found');
      }

      await tx.holdSale.delete({ where: { id: holdSaleId } });

      return holdSale;
    });
  }

  async deleteHoldSale({ holdSaleId }: { holdSaleId: string }) {
    const holdSale = await prisma.holdSale.findUnique({
      where: { id: holdSaleId },
      select: { id: true },
    });

    if (!holdSale) {
      throw new AppError(404, 'Hold sale not found');
    }

    await prisma.holdSale.delete({ where: { id: holdSaleId } });
  }

  async createSale({
    branchId,
    customerId,
    paymentMethod,
    items,
    discountAmount,
    createdBy,
    paidAmount,
  }: {
    branchId: string;
    customerId?: string;
    paymentMethod: string; // supports CASH, CARD, CREDIT
    items: Array<{ productId: string; quantity: number; price: number }>;
    discountAmount?: number;
    createdBy: string;
    paidAmount?: number; // for credit sales: amount actually paid upfront
  }) {
    const isCreditSale = paymentMethod === 'CREDIT';

    // Credit sales MUST have a customer
    if (isCreditSale && !customerId) {
      throw new AppError(400, 'A customer must be selected for credit sales');
    }

    // 1) Validate OUTSIDE any interactive transaction
    // Resolve effective branchId: use provided value, or fall back to the first available branch
    let effectiveBranchId = branchId;
    if (!effectiveBranchId) {
      const defaultBranch = await prisma.branch.findFirst({ select: { id: true } });
      if (defaultBranch) effectiveBranchId = defaultBranch.id;
    }

    const customer = customerId
      ? await prisma.customer.findUnique({ where: { id: customerId } })
      : null;
    if (customerId && !customer) throw new AppError(400, 'Invalid customer');
    if (!items.length) throw new AppError(400, 'No items provided');

    // Warn if over credit limit (but allow — per business decision)
    if (isCreditSale && customer) {
      const creditLimit = new Prisma.Decimal(customer.credit_limit);
      const currentBalance = new Prisma.Decimal(customer.outstanding_balance);
      const subtotalCheck = items.reduce((s, it) => s + it.price * it.quantity, 0);
      const finalTotalCheck = Math.max(0, subtotalCheck - (discountAmount ?? 0));
      const newBalance = currentBalance.plus(finalTotalCheck);
      if (creditLimit.gt(0) && newBalance.gt(creditLimit)) {
        // Over limit — allowed with warning (warn is logged server-side, frontend shows the flag)
        console.warn(`⚠️ Customer ${customer.name} exceeds credit limit: ${newBalance} > ${creditLimit}`);
      }
    }
  
    // 2) Validate that all products exist
    const productIds = items.map(i => i.productId);
    const uniqueProductIds = [...new Set(productIds)];
    const products = await prisma.product.findMany({
      where: { id: { in: uniqueProductIds } },
      select: { id: true },
    });
    const foundProductIds = new Set(products.map(p => p.id));
    const missingProductIds = uniqueProductIds.filter(id => !foundProductIds.has(id));
    if (missingProductIds.length > 0) {
      throw new AppError(400, `Products not found: ${missingProductIds.join(', ')}`);
    }
  
    // 3) Pre-fetch stock snapshot once
    const stocks = effectiveBranchId
      ? await prisma.stock.findMany({ where: { product_id: { in: productIds }, branch_id: effectiveBranchId } })
      : [];
    const stockMap = new Map(stocks.map(s => [s.product_id, s]));

    // 4) Group same product lines and compute movements in memory
    const grouped = items.reduce<Record<string, { productId: string; qty: Prisma.Decimal }>>(
      (acc, it) => {
        const key = it.productId;
        if (!acc[key]) acc[key] = { productId: it.productId, qty: new Prisma.Decimal(0) };
        acc[key].qty = acc[key].qty.plus(it.quantity);
        return acc;
      },
      {}
    );

    type MoveRow = {
      product_id: string;
      previous_qty: Prisma.Decimal;
      new_qty: Prisma.Decimal;
      quantity_change: Prisma.Decimal;
    };

    const movements: MoveRow[] = [];
    for (const gp of Object.values(grouped)) {
      const existing = stockMap.get(gp.productId);
      const prev = new Prisma.Decimal(existing?.current_quantity ?? 0);
      const change = gp.qty.mul(-1);
      const next = prev.plus(change);
      movements.push({ product_id: gp.productId, previous_qty: prev, new_qty: next, quantity_change: change });
      if (effectiveBranchId) {
        stockMap.set(gp.productId, { ...(existing ?? ({} as any)), product_id: gp.productId, branch_id: effectiveBranchId, current_quantity: next });
      }
    }
  
    // 5) Prepare all writes as a single non-interactive transaction
    const subtotalAmt = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const finalDiscount = discountAmount ?? 0;
    const finalTotal = Math.max(0, subtotalAmt - finalDiscount);
  
    const ops: Prisma.PrismaPromise<any>[] = [];
  
    // Determine payment_method and payment_status for DB
    const dbPaymentMethod = isCreditSale ? 'CREDIT' : paymentMethod as Prisma.SaleCreateInput['payment_method'];
    const saleNumber = `SALE-${Date.now()}`;

    // For credit sales: compute how much is actually paid vs going to credit
    const creditPaidAmount = isCreditSale ? Math.min(Math.max(0, paidAmount ?? 0), finalTotal) : finalTotal;
    const creditOwedAmount = isCreditSale ? finalTotal - creditPaidAmount : 0;
    const dbPaymentStatus = isCreditSale
      ? creditPaidAmount >= finalTotal ? 'PAID' : creditPaidAmount > 0 ? 'PARTIAL' : 'PENDING'
      : 'PAID';

    // Snapshot the customer's unpaid balance BEFORE this sale settles
    const previousBalanceSnapshot = customer
      ? new Prisma.Decimal(customer.outstanding_balance)
      : new Prisma.Decimal(0);

    // (a) Sale + items
    ops.push(
      prisma.sale.create({
        data: {
          sale_number: saleNumber,
          branch_id: effectiveBranchId ?? null,
          customer_id: customerId,
          total_amount: new Prisma.Decimal(finalTotal),
          subtotal: new Prisma.Decimal(subtotalAmt),
          discount_amount: new Prisma.Decimal(finalDiscount),
          payment_method: dbPaymentMethod,
          payment_status: dbPaymentStatus,
          payment_received: new Prisma.Decimal(creditPaidAmount),
          previous_balance: previousBalanceSnapshot,
          status: 'COMPLETED',
          created_by: createdBy,
          sale_items: {
            create: items.map((item) => ({
              product: { connect: { id: item.productId } },
              quantity: new Prisma.Decimal(item.quantity),
              unit_price: new Prisma.Decimal(item.price),
              line_total: new Prisma.Decimal(item.price).mul(item.quantity),
            })),
          },
        },
        include: { sale_items: true },
      })
    );
  
    // (b) Stock upserts — only if we have a branch to track stock against
    if (effectiveBranchId) {
      for (const m of movements) {
        const decAbs = m.quantity_change.abs();
        ops.push(
          prisma.stock.upsert({
            where: { product_id_branch_id: { product_id: m.product_id, branch_id: effectiveBranchId } },
            update: { current_quantity: { decrement: decAbs } },
            create: {
              product_id: m.product_id,
              branch_id: effectiveBranchId,
              current_quantity: m.new_qty,
              minimum_quantity: new Prisma.Decimal(0),
              maximum_quantity: new Prisma.Decimal(1000),
              reserved_quantity: new Prisma.Decimal(0),
            },
          })
        );
      }

      // (c) Stock movements
      for (const m of movements) {
        ops.push(
          prisma.stockMovement.create({
            data: {
              product_id: m.product_id,
              branch_id: effectiveBranchId,
              movement_type: 'SALE',
              quantity_change: m.quantity_change,
              previous_qty: m.previous_qty,
              new_qty: m.new_qty,
              created_by: createdBy,
            },
          })
        );
      }
    }

    // (d) Credit ledger entries — record credit owed + any upfront partial payment
    if (isCreditSale && customerId && customer && creditOwedAmount > 0) {
      const baseBalance = new Prisma.Decimal(customer.outstanding_balance);
      // After adding the full credit owed and subtracting any upfront payment
      const balanceAfterCredit = baseBalance.plus(creditOwedAmount);
      const finalBalance = creditPaidAmount > 0
        ? balanceAfterCredit.minus(creditPaidAmount)
        : balanceAfterCredit;

      // Single customer balance update (net effect)
      ops.push(
        prisma.customer.update({
          where: { id: customerId },
          data: { outstanding_balance: finalBalance },
        })
      );

      // CREDIT_SALE row: the full owed amount is debited against the customer
      ops.push(
        prisma.customerLedger.create({
          data: {
            customer_id: customerId,
            entry_type: LedgerEntryType.CREDIT_SALE,
            amount: new Prisma.Decimal(creditOwedAmount),
            description: creditPaidAmount > 0
              ? `Partial credit sale - ${saleNumber}`
              : `Credit sale - ${saleNumber}`,
            sale_id: saleNumber,
            balance_after: balanceAfterCredit,
            created_by: createdBy,
          },
        })
      );

      // PAYMENT_RECEIVED row: the upfront paid amount is credited back
      if (creditPaidAmount > 0) {
        ops.push(
          prisma.customerLedger.create({
            data: {
              customer_id: customerId,
              entry_type: LedgerEntryType.PAYMENT_RECEIVED,
              amount: new Prisma.Decimal(creditPaidAmount),
              description: `Upfront payment on ${saleNumber}`,
              sale_id: saleNumber,
              balance_after: finalBalance,
              created_by: createdBy,
            },
          })
        );
      }
    }
  
    const [sale] = await prisma.$transaction(ops);
    const saleResult = sale as Prisma.SaleGetPayload<{ include: { sale_items: true } }>;
    
    return saleResult;
  }
  

  async getTodaySales({ branchId }: { branchId?: string }) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    return prisma.sale.findMany({
      where: {
        branch_id: branchId,
        sale_date: {
          gte: start,
          lte: end,
        },
      },
      include: {
        customer: true,
      },
      orderBy: { sale_date: 'desc' },
    });
  }

  // async createExchangeOrReturnSale({
  //     originalSaleId,
  //     branchId,
  //     customerId,
  //     returnedItems,
  //     exchangedItems,
  //     createdBy
  // }: {
  //     originalSaleId: string,
  //     branchId: string,
  //     customerId?: string,
  //     returnedItems: { productId: string, quantity: number }[],
  //     exchangedItems: { productId: string, quantity: number, price: number }[],
  //     createdBy: string,
  // }) {
  //     return prisma.$transaction(async (tx) => {
  //         const originalSale = await tx.sale.findUnique({
  //             where: { id: originalSaleId },
  //             include: { sale_items: true },
  //         });
  //         if (!originalSale) throw new AppError(404, "Original sale not found");

  //         const productIds = [
  //             ...returnedItems.map(i => i.productId),
  //             ...exchangedItems.map(i => i.productId)
  //         ];

  //         const stocks = await tx.stock.findMany({
  //             where: { product_id: { in: productIds }, branch_id: branchId }
  //         });

  //         const saleItems: any[] = [];
  //         let total = 0;

  //         // Process Returns
  //         for (const ret of returnedItems) {
  //             const stock = stocks.find(s => s.product_id === ret.productId);
  //             if (!stock) throw new AppError(400, `Stock not found for product ${ret.productId}`);

  //             const originalItem = originalSale.sale_items.find(i => i.product_id === ret.productId);
  //             if (!originalItem) throw new AppError(400, `Product ${ret.productId} not in original sale`);

  //             if (ret.quantity > originalItem.quantity) {
  //                 throw new AppError(400, `Return quantity exceeds original`);
  //             }

  //             await tx.stock.update({
  //                 where: {
  //                     product_id_branch_id: {
  //                         product_id: ret.productId,
  //                         branch_id: branchId,
  //                     }
  //                 },
  //                 data: { current_quantity: { increment: ret.quantity } }
  //             });

  //             await tx.stockMovement.create({
  //                 data: {
  //                     product_id: ret.productId,
  //                     branch_id: branchId,
  //                     movement_type: "RETURN",
  //                     quantity_change: ret.quantity,
  //                     previous_qty: 0,
  //                     new_qty: 0,
  //                     created_by: createdBy,
  //                 },
  //             });

  //             const lineTotal = -(Number(originalItem.unit_price) * ret.quantity);
  //             total += lineTotal;

  //             saleItems.push({
  //                 product_id: ret.productId,
  //                 quantity: -ret.quantity,
  //                 unit_price: originalItem.unit_price,
  //                 line_total: lineTotal,
  //                 item_type: "RETURN",
  //                 ref_sale_item_id: originalItem.id
  //             });
  //         }

  //         // Process Exchanges
  //         for (const item of exchangedItems) {
  //             const stock = stocks.find(s => s.product_id === item.productId);
  //             if (!stock || stock.current_quantity < item.quantity) {
  //                 throw new AppError(400, `Insufficient stock for exchange product ${item.productId}`);
  //             }

  //             await tx.stock.update({
  //                 where: {
  //                     product_id_branch_id: {
  //                         product_id: item.productId,
  //                         branch_id: branchId,
  //                     }
  //                 },
  //                 data: { current_quantity: { decrement: item.quantity } }
  //             });

  //             await tx.stockMovement.create({
  //                 data: {
  //                     product_id: item.productId,
  //                     branch_id: branchId,
  //                     movement_type: "SALE",
  //                     quantity_change: -item.quantity,
  //                     previous_qty: stock.current_quantity,
  //                     new_qty: stock.current_quantity - item.quantity,
  //                     created_by: createdBy,
  //                 },
  //             });

  //             const lineTotal = item.price * item.quantity;
  //             total += lineTotal;

  //             saleItems.push({
  //                 product_id: item.productId,
  //                 quantity: item.quantity,
  //                 unit_price: item.price,
  //                 line_total: lineTotal,
  //                 item_type: "EXCHANGE"
  //             });
  //         }

  //         const sale = await tx.sale.create({
  //             data: {
  //                 sale_number: `SALE-${Date.now()}`,
  //                 branch_id: branchId,
  //                 customer_id: customerId,
  //                 original_sale_id: originalSaleId,
  //                 total_amount: total,
  //                 subtotal: total,
  //                 payment_method: "CASH",
  //                 payment_status: "PAID",
  //                 status: "COMPLETED",
  //                 created_by: createdBy,
  //                 sale_items: {
  //                     create: saleItems,
  //                 },
  //             },
  //             include: { sale_items: true },
  //         });

  //         return sale;
  //     });
  // }

  async createExchangeOrReturnSale({
    originalSaleId,
    branchId,
    customerId,
    returnedItems,
    exchangedItems,
    notes,
    createdBy,
    returnReason,
    refundMethod,
    orderScope,
  }: {
    originalSaleId: string;
    branchId: string;
    customerId?: string;
    returnedItems: ReturnItem[];
    exchangedItems: ExchangeItem[];
    notes?: string;
    createdBy: string;
    returnReason?: string;
    refundMethod?: string;
    orderScope?: string;
  }) {
    if (!returnedItems.length && !exchangedItems.length) {
      throw new AppError(400, 'No return or exchange items provided');
    }

    const uniqueProductIds = [...new Set([
      ...returnedItems.map((item) => item.productId),
      ...exchangedItems.map((item) => item.productId),
    ])];
    const uniqueExchangeProductIds = [...new Set(exchangedItems.map((item) => item.productId))];

    const [originalSale, branch, customer, exchangeProducts, stocks] = await Promise.all([
      prisma.sale.findUnique({
        where: { id: originalSaleId },
        include: { sale_items: true },
      }),
      prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true },
      }),
      customerId
        ? prisma.customer.findUnique({
            where: { id: customerId },
            select: { id: true },
          })
        : Promise.resolve(null),
      uniqueExchangeProductIds.length
        ? prisma.product.findMany({
            where: { id: { in: uniqueExchangeProductIds } },
            select: { id: true },
          })
        : Promise.resolve([] as Array<{ id: string }>),
      uniqueProductIds.length
        ? prisma.stock.findMany({
            where: {
              product_id: { in: uniqueProductIds },
              branch_id: branchId,
            },
          })
        : Promise.resolve([] as Array<{ product_id: string; current_quantity: Prisma.Decimal }>),
    ]);

    if (!originalSale) throw new AppError(400, 'Original sale not found');
    if (!branch) throw new AppError(400, 'Invalid branch');
    if (customerId && !customer) throw new AppError(400, 'Invalid customer');

    const foundExchangeProductIds = new Set(exchangeProducts.map((product) => product.id));
    const missingExchangeProductIds = uniqueExchangeProductIds.filter(
      (productId) => !foundExchangeProductIds.has(productId),
    );
    if (missingExchangeProductIds.length > 0) {
      throw new AppError(400, `Products not found: ${missingExchangeProductIds.join(', ')}`);
    }

    const returnedQtyByLineId = await this.getReturnedQtyByOriginalSaleLineIds(originalSaleId);

    for (const ret of returnedItems) {
      const originalItem = originalSale.sale_items.find((item) => item.product_id === ret.productId);
      if (!originalItem) {
        throw new AppError(400, `Product ${ret.productId} not found in original sale`);
      }
      const alreadyReturned = returnedQtyByLineId.get(originalItem.id)?.toNumber() ?? 0;
      const maxReturnable = originalItem.quantity.toNumber() - alreadyReturned;
      if (maxReturnable <= 0) {
        throw new AppError(
          400,
          `Nothing left to return for this product (${alreadyReturned} of ${originalItem.quantity.toNumber()} units were already returned).`,
        );
      }
      if (ret.quantity > maxReturnable) {
        throw new AppError(
          400,
          `Return quantity (${ret.quantity}) exceeds what is still returnable (${maxReturnable}) for product ${ret.productId}. ${alreadyReturned} unit(s) were already returned.`,
        );
      }
    }

    type MovementRow = {
      product_id: string;
      movement_type: StockMovementType;
      quantity_change: Prisma.Decimal;
      previous_qty: Prisma.Decimal;
      new_qty: Prisma.Decimal;
      reference_type: string;
      notes: string;
    };

    const saleItems: Prisma.SaleItemUncheckedCreateWithoutSaleInput[] = [];
    const movementRows: MovementRow[] = [];
    const stockNetChanges = new Map<string, Prisma.Decimal>();
    const stockQuantityMap = new Map<string, Prisma.Decimal>(
      stocks.map((stock) => [stock.product_id, new Prisma.Decimal(stock.current_quantity)]),
    );
    let total = new Prisma.Decimal(0);
    const hasReturn = returnedItems.length > 0;
    const hasExchange = exchangedItems.length > 0;

    const recordMovement = ({
      productId,
      change,
      movementType,
      referenceType,
      notes: movementNote,
    }: {
      productId: string;
      change: Prisma.Decimal;
      movementType: StockMovementType;
      referenceType: string;
      notes: string;
    }) => {
      const previousQty = stockQuantityMap.get(productId) ?? new Prisma.Decimal(0);
      const newQty = previousQty.plus(change);

      stockQuantityMap.set(productId, newQty);
      stockNetChanges.set(productId, (stockNetChanges.get(productId) ?? new Prisma.Decimal(0)).plus(change));
      movementRows.push({
        product_id: productId,
        movement_type: movementType,
        quantity_change: change,
        previous_qty: previousQty,
        new_qty: newQty,
        reference_type: referenceType,
        notes: movementNote,
      });
    };

    for (const ret of returnedItems) {
      const originalItem = originalSale.sale_items.find((item) => item.product_id === ret.productId);
      if (!originalItem) {
        throw new AppError(400, `Product ${ret.productId} not in original sale`);
      }

      const returnQuantity = new Prisma.Decimal(ret.quantity);
      const lineTotal = new Prisma.Decimal(originalItem.unit_price).mul(returnQuantity).mul(-1);
      total = total.plus(lineTotal);

      const disposition = ret.disposition ?? 'RESTOCK';
      if (disposition !== 'UNSELLABLE') {
        recordMovement({
          productId: ret.productId,
          change: returnQuantity,
          movementType:
            disposition === 'DAMAGED' ? StockMovementType.DAMAGE : StockMovementType.RETURN,
          referenceType: 'return',
          notes:
            disposition === 'DAMAGED'
              ? 'Returned — marked damaged'
              : 'Returned by customer',
        });
      }

      saleItems.push({
        product_id: ret.productId,
        quantity: returnQuantity.mul(-1),
        unit_price: originalItem.unit_price,
        tax_rate: originalItem.tax_rate,
        discount_rate: originalItem.discount_rate,
        tax_amount: new Prisma.Decimal(0),
        discount_amount: new Prisma.Decimal(0),
        line_total: lineTotal,
        item_type: SaleItemType.RETURN,
        ref_sale_item_id: originalItem.id,
      });
    }

    for (const item of exchangedItems) {
      const exchangeQuantity = new Prisma.Decimal(item.quantity);
      const available = stockQuantityMap.get(item.productId) ?? new Prisma.Decimal(0);
      if (available.lt(exchangeQuantity)) {
        throw new AppError(
          400,
          `Insufficient stock for exchange. Product ${item.productId}: available ${available.toNumber()}, requested ${exchangeQuantity.toNumber()}`,
        );
      }

      const unitPrice = new Prisma.Decimal(item.price);
      const lineTotal = unitPrice.mul(exchangeQuantity);
      total = total.plus(lineTotal);

      recordMovement({
        productId: item.productId,
        change: exchangeQuantity.mul(-1),
        movementType: StockMovementType.SALE,
        referenceType: 'exchange',
        notes: 'Exchanged to customer',
      });

      saleItems.push({
        product_id: item.productId,
        quantity: exchangeQuantity,
        unit_price: unitPrice,
        tax_rate: new Prisma.Decimal(0),
        discount_rate: new Prisma.Decimal(0),
        tax_amount: new Prisma.Decimal(0),
        discount_amount: new Prisma.Decimal(0),
        line_total: lineTotal,
        item_type: SaleItemType.EXCHANGE,
      });
    }

    const resolvedCustomerId = customerId ?? originalSale.customer_id ?? undefined;
    const returnSaleNumber = `SALE-${Date.now()}`;

    const metaParts: string[] = [];
    if (returnReason) metaParts.push(`Reason: ${returnReason}`);
    if (refundMethod) metaParts.push(`Refund: ${refundMethod}`);
    if (orderScope) metaParts.push(`Scope: ${orderScope}`);
    const dispositionSummary = returnedItems
      .filter((r) => r.disposition && r.disposition !== 'RESTOCK')
      .map((r) => `${r.productId}=${r.disposition}`)
      .join(', ');
    if (dispositionSummary) metaParts.push(`Disposition: ${dispositionSummary}`);
    const composedNotes = [metaParts.join(' | '), notes?.trim()].filter(Boolean).join('\n');

    // Settle the refund/exchange against the customer's account (registered customers only).
    // `total` = exchangeTotal - refundTotal  →  negative = net refund, positive = net amount owed.
    let returnPreviousBalance = new Prisma.Decimal(0);
    let returnUpdatedBalance = new Prisma.Decimal(0);
    let returnAdjustsAccount = false;
    if (resolvedCustomerId) {
      const acctCustomer = await prisma.customer.findUnique({
        where: { id: resolvedCustomerId },
        select: { outstanding_balance: true },
      });
      if (acctCustomer) {
        returnAdjustsAccount = true;
        returnPreviousBalance = new Prisma.Decimal(acctCustomer.outstanding_balance);
        returnUpdatedBalance = returnPreviousBalance.plus(total);
      }
    }

    const ops: Prisma.PrismaPromise<any>[] = [];

    ops.push(
      prisma.sale.create({
        data: {
          sale_number: returnSaleNumber,
          branch_id: branchId,
          customer_id: resolvedCustomerId,
          original_sale_id: originalSaleId,
          notes: composedNotes || undefined,
          subtotal: total,
          total_amount: total,
          payment_method: 'CASH',
          payment_status: 'PAID',
          previous_balance: returnPreviousBalance,
          status:
            hasReturn && hasExchange
              ? SaleStatus.EXCHANGED
              : hasReturn
                ? SaleStatus.REFUNDED
                : SaleStatus.EXCHANGED,
          created_by: createdBy,
          sale_items: {
            create: saleItems,
          },
        },
        include: {
          sale_items: true,
        },
      }),
    );

    // Credit the net refund (or debit a net exchange) to the customer's account
    if (returnAdjustsAccount && resolvedCustomerId && !total.isZero()) {
      const isNetRefund = total.isNegative();
      ops.push(
        prisma.customer.update({
          where: { id: resolvedCustomerId },
          data: { outstanding_balance: returnUpdatedBalance },
        }),
      );
      ops.push(
        prisma.customerLedger.create({
          data: {
            customer_id: resolvedCustomerId,
            entry_type: isNetRefund ? LedgerEntryType.REFUND : LedgerEntryType.ADJUSTMENT,
            amount: total.abs(),
            description: isNetRefund
              ? `Return refund credited to account - ${returnSaleNumber}`
              : `Exchange balance adjustment - ${returnSaleNumber}`,
            sale_id: returnSaleNumber,
            balance_after: returnUpdatedBalance,
            created_by: createdBy,
          },
        }),
      );
    }

    for (const [productId, quantityChange] of stockNetChanges.entries()) {
      ops.push(
        prisma.stock.upsert({
          where: {
            product_id_branch_id: {
              product_id: productId,
              branch_id: branchId,
            },
          },
          update: {
            current_quantity: {
              increment: quantityChange,
            },
          },
          create: {
            product_id: productId,
            branch_id: branchId,
            current_quantity: quantityChange,
            minimum_quantity: new Prisma.Decimal(0),
            maximum_quantity: new Prisma.Decimal(1000),
            reserved_quantity: new Prisma.Decimal(0),
          },
        }),
      );
    }

    if (movementRows.length > 0) {
      ops.push(
        prisma.stockMovement.createMany({
          data: movementRows.map((movement) => ({
            product_id: movement.product_id,
            branch_id: branchId,
            movement_type: movement.movement_type,
            reference_id: originalSaleId,
            reference_type: movement.reference_type,
            quantity_change: movement.quantity_change,
            previous_qty: movement.previous_qty,
            new_qty: movement.new_qty,
            notes: movement.notes,
            created_by: createdBy,
          })),
        }),
      );
    }

    const [sale] = await prisma.$transaction(ops);
    return sale as Prisma.SaleGetPayload<{ include: { sale_items: true } }>;
  }

  async getRecentSaleItemsProductNameAndPrice(branchId?: string) {
    const defaultBranchId = branchId?.trim() || undefined;

    const sales = await prisma.sale.findMany({
      where: defaultBranchId && defaultBranchId !== "Not Found" 
        ? { branch_id: defaultBranchId } 
        : undefined,
      orderBy: { sale_date: 'desc' },
      take: 5,
    });

    if (!sales || sales.length === 0) return [];
    
    return sales.map((sale) => ({
      productName: sale.sale_number, // Mapping sale_number to productName as expected by UI
      price: sale.total_amount,
    }));
  }

  async updateSale(
    saleId: string,
    data: {
      items: Array<{ productId: string; quantity: number; price: number }>;
      discountAmount?: number;
      paymentMethod?: string;
      notes?: string;
      createdBy: string;
    }
  ) {
    return prisma.$transaction(async (tx) => {
      const oldSale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { sale_items: true, customer: true },
      });

      if (!oldSale) throw new AppError(404, "Sale not found");
      if (oldSale.status !== "COMPLETED") throw new AppError(400, "Only completed sales can be edited");

      const branchId = oldSale.branch_id!;
      const oldTotal = oldSale.total_amount;
      const newPaymentMethod = data.paymentMethod || oldSale.payment_method;

      // Rollback Stock
      for (const item of oldSale.sale_items) {
        await tx.stock.update({
          where: { product_id_branch_id: { product_id: item.product_id, branch_id: branchId } },
          data: { current_quantity: { increment: item.quantity } },
        });
      }

      // Delete old items
      await tx.saleItem.deleteMany({ where: { sale_id: saleId } });

      const subtotal = data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const discount = data.discountAmount ?? Number(oldSale.discount_amount);
      const newTotal = Math.max(0, subtotal - discount);

      // Create new items and update stock
      const saleItemsData = [];
      for (const item of data.items) {
        saleItemsData.push({
          product_id: item.productId,
          quantity: new Prisma.Decimal(item.quantity),
          unit_price: new Prisma.Decimal(item.price),
          line_total: new Prisma.Decimal(item.price * item.quantity),
        });

        await tx.stock.update({
          where: { product_id_branch_id: { product_id: item.productId, branch_id: branchId } },
          data: { current_quantity: { decrement: item.quantity } },
        });
      }

      // Handle Ledger Delta
      if (oldSale.customer_id) {
        const customer = await tx.customer.findUnique({ where: { id: oldSale.customer_id } });
        if (customer) {
          let balanceDelta = new Prisma.Decimal(0);
          if (oldSale.payment_method === "CREDIT" && newPaymentMethod === "CREDIT") {
            balanceDelta = new Prisma.Decimal(newTotal).minus(oldTotal);
          } else if (oldSale.payment_method === "CREDIT" && newPaymentMethod !== "CREDIT") {
            balanceDelta = new Prisma.Decimal(oldTotal).mul(-1);
          } else if (oldSale.payment_method !== "CREDIT" && newPaymentMethod === "CREDIT") {
            balanceDelta = new Prisma.Decimal(newTotal);
          }
          if (!balanceDelta.isZero()) {
            const newBalance = new Prisma.Decimal(customer.outstanding_balance).plus(balanceDelta);
            await tx.customer.update({
              where: { id: oldSale.customer_id },
              data: { outstanding_balance: newBalance }
            });
            await tx.customerLedger.create({
              data: {
                customer_id: oldSale.customer_id,
                entry_type: LedgerEntryType.ADJUSTMENT,
                amount: balanceDelta.abs(),
                description: `Sale Adjustment - ${oldSale.sale_number}`,
                sale_id: oldSale.sale_number,
                balance_after: newBalance,
                created_by: data.createdBy
              }
            });
          }
        }
      }

      return await tx.sale.update({
        where: { id: saleId },
        data: {
          subtotal: new Prisma.Decimal(subtotal),
          total_amount: new Prisma.Decimal(newTotal),
          discount_amount: new Prisma.Decimal(discount),
          payment_method: newPaymentMethod as any,
          payment_received: newPaymentMethod === "CREDIT" ? 0 : new Prisma.Decimal(newTotal),
          notes: data.notes ?? oldSale.notes,
          sale_items: { create: saleItemsData }
        },
        include: { sale_items: { include: { product: true } }, customer: true }
      });
    }, {
      maxWait: 20000,
      timeout: 15000 
    });
  }

  async deleteSale(
    saleId: string,
    options?: { deletedBy?: string; restrictToBranchId?: string },
  ) {
    return prisma.$transaction(
      async (tx) => {
        const sale = await tx.sale.findUnique({
          where: { id: saleId },
          include: { sale_items: true },
        });

        if (!sale) throw new AppError(404, 'Sale not found');

        if (
          options?.restrictToBranchId &&
          sale.branch_id &&
          sale.branch_id !== options.restrictToBranchId
        ) {
          throw new AppError(403, 'You cannot delete sales from another branch');
        }

        const deletableStatuses: SaleStatus[] = [
          SaleStatus.COMPLETED,
          SaleStatus.REFUNDED,
          SaleStatus.EXCHANGED,
        ];
        if (!deletableStatuses.includes(sale.status)) {
          throw new AppError(400, 'This sale cannot be deleted');
        }

        const isReturnOrExchangeRecord = Boolean(
          sale.original_sale_id ||
            sale.status === SaleStatus.REFUNDED ||
            sale.status === SaleStatus.EXCHANGED,
        );

        if (!isReturnOrExchangeRecord) {
          const linkedReturnCount = await tx.sale.count({
            where: { original_sale_id: saleId },
          });
          if (linkedReturnCount > 0) {
            throw new AppError(
              400,
              'Cannot delete a sale that has returns or exchanges recorded against it. Delete those records first.',
            );
          }
        }

        const branchId = sale.branch_id;
        if (branchId) {
          for (const item of sale.sale_items) {
            // RETURN lines store negative qty; EXCHANGE/SALE lines positive — increment reverses both.
            await tx.stock.upsert({
              where: {
                product_id_branch_id: {
                  product_id: item.product_id,
                  branch_id: branchId,
                },
              },
              update: { current_quantity: { increment: item.quantity } },
              create: {
                product_id: item.product_id,
                branch_id: branchId,
                current_quantity: item.quantity,
                minimum_quantity: new Prisma.Decimal(0),
                maximum_quantity: new Prisma.Decimal(1000),
                reserved_quantity: new Prisma.Decimal(0),
              },
            });
          }
        }

        if (sale.customer_id) {
          const customer = await tx.customer.findUnique({
            where: { id: sale.customer_id },
          });
          if (customer) {
            const total = new Prisma.Decimal(sale.total_amount);
            const paid = new Prisma.Decimal(sale.payment_received);
            let newBalance: Prisma.Decimal;

            if (isReturnOrExchangeRecord) {
              // createExchangeOrReturnSale: balance += total (total may be negative)
              newBalance = new Prisma.Decimal(customer.outstanding_balance).minus(total);
            } else if (sale.payment_method === 'CREDIT') {
              const creditOwed = total.minus(paid);
              newBalance = new Prisma.Decimal(customer.outstanding_balance)
                .minus(creditOwed)
                .plus(paid);
            } else {
              newBalance = new Prisma.Decimal(customer.outstanding_balance);
            }

            if (!newBalance.equals(customer.outstanding_balance)) {
              await tx.customer.update({
                where: { id: sale.customer_id },
                data: { outstanding_balance: newBalance },
              });
            }
          }
          await tx.customerLedger.deleteMany({
            where: {
              customer_id: sale.customer_id,
              sale_id: sale.sale_number,
            },
          });
        }

        await tx.sale.delete({ where: { id: saleId } });

        return { success: true, saleNumber: sale.sale_number };
      },
      { maxWait: 15_000, timeout: 60_000 },
    );
  }
}

export { SaleService };
