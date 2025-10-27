// funding-rate-backend/services/exchangeHandlers/index.js
import { binanceHandler } from './binanceHandler.js';
import { bybitHandler } from './bybitHandler.js';
import { whitebitHandler } from './whitebitHandler.js'; // <-- Import handler mới

// Export tất cả handlers
export default {
  binance: binanceHandler,
  bybit: bybitHandler,
  whitebit: whitebitHandler // <-- Thêm vào đây
};