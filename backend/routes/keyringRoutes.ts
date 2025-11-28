import { Router } from 'express';
import {
  deleteSecret,
  getBackend,
  getSecret,
  listSecrets,
  listServices,
  setSecret,
  switchBackend,
  switchService
} from '../controllers/keyringController';

const router = Router();

// Service endpoints
router.get('/list', listSecrets);
router.post('/switch', switchService);
router.get('/services', listServices);

// Secret management endpoints
router.post('/set', setSecret);
router.post('/get', getSecret);
router.delete('/remove', deleteSecret);

// Backend endpoints
router.get('/backend', getBackend);
router.post('/backend/:name', switchBackend);

// Legacy compatibility routes
router.get('/', listSecrets);
router.get('/:key', getSecret);
router.post('/:key', setSecret);
router.delete('/:key', deleteSecret);

export default router;
