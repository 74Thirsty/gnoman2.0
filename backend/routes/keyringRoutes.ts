import { Router } from 'express';
import {
  getSecret,
  getStatus,
  listSecrets,
  removeSecret,
  setSecret,
  switchBackend,
  switchService
} from '../controllers/keyringController';

const router = Router();

router.get('/list', listSecrets);
router.post('/set', setSecret);
router.post('/get', getSecret);
router.delete('/remove', removeSecret);
router.post('/switch', switchService);
router.get('/status', getStatus);
router.post('/backend', switchBackend);

export default router;
