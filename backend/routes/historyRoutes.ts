import { Router } from 'express';
import * as historyController from '../controllers/historyController';

const router = Router();

router.get('/', historyController.listHistory);

export default router;
