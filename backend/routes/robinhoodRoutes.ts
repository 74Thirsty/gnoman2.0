import { Router } from 'express';
import {
  getCryptoCredentialsStatus,
  getCryptoOrderStatus,
  placeCryptoCashOrder,
  setCryptoCredentials,
  cancelCryptoOrder,
} from '../controllers/robinhoodController';

const router = Router();

router.get('/crypto/credentials', getCryptoCredentialsStatus);
router.post('/crypto/credentials', setCryptoCredentials);
router.post('/crypto/orders', placeCryptoCashOrder);
router.get('/crypto/orders/:orderId', getCryptoOrderStatus);
router.post('/crypto/orders/:orderId/cancel', cancelCryptoOrder);

export default router;
