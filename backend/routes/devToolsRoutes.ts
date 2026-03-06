import { Router } from 'express';
import * as devToolsController from '../controllers/devToolsController';

const router = Router();

router.post('/discover', devToolsController.discoverContractHandler);
router.post('/gas/estimate', devToolsController.estimateGasHandler);
router.post('/scanner/scan', devToolsController.scanContractHandler);
router.post('/decoder/decode', devToolsController.decodeHandler);

export default router;
