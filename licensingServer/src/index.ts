import express from 'express';
import rateLimit from 'express-rate-limit';
import { loadKeysOrExit } from './config/keys';
import { licensesRouter } from './routes/licenses';

const keys = loadKeysOrExit();

const app = express();

app.use(express.json({ limit: '16kb' }));

app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false
  })
);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/licenses', licensesRouter(keys));

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`licensingServer listening on :${port}`);
});
