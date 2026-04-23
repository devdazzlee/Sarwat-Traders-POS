import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { isRedisAvailable, safeRedisOperation } from '../config/redis';
import { config } from '../config/app';
import { AppError } from '../utils/apiError';
import { Customer } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      customer: {
        id: string;
        email: string;
      };
    }
  }
}

const authenticateCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[authenticateCustomer] Middleware called for path:', req.path);
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[authenticateCustomer] No valid auth header');
      throw new AppError(401, 'Authentication required. Please provide a valid token.');
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw new AppError(401, 'Authentication required');
    }

    const decoded = jwt.verify(token, config.jwtSecret) as { id: Customer['id']; email: Customer['email'] };

    if (!decoded.id || !decoded.email) {
      throw new AppError(401, 'Invalid token structure');
    }

    // Verify token against Redis if available, otherwise just verify JWT
    if (isRedisAvailable) {
      const storedToken = await safeRedisOperation(
        async (redis) => redis.get(`session:customer:${decoded.id}`),
        null
      );
      
      // If Redis is available and storedToken is null, session doesn't exist
      if (storedToken === null) {
        throw new AppError(401, 'Session expired or invalid. Please login again.');
      }
      
      // If storedToken exists but doesn't match, token is invalid
      if (storedToken && storedToken !== token) {
        throw new AppError(401, 'Invalid or expired session');
      }
    }

    req.customer = {
      id: decoded.id,
      email: decoded.email,
    };
    console.log('[authenticateCustomer] Authentication successful for customer:', decoded.id);
    next();
  } catch (error) {
    console.log('[authenticateCustomer] Error:', error);
    // If it's already an AppError, pass it through
    if (error instanceof AppError) {
      return next(error);
    }
    
    // If it's a JWT error, convert it to AppError
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return next(new AppError(401, 'Invalid or expired token'));
    }
    
    // For any other error, pass it through
    next(error);
  }
};


export { authenticateCustomer };
