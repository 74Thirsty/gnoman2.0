import express from 'express';
import cors from 'cors';
import walletRouter from './routes/walletRoutes';
import safeRouter from './routes/safeRoutes';
import sandboxRouter from './routes/sandboxRoutes';
import licenseRouter from './routes/licenseRoutes';
import settingsRouter from './routes/settingsRoutes';
import keyringRouter from './routes/keyringRoutes';
import contractRouter from './routes/contractRoutes';
import historyRouter from './routes/historyRoutes';
import robinhoodRouter from './routes/robinhoodRoutes';
import etherscanRouter from './routes/etherscanRoutes';
import runtimeRouter from './routes/runtimeRoutes';
import { secretsResolver } from './utils/secretsResolver';
import { safeConfigRepository } from './services/safeConfigRepository';

const app = express();
const port = process.env.PORT ?? 4399;

const logBootEnvironment = () => {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  const gid = typeof process.getgid === 'function' ? process.getgid() : null;
  console.info(
    JSON.stringify({
      event: 'BOOT_ENVIRONMENT',
      uid,
      gid,
      cwd: process.cwd(),
      envPresence: {
        SAFE_CONFIG_PATH: Boolean(process.env.SAFE_CONFIG_PATH),
        SAFE_MODE_ENABLED: Boolean(process.env.SAFE_MODE_ENABLED),
        ETHERSCAN_API_KEY: Boolean(process.env.ETHERSCAN_API_KEY),
        ENABLE_ROBINHOOD_CRYPTO: Boolean(process.env.ENABLE_ROBINHOOD_CRYPTO),
        ROBINHOOD_CRYPTO_API_KEY: Boolean(process.env.ROBINHOOD_CRYPTO_API_KEY)
      }
    })
  );
};

const logIntegrationsBootStatus = async () => {
  const safe = safeConfigRepository.getEffectiveSafeConfig();
  const etherscanKey = await secretsResolver.resolve('ETHERSCAN_API_KEY', { required: false, failClosed: false });
  const etherscanEnabled = Boolean(process.env.ETHERSCAN_ENABLED !== 'false' && etherscanKey);
  const etherscanReason = process.env.ETHERSCAN_ENABLED === 'false' ? 'disabled_flag' : etherscanKey ? 'configured' : 'missing_key';
  const robinhoodEnabled = process.env.ENABLE_ROBINHOOD_CRYPTO === 'true';
  const robinhoodReason = robinhoodEnabled
    ? (await secretsResolver.resolve('ROBINHOOD_CRYPTO_API_KEY', { required: false, failClosed: false }))
      ? 'configured'
      : 'missing creds'
    : 'disabled';

  console.info(JSON.stringify({ event: 'SAFE_MODE', enabled: safe.enabled, safeAddress: safe.address, txSubmissionMode: safe.txSubmissionMode }));
  console.info(JSON.stringify({ event: 'ETHERSCAN', enabled: etherscanEnabled, reason: etherscanReason }));
  console.info(JSON.stringify({ event: 'ROBINHOOD', enabled: robinhoodEnabled, reason: robinhoodReason }));
};

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    service: 'GNOMAN 2.0 API',
    status: 'ok',
    health: '/api/health'
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/wallets', walletRouter);
app.use('/api/safes', safeRouter);
app.use('/api/sandbox', sandboxRouter);
app.use('/api/license', licenseRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/keyring', keyringRouter);
app.use('/api/contracts', contractRouter);
app.use('/api/history', historyRouter);
app.use('/api/brokers/robinhood', robinhoodRouter);
app.use('/api/etherscan', etherscanRouter);
app.use('/api/runtime', runtimeRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled backend error:', err);
  res.status(500).json({ message: err.message });
});

if (require.main === module) {
  logBootEnvironment();
  void secretsResolver.initialize().then(async () => {
    await Promise.all([
      secretsResolver.resolve('GNOMAN_RPC_URL', { required: false, failClosed: false }),
      secretsResolver.resolve('ETHERSCAN_API_KEY', { required: false, failClosed: false }),
      secretsResolver.resolve('ROBINHOOD_CRYPTO_API_KEY', { required: false, failClosed: false })
    ]);
    secretsResolver.logBootSummary(['GNOMAN_RPC_URL', 'ETHERSCAN_API_KEY', 'ROBINHOOD_CRYPTO_API_KEY']);
    await logIntegrationsBootStatus();
  });
  app.listen(port, () => {
    console.log(`GNOMAN 2.0 API listening on port ${port}`);
  });
}

export default app;
