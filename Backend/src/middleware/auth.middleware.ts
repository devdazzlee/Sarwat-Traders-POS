import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { isRedisAvailable, safeRedisOperation } from '../config/redis';
import { config } from '../config/app';
import { AppError } from '../utils/apiError';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        branch_id?: string;
      };
    }
  }
}

const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      throw new AppError(401, 'Authentication required');
    }

    const decoded = jwt.verify(token, config.jwtSecret) as { id: string; role: string };

    // Verify token against Redis if available, otherwise just verify JWT
    if (isRedisAvailable) {
      const storedToken = await safeRedisOperation(
        async (redis) => redis.get(`session:${decoded.id}`),
        null
      );
      
      if (storedToken && storedToken !== token) {
        throw new AppError(401, 'Invalid or expired session');
      }
      // If storedToken is null and Redis is available, session might have expired
      // But if Redis is unavailable, we allow JWT verification to pass
    }

    req.user = decoded;
    next();
  } catch (error) {
    // If it's a JWT error, pass it through
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'Invalid or expired token');
    }
    next(error);
  }
};

const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(403, 'Unauthorized access');
    }
    next();
  };
};

export { authenticate, authorize };
