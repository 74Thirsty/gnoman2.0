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
import { runtimeTelemetry } from './services/runtimeTelemetryService';

const app = express();
const port = process.env.PORT ?? 4399;

const logBootEnvironment = () => {
  const etherscanEnabledFlag = process.env.ETHERSCAN_ENABLED !== 'false';
  const etherscanKeyPresent = Boolean(process.env.ETHERSCAN_API_KEY?.trim());
  const chainId = Number.parseInt(process.env.ETHERSCAN_CHAIN_ID ?? '1', 10);
  const etherscanReason = !etherscanEnabledFlag
    ? 'disabled_flag'
    : !etherscanKeyPresent
      ? 'missing_key'
      : !Number.isFinite(chainId) || chainId <= 0
        ? 'unsupported_chain'
        : 'ok';

  const robinhoodEnabled = process.env.ENABLE_ROBINHOOD_CRYPTO === 'true';
  const robinhoodCredsPresent = Boolean(
    process.env.ROBINHOOD_CRYPTO_API_KEY?.trim() && process.env.ROBINHOOD_CRYPTO_PRIVATE_KEY?.trim()
  );
  const robinhoodReason = !robinhoodEnabled ? 'disabled' : robinhoodCredsPresent ? 'ok' : 'missing_creds';

  console.info(
    JSON.stringify({
      event: 'PROCESS_ENV_SNAPSHOT',
      uid: typeof process.getuid === 'function' ? process.getuid() : null,
      gid: typeof process.getgid === 'function' ? process.getgid() : null,
      cwd: process.cwd(),
      env: {
        SAFE_CONFIG_PATH: Boolean(process.env.SAFE_CONFIG_PATH),
        ETHERSCAN_API_KEY: etherscanKeyPresent,
        ETHERSCAN_ENABLED: process.env.ETHERSCAN_ENABLED ?? '(unset)',
        ROBINHOOD_CRYPTO_API_KEY: Boolean(process.env.ROBINHOOD_CRYPTO_API_KEY),
        ROBINHOOD_CRYPTO_PRIVATE_KEY: Boolean(process.env.ROBINHOOD_CRYPTO_PRIVATE_KEY),
        ENABLE_ROBINHOOD_CRYPTO: process.env.ENABLE_ROBINHOOD_CRYPTO ?? '(unset)'
      }
    })
  );
  console.info(JSON.stringify({ event: `ETHERSCAN: enabled=${etherscanReason === 'ok'} (reason=${etherscanReason})` }));
  console.info(JSON.stringify({ event: `ROBINHOOD: enabled=${robinhoodReason === 'ok'} (reason=${robinhoodReason})` }));
  runtimeTelemetry.setRobinhoodEnabled(robinhoodEnabled);
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

void auditSecretsAtBoot([
  { key: 'GNOMAN_RPC_URL', required: false },
  { key: 'RPC_URL', required: false },
  { key: 'ETHERSCAN_API_KEY', required: false },
  { key: 'ROBINHOOD_CRYPTO_API_KEY', required: false },
  { key: 'ROBINHOOD_CRYPTO_PRIVATE_KEY', required: false },
  { key: 'DISCORD_WEBHOOK_URL', required: false }
]);

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
  void secretsResolver.initialize().then(async () => {
    await Promise.all([
      secretsResolver.resolve('GNOMAN_RPC_URL', { required: false, failClosed: false }),
      secretsResolver.resolve('ETHERSCAN_API_KEY', { required: false, failClosed: false }),
      secretsResolver.resolve('ROBINHOOD_CRYPTO_API_KEY', { required: false, failClosed: false })
    ]);
    secretsResolver.logBootSummary(['GNOMAN_RPC_URL', 'ETHERSCAN_API_KEY', 'ROBINHOOD_CRYPTO_API_KEY']);
    logBootEnvironment();
  });
  app.listen(port, () => {
    console.log(`GNOMAN 2.0 API listening on port ${port}`);
  });
}

export default app;

async function auditSecretsAtBoot(items: { key: string; required: boolean }[]) {
  const results = await Promise.all(
    items.map(async (item) => {
      const resolved = await secretsResolver.resolve(item.key, { required: item.required, failClosed: false });
      return {
        key: item.key,
        required: item.required,
        present: Boolean(resolved)
      };
    })
  );

  console.info(JSON.stringify({ event: 'BOOT_SECRET_AUDIT', results }));
}
