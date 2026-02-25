import { Router } from 'express';
import * as etherscanController from '../controllers/etherscanController';

const router = Router();

router.post('/abi/resolve', etherscanController.resolveContractAbi);
router.get('/abi/:address/file', etherscanController.resolveContractAbiFile);
router.get('/tx/:address', etherscanController.getAddressTxHistory);
router.get('/gas', etherscanController.getCurrentGasOracle);

export default router;
