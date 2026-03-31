cd ~/Apps/Github/gnoman2.0
cat > webhook-shim.js <<'EOF'
const express = require("express");
const crypto = require("crypto");

const app = express();

const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || "change-me";
const APP_SECRET = process.env.FB_APP_SECRET || "";

app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK_VERIFIED");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

function validSig(req) {
  if (!APP_SECRET) return true; // allow if you haven't set secret yet
  const sig = req.headers["x-hub-signature-256"];
  if (!sig) return false;

  const expected = crypto.createHmac("sha256", APP_SECRET).update(req.rawBody).digest("hex");
  return sig === `sha256=${expected}`;
}

app.post("/webhook", async (req, res) => {
  if (!validSig(req)) return res.sendStatus(403);

  // Log payload so you KNOW it is arriving
  console.log("WEBHOOK_EVENT:", JSON.stringify(req.body));

  // Return fast (Meta requires <= 5s)
  return res.status(200).send("EVENT_RECEIVED");
});

app.listen(4455, "127.0.0.1", () => {
  console.log("Webhook shim listening on http://127.0.0.1:4455/webhook");
});
EOF
node webhook-shim.js
