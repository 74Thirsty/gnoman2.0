import { Router } from 'express';
import * as sandboxController from '../controllers/sandboxController';

const router = Router();

router.post('/call-static', sandboxController.callStaticSimulation);
router.post('/fork', sandboxController.runForkSimulation);

export default router;
