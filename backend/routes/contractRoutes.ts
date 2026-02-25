import { Router } from 'express';
import * as contractController from '../controllers/contractController';

const router = Router();

router.get('/', contractController.listContractsHandler);
router.post('/', contractController.addContractHandler);
router.post('/abi/resolve', contractController.resolveContractAbiHandler);
router.delete('/:id', contractController.removeContractHandler);

export default router;
