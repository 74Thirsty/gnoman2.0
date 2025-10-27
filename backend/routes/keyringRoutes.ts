import { Router } from 'express';
import {
  deleteSecret,
  getBackend,
  getSecret,
  listSecrets,
  setSecret,
  switchBackend
} from '../controllers/keyringController';

const router = Router();

router.get('/', listSecrets);
router.get('/backend', getBackend);
router.post('/backend/:name', switchBackend);
router.get('/:key', getSecret);
router.post('/:key', setSecret);
router.delete('/:key', deleteSecret);

export default router;
