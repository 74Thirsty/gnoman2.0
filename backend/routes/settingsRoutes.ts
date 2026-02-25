import { Router } from 'express';
import {
  getTransactionHoldSettings,
  updateTransactionHoldSettings,
  getRuntimeObservability
} from '../controllers/settingsController';

const router = Router();

router.get('/transaction-hold', getTransactionHoldSettings);
router.post('/transaction-hold', updateTransactionHoldSettings);
router.get('/runtime-observability', getRuntimeObservability);

export default router;
