// server.js
import express from 'express';
import basicAuth from 'express-basic-auth';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import https from 'https';
import fs from 'fs';
import selfsigned from 'selfsigned';

dotenv.config(); // Load .env

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4173;

// ⚠️ Basic Auth
const username = process.env.BASIC_AUTH_USER;
const password = process.env.BASIC_AUTH_PASS;

if (!username || !password) {
  console.error('❌ ERROR: BASIC_AUTH_USER and BASIC_AUTH_PASS must be set in .env file');
  process.exit(1);
}

app.use(basicAuth({
  users: { [username]: password },
  challenge: true,
  realm: 'Funding Rate Dashboard',
  unauthorizedResponse: () => 'Unauthorized - Invalid credentials'
}));

// ⚡ API Proxy
const apiProxies = {
  '/binance-api': 'https://fapi.binance.com',
  '/kucoin-api': 'https://api.kucoin.com',
  '/bitget-api': 'https://api.bitget.com',
  '/gate-api': 'https://api.gateio.ws',
  '/htx-api': 'https://api.hbdm.com',
  '/mexc-api': 'https://contract.mexc.com',
  '/whitebit-api': 'https://whitebit.com/api/v4/public',
};

for (const [route, target] of Object.entries(apiProxies)) {
  app.use(route, createProxyMiddleware({
    target,
    changeOrigin: true,
    secure: false,
    pathRewrite: (path) => path.replace(new RegExp(`^${route}`), ''),
    onProxyReq(proxyReq) {
      proxyReq.setHeader('User-Agent', 'Mozilla/5.0');
    },
  }));
}

// Serve static files
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// 🔐 SSL self-signed
const sslDir = path.join(__dirname, 'ssl');
if (!fs.existsSync(sslDir)) fs.mkdirSync(sslDir);

const keyPath = path.join(sslDir, 'key.pem');
const certPath = path.join(sslDir, 'cert.pem');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = selfsigned.generate(attrs, { days: 365 });
  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);
  console.log('✅ SSL self-signed certificate created in ssl/');
}

const sslOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath)
};

// Start HTTPS server
https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
  console.log(`✅ HTTPS Server running on https://0.0.0.0:${PORT}`);
  console.log(`🔐 Basic Auth enabled - Username: ${username}`);
  console.log(`🔄 API Proxies enabled for all exchanges`);
});
