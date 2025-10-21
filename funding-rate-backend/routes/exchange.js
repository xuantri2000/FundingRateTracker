import express from 'express';
const router = express.Router();

// Cấu hình các sàn giao dịch
const EXCHANGE_CONFIG = {
  binance: {
    production: 'https://fapi.binance.com',
    testnet: 'https://testnet.binancefuture.com',
    name: 'Binance Futures'
  },
  bybit: {
    production: 'https://api.bybit.com',
    testnet: 'https://api-testnet.bybit.com',
    name: 'Bybit'
  }
};

// Kiểm tra xem sàn có API credentials không
const hasCredentials = (exchangeId) => {
  const prefix = exchangeId.toUpperCase();
  const apiKey = process.env[`${prefix}_API_KEY`];
  const secretKey = process.env[`${prefix}_SECRET_KEY`];
  return !!(apiKey && secretKey);
};

// GET /api/exchange - Lấy danh sách các sàn
router.get('/', (req, res) => {
  try {
    const MODE = process.env.TRADING_MODE || 'testnet';
    
    const exchanges = Object.keys(EXCHANGE_CONFIG).map(id => {
      const config = EXCHANGE_CONFIG[id];
      
      return {
        id,
        name: config.name,
        url: config[MODE],
        hasCredentials: hasCredentials(id),
        mode: MODE
      };
    });

    // Log info khi có request
    console.log(`📋 Fetched ${exchanges.length} exchanges (mode: ${MODE})`);
    exchanges.forEach(ex => {
      console.log(`   - ${ex.name}: ${ex.hasCredentials ? '✅' : '❌'}`);
    });

    res.json(exchanges);
  } catch (error) {
    console.error('❌ Error fetching exchanges:', error);
    res.status(500).json({ error: 'Failed to fetch exchanges' });
  }
});

export default router;