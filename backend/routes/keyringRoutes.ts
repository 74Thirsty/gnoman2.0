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
router.get('/list', listSecrets);
router.get('/backend', getBackend);
router.post('/backend/:name', switchBackend);
router.post('/switch', switchBackend);
router.post('/get', getSecret);
router.post('/set', setSecret);
router.delete('/remove', deleteSecret);
router.get('/:key', getSecret);
router.post('/:key', setSecret);
router.delete('/:key', deleteSecret);

export default router;
