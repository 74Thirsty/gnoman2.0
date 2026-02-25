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

const app = express();
const port = process.env.PORT ?? 4399;

app.use(cors());
app.use(express.json());

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
  });
  app.listen(port, () => {
    console.log(`GNOMAN 2.0 API listening on port ${port}`);
  });
}

export default app;
