import { Customer, LedgerEntryType, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import jwt from 'jsonwebtoken';
import { config } from '../config/app';
import bcrypt from 'bcryptjs';

class CustomerService {
    private generateToken(cusId: Customer['id'], email: Customer['email']): string {
        return jwt.sign(
            { email, id: cusId },
            config.jwtSecret,
            // No expiresIn — token valid until explicit logout
        );
    }

    private async verifyCustomerExistance(email: Customer['email']): Promise<boolean> {
        if (!email) return false;
        const customer = await prisma.customer.findFirst({ where: { email } });
        return !!customer;
    }

    public async createCustomer(data: Customer) {
        const customerExists = await this.verifyCustomerExistance(data.email);
        if (customerExists) {
            throw new AppError(400, 'Customer already exists');
        }

        const hashedPassword = await bcrypt.hash(data.password!, 10);
        const customer = await prisma.customer.create({
            data: { ...data, password: hashedPassword },
        });

        const token = this.generateToken(customer.id, customer.email!);

        // Persist session in DB — one active session per customer
        await prisma.customerSession.deleteMany({ where: { customer_id: customer.id } });
        await prisma.customerSession.create({ data: { customer_id: customer.id, token } });

        return { email: customer.email, token };
    }

    public async createShopCustomer(
        data: Customer,
        createdBy?: string,
    ) {
        const customerExists = await this.verifyCustomerExistance(data.email);
        if (customerExists) {
            throw new AppError(400, 'Customer already exists');
        }

        const openingBalance = new Prisma.Decimal(data.outstanding_balance ?? 0);
        if (openingBalance.lt(0)) {
            throw new AppError(400, 'Outstanding balance cannot be negative');
        }

        const customer = await prisma.$transaction(async (tx) => {
            const created = await tx.customer.create({
                data: {
                    ...data,
                    outstanding_balance: openingBalance,
                },
            });

            if (openingBalance.gt(0)) {
                await tx.customerLedger.create({
                    data: {
                        customer_id: created.id,
                        entry_type: LedgerEntryType.ADJUSTMENT,
                        amount: openingBalance,
                        description: 'Opening balance (existing credit before POS)',
                        balance_after: openingBalance,
                        created_by: createdBy ?? undefined,
                    },
                });
            }

            return created;
        });

        return { customer };
    }

    public async loginCustomer(email: Customer['email'], password: Customer['password']) {
        if (!email) throw new AppError(400, 'Email is required for login');
        const customer = await prisma.customer.findFirst({ where: { email } });

        if (!customer || !customer.password) {
            throw new AppError(401, 'Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(password!, customer.password);
        if (!isPasswordValid) {
            throw new AppError(401, 'Invalid credentials');
        }

        const token = this.generateToken(customer.id, customer.email!);

        // Persist session in DB — replace any existing session
        await prisma.customerSession.deleteMany({ where: { customer_id: customer.id } });
        await prisma.customerSession.create({ data: { customer_id: customer.id, token } });

        return { email: customer.email, token };
    }

    public async getCustomerById(customerId: Customer['id']) {
        const customer = await prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) throw new AppError(404, 'Customer not found');
        return customer;
    }

    public async getCustomers(search?: string) {
        return prisma.customer.findMany({
            where: search
                ? {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                        { phone_number: { contains: search } },
                    ],
                }
                : undefined,
            orderBy: { created_at: 'desc' },
        });
    }

    public async updateCustomer(customerId: Customer['id'], updateData: Partial<Customer>) {
        const existingCustomer = await prisma.customer.findUnique({ where: { id: customerId } });
        if (!existingCustomer) throw new AppError(404, 'Customer not found');

        if (updateData.password) {
            updateData.password = await bcrypt.hash(updateData.password, 10);
        }

        return prisma.customer.update({ where: { id: customerId }, data: updateData });
    }

    public async deleteCustomer(customerId: Customer['id']) {
        const existingCustomer = await prisma.customer.findUnique({ where: { id: customerId } });
        if (!existingCustomer) throw new AppError(404, 'Customer not found');

        await prisma.$transaction(
            async (tx) => {
                // Credit ledger blocks customer delete (no ON DELETE CASCADE in DB)
                await tx.customerLedger.deleteMany({ where: { customer_id: customerId } });

                await tx.customerSession.deleteMany({ where: { customer_id: customerId } });
                await tx.deviceIdentity.deleteMany({ where: { customer_id: customerId } });

                // Keep sale/order history; detach customer so FK constraints pass
                await tx.sale.updateMany({
                    where: { customer_id: customerId },
                    data: { customer_id: null },
                });
                await tx.order.updateMany({
                    where: { customer_id: customerId },
                    data: { customer_id: null },
                });
                await tx.holdSale.updateMany({
                    where: { customer_id: customerId },
                    data: { customer_id: null },
                });

                await tx.customer.delete({ where: { id: customerId } });
            },
            { maxWait: 15_000, timeout: 60_000 },
        );

        return { message: 'Customer deleted successfully' };
    }

    public async logoutCustomer(customerId: Customer['id']) {
        await prisma.customerSession.deleteMany({ where: { customer_id: customerId } });
        return { message: 'Logged out successfully' };
    }
}

export default CustomerService;
