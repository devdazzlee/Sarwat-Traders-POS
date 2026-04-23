import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getCustomerLedger,
  recordPayment,
  getCreditSummary,
} from '../controllers/customer-ledger.controller';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER']));

router.get('/summary', getCreditSummary);
router.get('/:customerId', getCustomerLedger);
router.post('/:customerId/payment', recordPayment);

export default router;
