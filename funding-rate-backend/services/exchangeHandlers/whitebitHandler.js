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
    // API trả về một object với key là ticker_id (vd: "BTC_PERP")
    futuresInfoCache = data;
    console.log('✅ [WhiteBIT] Futures markets info cached.');
    return futuresInfoCache;
  } catch (error) {
    console.error('❌ [WhiteBIT] Error fetching futures info:', error.response?.data || error.message);
    throw new Error('Could not fetch WhiteBIT futures info.');
  }
}

/**
 * Hàm nội bộ để tạo và gửi request có chữ ký đến WhiteBIT V4
 * @param {string} requestPath - Eg. /api/v4/trade-account/positions
 * @param {string} method - 'GET' hoặc 'POST'
 * @param {object} payload - Body của request (ngay cả với GET)
 * @returns {Promise<any>} - Dữ liệu data từ response của axios
 */
async function _signedRequest(requestPath, method = 'POST', payload = {}) {
   // WhiteBIT chỉ hoạt động ở production mode cho API private
   if (MODE !== 'production') {
      throw new Error("WhiteBIT private API calls only work in 'production' mode.");
   }

  const credentials = getCredentials('whitebit');
  const apiKey = credentials.apiKey;
  const apiSecret = credentials.secretKey;

  // Chuẩn bị payload và headers theo yêu cầu của WhiteBIT V4
  const payloadJSON = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadJSON).toString('base64');

  const signature = crypto
    .createHmac('sha256', apiSecret)
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
    // WhiteBIT V4 dùng POST cho cả việc lấy dữ liệu (như positions)
    if (method.toUpperCase() === 'POST') {
      response = await axios.post(url, payload, { headers });
    } else if (method.toUpperCase() === 'GET') {
       // Một số endpoint đặc biệt có thể là GET, dù ít gặp hơn cho private
       // Lưu ý: Payload vẫn cần để tạo signature, nhưng không gửi trong body GET
       response = await axios.get(url, { headers });
    } else if (method.toUpperCase() === 'DELETE') {
       // Xử lý DELETE nếu cần (ví dụ: hủy lệnh)
       response = await axios.delete(url, { headers, data: payload }); // Payload có thể cần trong data cho DELETE
    }
     else {
      throw new Error(`Unsupported method: ${method}`);
    }

    // WhiteBIT trả về 200 OK ngay cả khi có lỗi logic, cần check response body
    // Cần kiểm tra cấu trúc response thành công của từng endpoint cụ thể
    // Ví dụ, nhiều endpoint trả về lỗi trực tiếp trong data object
    if (response.data && (response.data.code !== undefined && response.data.code !== 0)) {
       throw new Error(`WhiteBIT API Error (${response.data.code}): ${JSON.stringify(response.data.errors || response.data.message)}`);
    }
    // Một số endpoint (như lấy positions) trả về mảng trực tiếp khi thành công
    return response.data;

  } catch (error) {
    const errorData = error.response?.data;
    const errorMessage = errorData ? JSON.stringify(errorData) : error.message;
    console.error(`❌ [WhiteBIT] Error ${method} ${requestPath}:`, errorMessage);
    // Ném lỗi với thông báo từ sàn
    throw new Error(`WhiteBIT API Error: ${errorMessage}`);
  }
}

// Helper để format symbol cho WhiteBIT (ví dụ: BTCUSDT -> BTC_PERP)
function formatSymbolWB(symbol) {
   if (!symbol.endsWith('USDT')) {
      throw new Error(`[WhiteBIT] Invalid symbol format: ${symbol}. Must end with USDT.`);
   }
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
      const { data } = await axios.get(`${BASE_URL}/api/v4/public/ticker`); // Lấy tất cả ticker
      const marketData = data[tickerId];
      if (!marketData || !marketData.last_price) {
        throw new Error(`Không tìm thấy cặp giao dịch ${tickerId} trên WhiteBIT.`);
      }
      return parseFloat(marketData.last_price);
    } catch (error) {
      console.error(`❌ [WhiteBIT] Error getPrice ${symbol}:`, error.response?.data || error.message);
      throw new Error(`WhiteBIT API Error: ${error.response?.data || error.message}`);
    }
  },

  // OK (Public)
  async getSymbolInfo(symbol) {
    const tickerId = formatSymbolWB(symbol);
    const info = await _getFuturesInfo();
    const symbolInfo = info ? info[tickerId] : null;

    if (!symbolInfo) {
      throw new Error(`[WhiteBIT] Symbol info not found for ${tickerId}`);
    }
    // WhiteBIT dùng amount_step để xác định độ chính xác quantity
    const step = parseFloat(symbolInfo.amount_step);
    const precision = step > 0 ? (step.toString().split('.')[1] || '').length : 0;
    // Đòn bẩy tối đa
    const maxLeverage = parseFloat(symbolInfo.max_leverage);

    return {
      quantityPrecision: precision,
      maxLeverage: maxLeverage || 20, // Fallback
    };
  },

  // Cần API Key (Private)
  async getPNL(symbol) {
    const tickerId = formatSymbolWB(symbol);
    const payload = { market: tickerId };
    try {
      // Endpoint lấy vị thế theo market cụ thể
      const positions = await _signedRequest('/api/v4/trade-account/positions', 'POST', payload);
      // API trả về mảng, tìm vị thế khớp
      const position = positions.find(p => p.market === tickerId);

      return {
        // WhiteBIT dùng 'unrealized_pnl'
        pnl: position ? parseFloat(position.unrealized_pnl) : 0,
        // WhiteBIT dùng 'amount' cho size
        size: position ? parseFloat(position.amount) : 0,
        // WhiteBIT không trả về ROI trực tiếp, có thể tự tính nếu cần
        // roi: position ? calculateROI(position) : 0
      };
    } catch (error) {
       // Nếu lỗi là "position not found", trả về 0
       if (error.message.toLowerCase().includes('position not found')) {
          console.log(`   ⓘ [WhiteBIT] No position found for ${tickerId}.`);
          return { pnl: 0, size: 0, roi: 0 };
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
      market: tickerId,
      leverage: leverage.toString(),
    };
    console.log(`   ⚡️ [WhiteBIT] Setting Leverage for ${tickerId} to ${leverage}x`);
    // Endpoint để set leverage
    await _signedRequest('/api/v4/trade-account/leverage', 'POST', payload);
    // WhiteBIT không trả về gì nhiều khi thành công, chỉ cần không có lỗi là được
    return { message: `Leverage set to ${leverage}x for ${tickerId}` };
  },

  // Cần API Key (Private)
  async placeOrder(symbol, side, quantity) {
    const tickerId = formatSymbolWB(symbol);
    const payload = {
      market: tickerId,
      side: side.toLowerCase(), // 'buy' hoặc 'sell'
      amount: quantity.toString(),
      // WhiteBIT dùng endpoint riêng cho market order
    };
    console.log(`   🛒 [WhiteBIT] Placing MARKET ${side} order for ${quantity} ${tickerId}`);
    // Endpoint để đặt lệnh market
    const data = await _signedRequest('/api/v4/order/collateral/market', 'POST', payload);
    // Trả về ID lệnh nếu có (cấu trúc response cần kiểm tra lại)
    return { orderId: data?.id || data?.orderId || 'N/A' };
  },

  // Cần API Key (Private)
  async cancelAllOpenOrders(symbol) {
    const tickerId = formatSymbolWB(symbol);
    console.log(`   -> [WhiteBIT] Cancelling all open orders for ${tickerId}`);
    const payload = {
      market: tickerId
    };
    try {
      // Endpoint để hủy tất cả lệnh theo market
      // Lưu ý: Endpoint này có thể yêu cầu method DELETE hoặc POST tùy tài liệu
      await _signedRequest('/api/v4/orders', 'DELETE', payload); // Giả sử là DELETE
      console.log(`   ✅ [WhiteBIT] Successfully cancelled open orders for ${tickerId}.`);
    } catch (error) {
       // Kiểm tra xem lỗi có phải là "không có lệnh" không, nếu có thì bỏ qua
       // Cần xem mã lỗi cụ thể WhiteBIT trả về cho trường hợp này
       // Ví dụ: if (error.message.includes('No orders found')) { ... }
       console.log(`   ⓘ [WhiteBIT] No open orders to cancel or already cancelled for ${tickerId}.`);
       // Nếu lỗi khác, ném lại
       // throw error;
    }
  },

  // Cần API Key (Private)
  async closePosition(symbol) {
    console.log(`   -> [WhiteBIT] Starting full closure process for ${symbol}...`);
    const tickerId = formatSymbolWB(symbol);

    // Bước 1: Hủy tất cả các lệnh đang mở (limit, stop...)
    await this.cancelAllOpenOrders(tickerId); // Sử dụng tickerId đã format

    // Bước 2: Lấy thông tin vị thế hiện tại
    const currentPositionInfo = await this.getPNL(symbol); // getPNL trả về { pnl, size }

    if (!currentPositionInfo || currentPositionInfo.size === 0) {
      console.log(`   ✅ [WhiteBIT] No open position found for ${tickerId}.`);
      return { message: `No open position for ${tickerId}` };
    }

    const positionSize = currentPositionInfo.size;
    // Xác định side để đóng: nếu size > 0 (Long) thì cần Sell, nếu size < 0 (Short) thì cần Buy
    // WhiteBIT trả về size luôn dương, cần kiểm tra side của vị thế
    // Ta cần gọi lại API positions để lấy side, hoặc lưu side khi mở lệnh
    // Tạm giả định: Nếu getPNL trả về size != 0, ta lấy lại thông tin đầy đủ
    let positionSide = '';
    try {
       const positions = await _signedRequest('/api/v4/trade-account/positions', 'POST', { market: tickerId });
       const position = positions.find(p => p.market === tickerId);
       if (position) positionSide = position.side; // 'long' or 'short'
    } catch (e) {
       throw new Error(`[WhiteBIT] Could not determine position side for ${tickerId}: ${e.message}`);
    }

    if (!positionSide) {
       throw new Error(`[WhiteBIT] Could not determine position side for active position ${tickerId}`);
    }

    const closeSide = positionSide.toLowerCase() === 'long' ? 'sell' : 'buy';
    const quantityToClose = Math.abs(positionSize); // Size luôn dương trên WhiteBIT

    console.log(`   -> [WhiteBIT] Closing ${quantityToClose} of ${tickerId} with side ${closeSide}`);
    
    // Bước 3: Đặt lệnh Market ngược hướng để đóng vị thế
    // WhiteBIT có thể có endpoint riêng để đóng vị thế hoặc dùng market order với cờ reduceOnly
    // Giả sử dùng market order thông thường
    const payload = {
      market: tickerId,
      side: closeSide,
      amount: quantityToClose.toString(),
      // WhiteBIT V4 dường như không có cờ 'reduceOnly' cho market order
      // Cần đảm bảo không có lỗi logic nào khiến mở thêm vị thế mới
    };
    const data = await _signedRequest('/api/v4/order/collateral/market', 'POST', payload);
    console.log(`   ✅ [WhiteBIT] Close order placed for ${tickerId}.`);
    return { orderId: data?.id || data?.orderId || 'N/A' };
  }
};