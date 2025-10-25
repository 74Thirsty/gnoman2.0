import { Router } from 'express';
import * as walletController from '../controllers/walletController';

const router = Router();

router.get('/', walletController.listWallets);
router.post('/generate', walletController.generateWallet);
router.post('/import/mnemonic', walletController.importMnemonic);
router.post('/import/private-key', walletController.importPrivateKey);
router.post('/vanity', walletController.generateVanity);
router.post('/:address/export', walletController.exportWalletHandler);

export default router;
