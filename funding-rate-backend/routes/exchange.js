import express from 'express';
import { MODE, EXCHANGES, hasCredentials } from '../services/config.js';

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

export default router;