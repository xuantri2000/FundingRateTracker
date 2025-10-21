// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import exchangeRoutes from './routes/exchange.js';
import orderRoutes from './routes/order.js';

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/exchange', exchangeRoutes);
app.use('/api/order', orderRoutes);

// Health check
app.get('/health', (req, res) => {
  const MODE = process.env.TRADING_MODE || 'testnet';
  res.json({ 
    status: 'ok', 
    mode: MODE,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Trading mode: ${process.env.TRADING_MODE || 'testnet'}`);
});