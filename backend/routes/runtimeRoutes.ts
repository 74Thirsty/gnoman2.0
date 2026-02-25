import { Router } from 'express';
import { runtimeTelemetry } from '../services/runtimeTelemetryService';

const router = Router();

router.get('/telemetry', (_req, res) => {
  res.json(runtimeTelemetry.getSnapshot());
});

export default router;
