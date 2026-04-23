import Redis from 'ioredis';
import { config } from './app';

let redis: Redis | null = null;
let isRedisAvailable = false;

// Initialize Redis with error handling
const initializeRedis = () => {
  try {
    redis = new Redis(config.redisServiceUri, {
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
      isRedisAvailable = true;
      console.log('Redis: Connected and ready');
    });

    redis.on('error', (err) => {
      isRedisAvailable = false;
      console.log('Redis: Connection error (continuing without Redis):', err.message);
    });

    redis.on('close', () => {
      isRedisAvailable = false;
      console.log('Redis: Connection closed');
    });

    redis.on('reconnecting', () => {
      console.log('Redis: Reconnecting...');
    });

    return redis;
  } catch (err) {
    console.log('Redis: Failed to initialize (continuing without Redis):', err);
    isRedisAvailable = false;
    return null;
  }
};

// Initialize Redis
initializeRedis();

// Safe Redis operations wrapper
const safeRedisOperation = async <T>(
  operation: (redis: Redis) => Promise<T>,
  fallback: T
): Promise<T> => {
  if (!redis || !isRedisAvailable || redis.status !== 'ready') {
    return fallback;
  }
  try {
    return await operation(redis);
  } catch (err) {
    console.log('Redis operation error (using fallback):', err);
    isRedisAvailable = false;
    return fallback;
  }
};

const connectRedis = async () => {
  if (!redis) {
    console.log('Redis: Not initialized, continuing without Redis');
    return;
  }
  // Connection state is managed by event handlers (ready, error, close)
  // No need to ping here - the 'ready' event will set isRedisAvailable = true
  console.log('Redis: Connection initialized, waiting for ready event...');
};

// Export safe Redis getter
const getRedis = () => redis;

export { getRedis, connectRedis, isRedisAvailable, safeRedisOperation };




