"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const app_1 = require("../config/app");
const redis_1 = require("../config/redis");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
class CustomerService {
    generateToken(cusId, email) {
        const token = jsonwebtoken_1.default.sign({
            email: email,
            id: cusId
        }, app_1.config.jwtSecret);
        return token;
    }
    async verifyCustomerExistance(email) {
        const customer = await client_1.prisma.customer.findFirst({
            where: {
                email: email,
            },
        });
        if (customer)
            return true;
        return false;
    }
    async createCustomer(data) {
        const customerExists = await this.verifyCustomerExistance(data.email);
        if (customerExists) {
            throw new apiError_1.AppError(400, 'Customer already exists');
        }
        // Ensure password is hashed before storing
        const hashedPassword = await bcryptjs_1.default.hash(data.password, 10);
        const customer = await client_1.prisma.customer.create({
            data: {
                ...data,
                password: hashedPassword,
            },
        });
        const token = this.generateToken(customer.id, customer.email);
        // Store session in Redis without expiration (token valid until logout)
        await (0, redis_1.safeRedisOperation)(async (redis) => redis.set(`session:customer:${customer.id}`, token), null);
        return {
            email: customer.email,
            token,
        };
    }
    async createShopCustomer(data) {
        const customerExists = await this.verifyCustomerExistance(data.email);
        if (customerExists) {
            throw new apiError_1.AppError(400, 'Customer already exists');
        }
        const customer = await client_1.prisma.customer.create({
            data: data
        });
        return {
            customer
        };
    }
    async loginCustomer(email, password) {
        const customer = await client_1.prisma.customer.findFirst({
            where: { email },
        });
        if (!customer || !customer.password) {
            throw new apiError_1.AppError(401, 'Invalid credentials');
        }
        const isPasswordValid = await bcryptjs_1.default.compare(password, customer.password);
        if (!isPasswordValid) {
            throw new apiError_1.AppError(401, 'Invalid credentials');
        }
        const token = this.generateToken(customer.id, customer.email);
        // Save session to Redis without expiration (token valid until logout)
        await (0, redis_1.safeRedisOperation)(async (redis) => redis.set(`session:customer:${customer.id}`, token), null);
        return {
            email: customer.email,
            token,
        };
    }
    async getCustomerById(customerId) {
        const customer = await client_1.prisma.customer.findUnique({
            where: { id: customerId },
        });
        if (!customer) {
            throw new apiError_1.AppError(404, 'Customer not found');
        }
        return customer;
    }
    async getCustomers(search) {
        return client_1.prisma.customer.findMany({
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
    async updateCustomer(customerId, updateData) {
        const existingCustomer = await client_1.prisma.customer.findUnique({
            where: { id: customerId },
        });
        if (!existingCustomer) {
            throw new apiError_1.AppError(404, 'Customer not found');
        }
        // If password is being updated, hash it
        if (updateData.password) {
            updateData.password = await bcryptjs_1.default.hash(updateData.password, 10);
        }
        const updatedCustomer = await client_1.prisma.customer.update({
            where: { id: customerId },
            data: updateData,
        });
        return updatedCustomer;
    }
    async deleteCustomer(customerId) {
        const existingCustomer = await client_1.prisma.customer.findUnique({
            where: { id: customerId },
        });
        if (!existingCustomer) {
            throw new apiError_1.AppError(404, 'Customer not found');
        }
        await client_1.prisma.customer.delete({
            where: { id: customerId },
        });
        // Remove session from Redis if exists
        await (0, redis_1.safeRedisOperation)(async (redis) => redis.del(`session:customer:${customerId}`), 0);
        return { message: 'Customer deleted successfully' };
    }
    async logoutCustomer(customerId) {
        await (0, redis_1.safeRedisOperation)(async (redis) => redis.del(`session:customer:${customerId}`), 0);
        return { message: 'Logged out successfully' };
    }
}
exports.default = CustomerService;
//# sourceMappingURL=customer.service.js.map