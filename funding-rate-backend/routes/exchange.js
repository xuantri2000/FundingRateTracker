import express from 'express';
import { MODE, EXCHANGES, hasCredentials } from '../services/config.js';
import exchangeHandlers from '../services/exchangeHandlers/index.js';

const router = express.Router();

// GET /api/exchange - Lấy danh sách các sàn
router.get('/', (req, res) => {
  try {
    // MODE và hasCredentials được import từ config
    const exchanges = Object.keys(EXCHANGES).map(id => {
      const config = EXCHANGES[id];
      
      return {
        id,
        name: config.name,
        url: config.urls[MODE],
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

// GET /api/exchange/price?exchange=...&symbol=... - Lấy giá của một cặp trên một sàn
router.get('/price', async (req, res) => {
  const { exchange, symbol } = req.query;

  if (!exchange || !symbol) {
    return res.status(400).json({ error: 'Exchange and symbol are required' });
  }

  const handler = exchangeHandlers[exchange];
  if (!handler || !handler.getPrice) {
    return res.status(404).json({ error: `Exchange '${exchange}' is not supported` });
  }

  try {
    const price = await handler.getPrice(symbol);
    res.json({ price });
  } catch (error) {
    console.error(`❌ Error fetching price for ${symbol} on ${exchange}:`, error.message);
    res.status(500).json({ 
      error: `Không tồn tại cặp giao dịch ${symbol} trên sàn ${exchange}`,
      message: error.message
    });
  }
});

export default router;