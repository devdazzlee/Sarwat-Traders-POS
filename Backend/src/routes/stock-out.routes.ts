import { Router } from 'express';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { logStockOut, logReturn } from '../controllers/stock-out.controller';
import { logStockOutSchema, logReturnSchema } from '../validations/stock-out.validation';

const router = Router();

router.use(
  authenticate,
  authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER'])
);

router.post('/out', validate(logStockOutSchema), logStockOut);
router.post('/return', validate(logReturnSchema), logReturn);

export default router;
