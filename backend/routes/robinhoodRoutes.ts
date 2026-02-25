import { Router } from 'express';
import {
  cancelCryptoOrder,
  getCryptoAccounts,
  getCryptoCredentialsStatus,
  getCryptoMarketData,
  getCryptoOrderStatus,
  placeCryptoCashOrder,
  setCryptoCredentials
} from '../controllers/robinhoodController';

const router = Router();

router.get('/crypto/credentials', getCryptoCredentialsStatus);
router.post('/crypto/credentials', setCryptoCredentials);
router.get('/crypto/accounts', getCryptoAccounts);
router.get('/crypto/market-data', getCryptoMarketData);
router.post('/crypto/orders', placeCryptoCashOrder);
router.get('/crypto/orders/:orderId', getCryptoOrderStatus);
router.post('/crypto/orders/:orderId/cancel', cancelCryptoOrder);

export default router;
