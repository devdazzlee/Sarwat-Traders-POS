"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuestOrderService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const email_service_1 = require("../utils/email.service");
class GuestOrderService {
    async createGuestOrder(data) {
        return client_2.prisma.$transaction(async (tx) => {
            const productIds = data.items
                .map((item) => item.id || item.productId)
                .filter((id) => Boolean(id));
            if (productIds.length !== data.items.length) {
                throw new apiError_1.AppError(400, 'Product ID is missing in one or more items');
            }
            // Verify products exist and are active
            const products = await tx.product.findMany({
                where: {
                    id: { in: productIds },
                    is_active: true,
                },
            });
            if (products.length !== data.items.length) {
                throw new apiError_1.AppError(400, 'One or more products not found or inactive');
            }
            // Check stock availability (but allow orders even with insufficient stock)
            const stockRecords = await tx.stock.findMany({
                where: {
                    product_id: { in: productIds },
                },
            });
            // Note: We allow orders even with insufficient stock
            // Stock will be decremented, potentially going negative
            // Create order items
            const orderItems = [];
            const stockUpdates = [];
            const stockMovements = [];
            for (const item of data.items) {
                const productId = item.id || item.productId;
                const product = products.find((p) => p.id === productId);
                if (!product) {
                    throw new apiError_1.AppError(400, `Product not found for item: ${item.name}`);
                }
                const price = new client_1.Prisma.Decimal(product.sales_rate_inc_dis_and_tax || item.price);
                const itemTotal = price.times(item.quantity);
                orderItems.push({
                    product: { connect: { id: product.id } },
                    quantity: item.quantity,
                    price: price,
                    total_price: itemTotal,
                });
                // Try to update stock if record exists, otherwise skip
                const stock = stockRecords.find((s) => s.product_id === product.id);
                if (stock) {
                    // Decrement stock (allows negative stock)
                    stockUpdates.push(tx.stock.update({
                        where: {
                            product_id_branch_id: {
                                product_id: product.id,
                                branch_id: stock.branch_id,
                            },
                        },
                        data: {
                            current_quantity: { decrement: item.quantity },
                        },
                    }));
                    // Record stock movement
                    stockMovements.push(tx.stockMovement.create({
                        data: {
                            product: { connect: { id: product.id } },
                            branch: { connect: { id: stock.branch_id } },
                            movement_type: 'SALE',
                            quantity_change: -item.quantity,
                            previous_qty: stock.current_quantity,
                            new_qty: stock.current_quantity.minus(item.quantity),
                        },
                    }));
                }
                else {
                    // No stock record found - log warning but allow order
                    console.warn(`No stock record found for product ${product.name} (${product.id}). Order will proceed without stock update.`);
                }
            }
            if (orderItems.length === 0) {
                throw new apiError_1.AppError(400, 'No valid order items found');
            }
            await Promise.all([...stockUpdates, ...stockMovements]);
            // Create order without customer (guest order)
            const orderNumber = `MP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const totalAmount = new client_1.Prisma.Decimal(data.total);
            const order = await tx.order.create({
                data: {
                    order_number: orderNumber,
                    customer_id: null, // Guest order - no customer
                    total_amount: totalAmount,
                    status: 'PENDING',
                    payment_method: data.paymentMethod.toUpperCase(),
                    items: { create: orderItems },
                },
                include: {
                    items: { include: { product: true } },
                },
            });
            if (!order.items || order.items.length === 0) {
                throw new apiError_1.AppError(500, 'Order created without item details');
            }
            // Send confirmation emails
            const emailData = {
                orderNumber,
                customerName: `${data.customer.firstName} ${data.customer.lastName}`,
                customerEmail: data.customer.email,
                customerPhone: data.customer.phone,
                shippingAddress: data.shipping,
                items: data.items.map(item => ({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    total: item.price * item.quantity,
                })),
                subtotal: data.subtotal,
                shipping: data.shippingCost,
                total: data.total,
                paymentMethod: data.paymentMethod,
                orderNotes: data.orderNotes,
            };
            // Send emails asynchronously (don't wait)
            email_service_1.EmailService.sendOrderConfirmationEmails(emailData).catch(err => {
                console.error('Failed to send order confirmation emails:', err);
            });
            return order;
        }, {
            maxWait: 10000,
            timeout: 15000,
        });
    }
    async getGuestOrders(status, page = 1, pageSize = 10) {
        const where = {
            customer_id: null, // Only guest orders (no customer_id)
        };
        if (status) {
            where.status = status;
        }
        const [orders, total] = await Promise.all([
            client_2.prisma.order.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: {
                    items: {
                        include: {
                            product: true,
                        },
                    },
                },
            }),
            client_2.prisma.order.count({ where }),
        ]);
        return {
            data: orders,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }
    async getGuestOrderById(orderId) {
        const order = await client_2.prisma.order.findFirst({
            where: {
                id: orderId,
                customer_id: null, // Ensure it's a guest order
            },
            include: {
                items: {
                    include: {
                        product: true,
                    },
                },
            },
        });
        if (!order) {
            throw new apiError_1.AppError(404, 'Guest order not found');
        }
        return order;
    }
}
exports.GuestOrderService = GuestOrderService;
//# sourceMappingURL=guestOrder.service.js.map