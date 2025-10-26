import express from 'express';
import cors from 'cors';
import walletRouter from './routes/walletRoutes';
import safeRouter from './routes/safeRoutes';
import sandboxRouter from './routes/sandboxRoutes';
import licenseRouter from './routes/licenseRoutes';
import { ensureEnvironment, loadEnvironment } from './config/envManager';

const app = express();
const envState = loadEnvironment();

const resolvePort = () => {
  const raw = process.env.PORT ?? envState.values.PORT ?? '4399';
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? 4399 : parsed;
};

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/wallets', walletRouter);
app.use('/api/safes', safeRouter);
app.use('/api/sandbox', sandboxRouter);
app.use('/api/license', licenseRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled backend error:', err);
  res.status(500).json({ message: err.message });
});

if (require.main === module) {
  void ensureEnvironment(envState)
    .then(() => {
      const port = resolvePort();
      app.listen(port, () => {
        console.log(`GNOMAN 2.0 API listening on port ${port}`);
      });
    })
    .catch((error: Error) => {
      console.error('Failed to initialize GNOMAN 2.0 environment:', error);
      process.exit(1);
    });
}

export default app;
