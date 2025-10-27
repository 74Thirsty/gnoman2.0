import { Router } from 'express';
import * as safeController from '../controllers/safeController';

const router = Router();

router.post('/load', safeController.loadSafe);
router.get('/policies', safeController.listHoldPolicies);
router.get('/:address/details', safeController.getSafeDetails);
router.get('/:address/hold', safeController.getHoldPolicy);
router.get('/:address/owners', safeController.listOwners);
router.post('/:address/owners', safeController.addOwner);
router.delete('/:address/owners/:ownerAddress', safeController.removeOwner);
router.post('/:address/threshold', safeController.changeThreshold);
router.post('/:address/modules', safeController.enableModule);
router.delete('/:address/modules/:moduleAddress', safeController.disableModule);
router.post('/:address/transactions', safeController.proposeTransaction);
router.post('/:address/transactions/:txHash/execute', safeController.executeTransaction);
router.post('/:address/transactions/:txHash/release', safeController.releaseTransactionHold);
router.post('/:address/hold/toggle', safeController.toggleHold);
router.post('/:address/hold', safeController.toggleHold);
router.get('/:address/transactions/held', safeController.listHeldTransactions);

export default router;
