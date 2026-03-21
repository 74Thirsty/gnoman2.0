const express = require('express');
const crypto = require('crypto');

const app = express();
const port = Number.parseInt(process.env.WEBHOOK_SHIM_PORT ?? '4455', 10);
const host = process.env.WEBHOOK_SHIM_HOST ?? '127.0.0.1';
const verifyToken = process.env.FB_VERIFY_TOKEN ?? 'change-me';
const appSecret = process.env.FB_APP_SECRET ?? '';

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })
);

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK_VERIFIED');
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

const validSignature = (req) => {
  if (!appSecret) {
    return true;
  }

  const signature = req.headers['x-hub-signature-256'];
  if (typeof signature !== 'string') {
    return false;
  }

  const expected = crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
  return signature === `sha256=${expected}`;
};

app.post('/webhook', async (req, res) => {
  if (!validSignature(req)) {
    return res.sendStatus(403);
  }

  console.log('WEBHOOK_EVENT:', JSON.stringify(req.body));
  return res.status(200).send('EVENT_RECEIVED');
});

app.listen(port, host, () => {
  console.log(`Webhook shim listening on http://${host}:${port}/webhook`);
});
