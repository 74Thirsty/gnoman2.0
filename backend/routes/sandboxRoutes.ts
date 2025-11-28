import { Router } from 'express';
import * as sandboxController from '../controllers/sandboxController';

const router = Router();

router.post('/call-static', sandboxController.callStaticSimulation);
router.post('/contract/simulate', sandboxController.contractSimulation);
router.post('/contract/safe', sandboxController.safeSimulation);
router.post('/contract/abi', sandboxController.loadAbiHandler);
router.get('/contract/abis', sandboxController.listAbisHandler);
router.get('/contract/history', sandboxController.historyHandler);
router.delete('/contract/history', sandboxController.clearHistoryHandler);
router.post('/fork/start', sandboxController.startForkHandler);
router.post('/fork/stop', sandboxController.stopForkHandler);
router.get('/fork/status', sandboxController.forkStatusHandler);

export default router;
