// funding-rate-backend/services/exchangeHandlers/index.js
import { binanceHandler } from './binanceHandler.js';
import { bybitHandler } from './bybitHandler.js';
import { whitebitHandler } from './whitebitHandler.js';
import { bitgetHandler } from './bitgetHandler.js'; // <-- Import handler mới

// Export tất cả handlers
export default {
  binance: binanceHandler,
  bybit: bybitHandler,
  whitebit: whitebitHandler,
  bitget: bitgetHandler // <-- Thêm vào đây
};