import { Router } from 'express';
import { runtimeTelemetry } from '../services/runtimeTelemetryService';

const router = Router();

router.get('/telemetry', (_req, res) => {
  res.json(runtimeTelemetry.getSnapshot());
});

router.get('/capabilities', (_req, res) => {
  const safeEnabled = true;
  const etherscanEnabled = process.env.ETHERSCAN_ENABLED !== 'false' && Boolean(process.env.ETHERSCAN_API_KEY?.trim());
  const robinhoodEnabled = process.env.ENABLE_ROBINHOOD_CRYPTO === 'true' && Boolean(process.env.ROBINHOOD_CRYPTO_API_KEY?.trim()) && Boolean(process.env.ROBINHOOD_CRYPTO_PRIVATE_KEY?.trim());
  res.json({
    safe: { enabled: safeEnabled, reason: safeEnabled ? 'ok' : 'disabled' },
    etherscan: {
      enabled: etherscanEnabled,
      reason: process.env.ETHERSCAN_ENABLED === 'false' ? 'disabled_flag' : process.env.ETHERSCAN_API_KEY?.trim() ? 'ok' : 'missing_key'
    },
    robinhood: {
      enabled: robinhoodEnabled,
      reason: process.env.ENABLE_ROBINHOOD_CRYPTO !== 'true' ? 'disabled' : robinhoodEnabled ? 'ok' : 'missing_creds'
    }
  });
});

export default router;
