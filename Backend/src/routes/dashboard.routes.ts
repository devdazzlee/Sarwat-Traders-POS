import express from 'express';

import { dashboardCollections, dashboardStats } from '../controllers/stats.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN', 'BRANCH_MANAGER', 'WAREHOUSE_MANAGER', 'PURCHASE_MANAGER']));

router.get('/stats', dashboardStats);
router.get('/collections', dashboardCollections);

export default router;