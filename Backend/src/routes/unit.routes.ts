import express from 'express';
import {
    createUnit,
    getUnit,
    updateUnit,
    listUnits,
} from '../controllers/unit.controller';
import {
    createUnitSchema,
    updateUnitSchema,
    getUnitSchema,
    listUnitsSchema,
} from '../validations/unit.validation';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

router.post('/', validate(createUnitSchema), createUnit);
router.get('/', validate(listUnitsSchema), listUnits);
router.get('/:id', validate(getUnitSchema), getUnit);
router.patch('/:id', validate(updateUnitSchema), updateUnit);

export default router;