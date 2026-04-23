"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateCustomer = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const redis_1 = require("../config/redis");
const app_1 = require("../config/app");
const apiError_1 = require("../utils/apiError");
const authenticateCustomer = async (req, res, next) => {
    try {
        console.log('[authenticateCustomer] Middleware called for path:', req.path);
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('[authenticateCustomer] No valid auth header');
            throw new apiError_1.AppError(401, 'Authentication required. Please provide a valid token.');
        }
        const token = authHeader.split(' ')[1];
        if (!token) {
            throw new apiError_1.AppError(401, 'Authentication required');
        }
        const decoded = jsonwebtoken_1.default.verify(token, app_1.config.jwtSecret);
        if (!decoded.id || !decoded.email) {
            throw new apiError_1.AppError(401, 'Invalid token structure');
        }
        // Verify token against Redis if available, otherwise just verify JWT
        if (redis_1.isRedisAvailable) {
            const storedToken = await (0, redis_1.safeRedisOperation)(async (redis) => redis.get(`session:customer:${decoded.id}`), null);
            // If Redis is available and storedToken is null, session doesn't exist
            if (storedToken === null) {
                throw new apiError_1.AppError(401, 'Session expired or invalid. Please login again.');
            }
            // If storedToken exists but doesn't match, token is invalid
            if (storedToken && storedToken !== token) {
                throw new apiError_1.AppError(401, 'Invalid or expired session');
            }
        }
        req.customer = {
            id: decoded.id,
            email: decoded.email,
        };
        console.log('[authenticateCustomer] Authentication successful for customer:', decoded.id);
        next();
    }
    catch (error) {
        console.log('[authenticateCustomer] Error:', error);
        // If it's already an AppError, pass it through
        if (error instanceof apiError_1.AppError) {
            return next(error);
        }
        // If it's a JWT error, convert it to AppError
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError || error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return next(new apiError_1.AppError(401, 'Invalid or expired token'));
        }
        // For any other error, pass it through
        next(error);
    }
};
exports.authenticateCustomer = authenticateCustomer;
//# sourceMappingURL=customerAuth.middleware.js.map