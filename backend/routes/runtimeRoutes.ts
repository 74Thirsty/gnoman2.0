import { Router } from 'express';
import { runtimeTelemetry } from '../services/runtimeTelemetryService';
import { safeConfigRepository } from '../services/safeConfigRepository';
import { secretsResolver } from '../utils/secretsResolver';

const router = Router();

router.get('/telemetry', (_req, res) => {
  res.json(runtimeTelemetry.getSnapshot());
});

router.get('/capabilities', async (_req, res) => {
  const safe = safeConfigRepository.getEffectiveSafeConfig();
  const etherscanKey = await secretsResolver.resolve('ETHERSCAN_API_KEY', { required: false, failClosed: false });
  const robinhoodKey = await secretsResolver.resolve('ROBINHOOD_CRYPTO_API_KEY', { required: false, failClosed: false });
  res.json({
    safe: { enabled: safe.enabled, reason: safe.enabled ? 'configured' : 'disabled' },
    etherscan: {
      enabled: process.env.ETHERSCAN_ENABLED !== 'false' && Boolean(etherscanKey),
      reason: process.env.ETHERSCAN_ENABLED === 'false' ? 'disabled_flag' : etherscanKey ? 'configured' : 'missing_key'
    },
    robinhood: {
      enabled: process.env.ENABLE_ROBINHOOD_CRYPTO === 'true' && Boolean(robinhoodKey),
      reason:
        process.env.ENABLE_ROBINHOOD_CRYPTO === 'true'
          ? robinhoodKey
            ? 'configured'
            : 'missing creds'
          : 'disabled'
    }
  });
});

export default router;
