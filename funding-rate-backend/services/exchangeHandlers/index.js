// funding-rate-backend/services/exchangeHandlers/index.js
import { binanceHandler } from './binanceHandler.js';
import { bybitHandler } from './bybitHandler.js';
import { whitebitHandler } from './whitebitHandler.js';
import { bitgetHandler } from './bitgetHandler.js';
import { kucoinHandler } from './kucoinHandler.js';
import { gateioHandler } from './gateioHandler.js'; // <-- Import handler mới
import { htxHandler } from './htxHandler.js';
// import { mexcHandler } from './mexcHandler.js';

// Export tất cả handlers
export default {
  binance: binanceHandler,
  bybit: bybitHandler,
  bitget: bitgetHandler,
  gateio: gateioHandler,
  htx: htxHandler,
  kucoin: kucoinHandler,
  whitebit: whitebitHandler,
//   mexc: mexcHandler
};