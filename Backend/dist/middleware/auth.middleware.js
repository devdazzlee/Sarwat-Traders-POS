"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const redis_1 = require("../config/redis");
const app_1 = require("../config/app");
const apiError_1 = require("../utils/apiError");
const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            throw new apiError_1.AppError(401, 'Authentication required');
        }
        const decoded = jsonwebtoken_1.default.verify(token, app_1.config.jwtSecret);
        // Verify token against Redis if available, otherwise just verify JWT
        if (redis_1.isRedisAvailable) {
            const storedToken = await (0, redis_1.safeRedisOperation)(async (redis) => redis.get(`session:${decoded.id}`), null);
            if (storedToken && storedToken !== token) {
                throw new apiError_1.AppError(401, 'Invalid or expired session');
            }
            // If storedToken is null and Redis is available, session might have expired
            // But if Redis is unavailable, we allow JWT verification to pass
        }
        req.user = decoded;
        next();
    }
    catch (error) {
        // If it's a JWT error, pass it through
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError || error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            throw new apiError_1.AppError(401, 'Invalid or expired token');
        }
        next(error);
    }
};
exports.authenticate = authenticate;
const authorize = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            throw new apiError_1.AppError(403, 'Unauthorized access');
        }
        next();
    };
};
exports.authorize = authorize;
//# sourceMappingURL=auth.middleware.js.map