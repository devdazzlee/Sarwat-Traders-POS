import dotenv from 'dotenv';

dotenv.config();

interface AppConfig {
  redisServiceUri: string;
  port: number;
  env: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  cookieExpiresIn: number;
  redisHost: string;
  redisPort: number;
  redisPassword: string;
  redisDb: number;
}

const config: AppConfig = {
  port: parseInt(process.env.PORT || '5000'),
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  cookieExpiresIn: parseInt(process.env.COOKIE_EXPIRES_IN || '86400000'),
  redisServiceUri: process.env.REDIS_SERVICE_URI || 'redis://localhost:6379',
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379'),
  redisPassword: process.env.REDIS_PASSWORD || '',
  redisDb: parseInt(process.env.REDIS_DB || '0'),
};

export { config };
