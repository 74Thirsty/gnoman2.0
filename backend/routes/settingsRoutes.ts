import { Router } from 'express';
import {
  getTransactionHoldSettings,
  updateTransactionHoldSettings
} from '../controllers/settingsController';

const router = Router();

router.get('/transaction-hold', getTransactionHoldSettings);
router.post('/transaction-hold', updateTransactionHoldSettings);

export default router;
