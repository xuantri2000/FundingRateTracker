// funding-rate-backend/services/exchangeHandlers/whitebitHandler.js
import axios from 'axios';
import crypto from 'crypto';
import { MODE, EXCHANGES, getCredentials } from '../config.js';

const CONFIG = EXCHANGES.whitebit;
// Luôn dùng production URL vì không có testnet Futures
const BASE_URL = CONFIG.urls.production;

// Cache để lưu thông tin futures markets
let futuresInfoCache = null;

async function _getFuturesInfo() {
  if (futuresInfoCache) return futuresInfoCache;
  try {
    console.log('⏳ [WhiteBIT] Fetching futures markets info...');
    // Endpoint public để lấy thông tin các cặp futures
    const { data } = await axios.get(`${BASE_URL}/api/v4/public/futures`);
    // ✅ API trả về { success: true, message: null, result: [...] }
    if (data.success && Array.isArray(data.result)) {
      futuresInfoCache = data.result;
      console.log(`✅ [WhiteBIT] Futures markets info cached: ${futuresInfoCache.length} markets`);
      return futuresInfoCache;
    } else {
      throw new Error('Invalid futures API response format');
    }
  } catch (error) {
    console.error('❌ [WhiteBIT] Error fetching futures info:', error.response?.data || error.message);
    throw new Error('Could not fetch WhiteBIT futures info.');
  }
}

/**
 * Gửi request có chữ ký đến WhiteBIT API V4
 * @param {string} requestPath - Đường dẫn API, ví dụ: /api/v4/collateral-account/balance
 * @param {string} method - 'POST', 'GET', hoặc 'DELETE'
 * @param {object} payload - Dữ liệu body
 * @returns {Promise<any>} - Dữ liệu phản hồi từ WhiteBIT
 */
async function _signedRequest(requestPath, method = 'POST', payload = {}) {
  const credentials = getCredentials('whitebit');
  const apiKey = credentials.apiKey;
  const apiSecret = credentials.secretKey;

  // ✅ BẮT BUỘC: WhiteBIT yêu cầu trường request + nonce trong body
  if (!payload.request) {
    payload.request = requestPath;
  }
  if (!payload.nonce) {
    payload.nonce = Date.now();
  }

  // Chuẩn bị payload và ký HMAC SHA512
  const payloadJSON = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadJSON).toString('base64');

  const signature = crypto
    .createHmac('sha512', apiSecret)
    .update(payloadBase64)
    .digest('hex');

  const headers = {
    'Content-Type': 'application/json',
    'X-TXC-APIKEY': apiKey,
    'X-TXC-PAYLOAD': payloadBase64,
    'X-TXC-SIGNATURE': signature,
  };

  const url = `${BASE_URL}${requestPath}`;

  try {
    let response;
    switch (method.toUpperCase()) {
      case 'POST':
        response = await axios.post(url, payload, { headers });
        break;
      case 'GET':
        response = await axios.get(url, { headers });
        break;
      case 'DELETE':
        response = await axios.delete(url, { headers, data: payload });
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }

    // WhiteBIT có thể trả lỗi trong body dù HTTP 200
    if (response.data && (response.data.code !== undefined && response.data.code !== 0)) {
      throw new Error(
        `WhiteBIT API Error (${response.data.code}): ${
          JSON.stringify(response.data.errors || response.data.message)
        }`
      );
    }

    return response.data;
  } catch (error) {
    const errorData = error.response?.data;
    const errorMessage = errorData ? JSON.stringify(errorData) : error.message;
    console.error(`❌ [WhiteBIT] Error ${method} ${requestPath}:`, errorMessage);
    throw new Error(`WhiteBIT API Error: ${errorMessage}`);
  }
}

// Helper để format symbol cho WhiteBIT (ví dụ: BTCUSDT -> BTC_PERP)
function formatSymbolWB(symbol) {
   if (!symbol.endsWith('USDT')) {
      throw new Error(`[WhiteBIT] Invalid symbol format: ${symbol}. Must end with USDT.`);
   }
   // WhiteBIT dùng ticker_id: BTC_PERP cho futures perpetual
   return symbol.replace('USDT', '_PERP');
}

// ============================================
// WHITEBIT HANDLER
// ============================================
export const whitebitHandler = {

  // OK (Public)
  async getPrice(symbol) {
    try {
      const tickerId = formatSymbolWB(symbol);
      // ✅ Lấy từ futures API vì ticker chỉ có spot
      const info = await _getFuturesInfo();
      const marketData = info.find(m => m.ticker_id === tickerId);
      
      if (!marketData || !marketData.last_price) {
        throw new Error(`Không tìm thấy cặp giao dịch ${tickerId} trên WhiteBIT.`);
      }
      return parseFloat(marketData.last_price);
    } catch (error) {
      console.error(`❌ [WhiteBIT] Error getPrice ${symbol}:`, error.message);
      throw new Error(`WhiteBIT API Error: ${error.message}`);
    }
  },

  // OK (Public)
  async getSymbolInfo(symbol) {
    const tickerId = formatSymbolWB(symbol);
    const info = await _getFuturesInfo();
    // ✅ Tìm trong array dựa trên ticker_id
    const symbolInfo = info.find(item => item.ticker_id === tickerId);

    if (!symbolInfo) {
      throw new Error(`[WhiteBIT] Symbol info not found for ${tickerId}`);
    }
    
    // WhiteBIT futures không có amount_step trong response, dùng giá trị mặc định
    // Dựa vào stock_currency để xác định precision
    const precision = symbolInfo.stock_currency === 'BTC' ? 3 : 2;
    const maxLeverage = parseInt(symbolInfo.max_leverage) || 100;

    return {
      quantityPrecision: precision,
      maxLeverage: maxLeverage,
    };
  },

  // Cần API Key (Private)
  async getPNL(symbol) {
    const tickerId = formatSymbolWB(symbol);
    const payload = { 
      market: tickerId,
      request: '/api/v4/collateral-account/positions/open',
      nonce: Date.now()
    };
    try {
      // ✅ Endpoint đúng cho collateral/futures positions
      const positions = await _signedRequest('/api/v4/collateral-account/positions/open', 'POST', payload);
      
      // API trả về mảng, tìm vị thế khớp
      const position = Array.isArray(positions) 
        ? positions.find(p => p.market === tickerId) 
        : null;

      return {
        // WhiteBIT dùng 'pnl' cho unrealized PNL
        pnl: position ? parseFloat(position.pnl) : 0,
        // WhiteBIT dùng 'amount' cho size
        size: position ? parseFloat(position.amount) : 0,
        // WhiteBIT có pnlPercent
        roi: position ? parseFloat(position.pnlPercent) : 0,
		isolatedMargin: position ? parseFloat(position.margin) : 0,
      };
    } catch (error) {
       // Nếu lỗi là "position not found", trả về 0
       if (error.message.toLowerCase().includes('position not found') || 
           error.message.toLowerCase().includes('no positions')) {
          console.log(`   ⓘ [WhiteBIT] No position found for ${tickerId}.`);
          return { pnl: 0, size: 0, roi: 0 };
       }
       // Nếu lỗi khác, ném lại lỗi
       throw error;
    }
  },

  // Cần API Key (Private)
  async getAllPositions() {
    try {
      // ✅ Endpoint đúng, payload chỉ cần request và nonce
      const payload = {
        request: '/api/v4/collateral-account/positions/open',
        nonce: Date.now()
      };
      const positions = await _signedRequest('/api/v4/collateral-account/positions/open', 'POST', payload);
      // API trả về mảng rỗng nếu không có vị thế
      return Array.isArray(positions) ? positions : [];
    } catch (error) {
       // Nếu lỗi là "position not found", trả về mảng rỗng
       if (error.message.toLowerCase().includes('position not found') || 
           error.message.toLowerCase().includes('no positions')) {
          console.log(`   ⓘ [WhiteBIT] No open positions found.`);
          return [];
       }
       // Nếu lỗi khác, ném lại lỗi
       throw error;
    }
  },

   // WhiteBIT chỉ hỗ trợ Isolated Margin cho Futures V4
  async setMarginType(symbol, marginType) {
    if (marginType.toUpperCase() !== 'ISOLATED') {
      console.warn(`   ⚠️  [WhiteBIT] Only ISOLATED margin type is supported for V4 Futures. Request to set ${marginType} ignored.`);
    } else {
      console.log(`   ⓘ [WhiteBIT] Futures V4 is ISOLATED by default. No action needed for ${symbol}.`);
    }
    return; // Không cần làm gì
  },

  // Cần API Key (Private)
  async setLeverage(symbol, leverage) {
    const tickerId = formatSymbolWB(symbol);
    const payload = {
      leverage: leverage, // ✅ Gửi dạng số, không cần toString
      request: '/api/v4/collateral-account/leverage',
      nonce: Date.now()
    };
    console.log(`   ⚡️ [WhiteBIT] Setting Leverage for account to ${leverage}x`);
    // ✅ Endpoint đúng - leverage áp dụng cho toàn bộ collateral account
    const result = await _signedRequest('/api/v4/collateral-account/leverage', 'POST', payload);
    return { message: `Leverage set to ${leverage}x for collateral account` };
  },

  // Cần API Key (Private)
  async placeOrder(symbol, side, quantity) {
    const tickerId = formatSymbolWB(symbol);
    const payload = {
      market: tickerId,
      side: side.toLowerCase(), // 'buy' hoặc 'sell'
      amount: quantity.toString(),
      request: '/api/v4/order/collateral/market',
      nonce: Date.now()
    };
    console.log(`   🛒 [WhiteBIT] Placing MARKET ${side} order for ${quantity} ${tickerId}`);
    // ✅ Endpoint đúng cho collateral/futures market order
    const data = await _signedRequest('/api/v4/order/collateral/market', 'POST', payload);
    // Trả về ID lệnh
    return { orderId: data?.orderId || 'N/A' };
  },

  // Cần API Key (Private)
  async cancelAllOpenOrders(symbol) {
    const tickerId = formatSymbolWB(symbol);
    console.log(`   -> [WhiteBIT] Cancelling all open orders for ${tickerId}`);
    const payload = {
      market: tickerId,
      type: ["Futures"], // ✅ Chỉ cancel futures orders
      request: '/api/v4/order/cancel/all',
      nonce: Date.now()
    };
    try {
      // ✅ Endpoint đúng - POST method
      await _signedRequest('/api/v4/order/cancel/all', 'POST', payload);
      console.log(`   ✅ [WhiteBIT] Successfully cancelled open orders for ${tickerId}.`);
    } catch (error) {
       // Bỏ qua nếu không có lệnh để cancel
       console.log(`   ⓘ [WhiteBIT] No open orders to cancel or already cancelled for ${tickerId}.`);
    }
  },

  // Cần API Key (Private)
  async closePosition(symbol) {
    console.log(`   -> [WhiteBIT] Starting full closure process for ${symbol}...`);
    const tickerId = formatSymbolWB(symbol);

    // Bước 1: Hủy tất cả các lệnh đang mở (limit, stop...)
    await this.cancelAllOpenOrders(symbol);

    // Bước 2: Lấy thông tin vị thế hiện tại
    const currentPositionInfo = await this.getPNL(symbol);

    if (!currentPositionInfo || currentPositionInfo.size === 0) {
      console.log(`   ✅ [WhiteBIT] No open position found for ${tickerId}.`);
      return { message: `No open position for ${tickerId}` };
    }

    const positionSize = currentPositionInfo.size;
    
    // Bước 3: Lấy lại thông tin đầy đủ để xác định side
    let positionSide = '';
    try {
       const payload = {
          market: tickerId,
          request: '/api/v4/collateral-account/positions/open',
          nonce: Date.now()
       };
       const positions = await _signedRequest('/api/v4/collateral-account/positions/open', 'POST', payload);
       const position = Array.isArray(positions) 
         ? positions.find(p => p.market === tickerId) 
         : null;
       
       if (position) {
          // ✅ Xác định side dựa trên amount: dương = long, âm = short
          positionSide = parseFloat(position.amount) > 0 ? 'long' : 'short';
       }
    } catch (e) {
       throw new Error(`[WhiteBIT] Could not determine position side for ${tickerId}: ${e.message}`);
    }

    if (!positionSide) {
       throw new Error(`[WhiteBIT] Could not determine position side for active position ${tickerId}`);
    }

    const closeSide = positionSide.toLowerCase() === 'long' ? 'sell' : 'buy';
    const quantityToClose = Math.abs(positionSize);

    console.log(`   -> [WhiteBIT] Closing ${quantityToClose} of ${tickerId} with side ${closeSide}`);
    
    // Bước 4: Đặt lệnh Market ngược hướng để đóng vị thế
    const payload = {
      market: tickerId,
      side: closeSide,
      amount: quantityToClose.toString(),
      request: '/api/v4/order/collateral/market',
      nonce: Date.now()
    };
    const data = await _signedRequest('/api/v4/order/collateral/market', 'POST', payload);
    console.log(`   ✅ [WhiteBIT] Close order placed for ${tickerId}.`);
    return { orderId: data?.orderId || 'N/A' };
  }
};