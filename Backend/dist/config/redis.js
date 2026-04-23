"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeRedisOperation = exports.isRedisAvailable = exports.connectRedis = exports.getRedis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const app_1 = require("./app");
let redis = null;
let isRedisAvailable = false;
exports.isRedisAvailable = isRedisAvailable;
// Initialize Redis with error handling
const initializeRedis = () => {
    try {
        redis = new ioredis_1.default(app_1.config.redisServiceUri, {
            tls: {
                rejectUnauthorized: false,
            },
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                if (times > 3) {
                    console.log('Redis: Max retries reached, giving up');
                    return null; // Stop retrying
                }
                return Math.min(times * 200, 2000);
            },
            enableOfflineQueue: false, // Don't queue commands when offline
        });
        // Handle connection events
        redis.on('connect', () => {
            console.log('Redis: Connecting...');
        });
        redis.on('ready', () => {
            exports.isRedisAvailable = isRedisAvailable = true;
            console.log('Redis: Connected and ready');
        });
        redis.on('error', (err) => {
            exports.isRedisAvailable = isRedisAvailable = false;
            console.log('Redis: Connection error (continuing without Redis):', err.message);
        });
        redis.on('close', () => {
            exports.isRedisAvailable = isRedisAvailable = false;
            console.log('Redis: Connection closed');
        });
        redis.on('reconnecting', () => {
            console.log('Redis: Reconnecting...');
        });
        return redis;
    }
    catch (err) {
        console.log('Redis: Failed to initialize (continuing without Redis):', err);
        exports.isRedisAvailable = isRedisAvailable = false;
        return null;
    }
};
// Initialize Redis
initializeRedis();
// Safe Redis operations wrapper
const safeRedisOperation = async (operation, fallback) => {
    if (!redis || !isRedisAvailable || redis.status !== 'ready') {
        return fallback;
    }
    try {
        return await operation(redis);
    }
    catch (err) {
        console.log('Redis operation error (using fallback):', err);
        exports.isRedisAvailable = isRedisAvailable = false;
        return fallback;
    }
};
exports.safeRedisOperation = safeRedisOperation;
const connectRedis = async () => {
    if (!redis) {
        console.log('Redis: Not initialized, continuing without Redis');
        return;
    }
    // Connection state is managed by event handlers (ready, error, close)
    // No need to ping here - the 'ready' event will set isRedisAvailable = true
    console.log('Redis: Connection initialized, waiting for ready event...');
};
exports.connectRedis = connectRedis;
// Export safe Redis getter
const getRedis = () => redis;
exports.getRedis = getRedis;
//# sourceMappingURL=redis.js.map