import { Router } from 'express';
import { getSecret, listSecrets, removeSecret, setSecret, switchService } from '../controllers/keyringController';

const router = Router();

router.get('/list', listSecrets);
router.post('/set', setSecret);
router.post('/get', getSecret);
router.delete('/remove', removeSecret);
router.post('/switch', switchService);

export default router;
