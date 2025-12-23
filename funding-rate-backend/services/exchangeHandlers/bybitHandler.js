import axios from 'axios';
import crypto from 'crypto';
import { MODE, EXCHANGES, getCredentials } from '../config.js';

const CONFIG = EXCHANGES.bybit;
const BASE_URL = CONFIG.urls[MODE];
const RECV_WINDOW = '5000'; // Bybit khuyến nghị

// Cache để lưu thông tin sàn
let instrumentsInfoCache = null;

async function _getInstrumentsInfo() {
  if (instrumentsInfoCache) return instrumentsInfoCache;
  try {
    console.log('⏳ [Bybit] Fetching instruments info...');
    const { data } = await axios.get(`${BASE_URL}/v5/market/instruments-info`, {
      params: { category: 'linear' }
    });
    if (data.retCode !== 0) throw new Error(data.retMsg);
    instrumentsInfoCache = data.result.list;
    console.log('✅ [Bybit] Instruments info cached.');
    return instrumentsInfoCache;
  } catch (error) {
    throw new Error(`Could not fetch Bybit instruments info: ${error.message}`);
  }
}

/**
 * Hàm nội bộ để tạo và gửi request có chữ ký đến Bybit
 * @param {string} endpoint - Eg. /v5/position/set-leverage
 * @param {string} method - 'GET' hoặc 'POST'
 * @param {object | string} payload - Body (cho POST) hoặc query string (cho GET)
 * @returns {Promise<any>} - Dữ liệu data từ response của axios
 */
async function _signedRequest(endpoint, method = 'POST', payload = {}) {
  const credentials = getCredentials('bybit');
  const timestamp = Date.now().toString();
  
  let paramStr = '';
  const isPost = method === 'POST';
  
  if (isPost) {
    paramStr = timestamp + credentials.apiKey + RECV_WINDOW + JSON.stringify(payload);
  } else { // GET
    // payload ở đây là query string, vd: "category=linear&symbol=BTCUSDT"
    paramStr = timestamp + credentials.apiKey + RECV_WINDOW + payload;
  }

  const signature = crypto
    .createHmac('sha256', credentials.secretKey)
    .update(paramStr)
    .digest('hex');

  const headers = {
    'X-BAPI-API-KEY': credentials.apiKey,
    'X-BAPI-SIGN': signature,
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-RECV-WINDOW': RECV_WINDOW,
    'Content-Type': 'application/json'
  };

  const url = `${BASE_URL}${endpoint}`;

  try {
    let response;
    if (isPost) {
      response = await axios.post(url, payload, { headers });
    } else {
      response = await axios.get(`${url}?${payload}`, { headers });
    }
    
    if (response.data.retCode !== 0) {
      // Bybit trả 200 OK ngay cả khi có lỗi, cần check retCode
      throw new Error(response.data.retMsg || 'Bybit API Error');
    }
    return response.data;

  } catch (error) {
    console.error(`❌ [Bybit] Error ${method} ${endpoint}:`, error.response?.data || error.message);
    throw new Error(`Bybit API Error: ${error.response?.data?.retMsg || error.message}`);
  }
}

// ============================================
// BYBIT HANDLER
// ============================================
export const bybitHandler = {
  
  async getPrice(symbol) {
    try {
      const { data } = await axios.get(`${BASE_URL}/v5/market/tickers`, {
        params: { 
          category: 'linear',
          symbol 
        }
      });
      if (data.retCode !== 0) throw new Error(data.retMsg);
      const ticker = data.result.list[0];
      if (!ticker || !ticker.lastPrice) {
        throw new Error(`Không tìm thấy cặp giao dịch ${symbol} trên Bybit.`);
      }
      return parseFloat(ticker.lastPrice);
    } catch (error) {
       console.error(`❌ [Bybit] Error getPrice ${symbol}:`, error.response?.data || error.message);
      throw new Error(`Bybit API Error: ${error.response?.data?.retMsg || error.message}`);
    }
  },

  async getSymbolInfo(symbol) {
    const info = await _getInstrumentsInfo();
    const symbolInfo = info.find(i => i.symbol === symbol);
    if (!symbolInfo) {
      throw new Error(`[Bybit] Symbol info not found for ${symbol}`);
    }
    // Bybit dùng stepSize để xác định độ chính xác. Ví dụ: stepSize "0.001" -> precision 3
    const stepSize = parseFloat(symbolInfo.lotSizeFilter.qtyStep);
    const precision = stepSize > 0 ? (stepSize.toString().split('.')[1] || '').length : 0;

    // Lấy đòn bẩy tối đa từ leverageFilter
    const maxLeverage = parseFloat(symbolInfo.leverageFilter.maxLeverage);

    return {
      quantityPrecision: precision,
      maxLeverage: maxLeverage || 20, // Fallback
    };
  },

  async getPNL(symbol) {
    const queryString = `category=linear&symbol=${symbol}`;
    const data = await _signedRequest('/v5/position/list', 'GET', queryString);
    // Bybit có thể trả về một đối tượng vị thế với size = "0".
    // Chúng ta chỉ quan tâm đến các vị thế đang hoạt động thực sự (size > 0).
    const position = data.result.list.find(p => p.symbol === symbol && parseFloat(p.size) > 0);
    return {
      pnl: position ? parseFloat(position.unrealisedPnl) : 0,
      size: position ? parseFloat(position.size) : 0,
      // positionIM có thể là "" nếu không có vị thế, cần fallback về 0
	  isolatedMargin: position ? parseFloat(position.positionIM || 0) : 0,
    };
  },

  async setMarginType(symbol, marginType) {
    if (marginType.toUpperCase() === 'ISOLATED') {
      console.log(`   ⓘ [Bybit] Margin mode is handled by leverage settings in Unified Trading Accounts. Skipping explicit margin type switch for ${symbol}.`);
      return; // Bỏ qua hàm này cho Bybit UTA vì không cần thiết và sẽ gây lỗi.
    }
    console.warn(`   ⚠️  [Bybit] Attempted to set margin type to ${marginType}, which is not standard for UTA. Request ignored.`);
  },

  async setLeverage(symbol, leverage) {
    const leverageStr = leverage.toString();
    console.log(`   ⚡️ [Bybit] Checking and setting Leverage for ${symbol} to ${leverageStr}x`);

    // 1. Lấy thông tin vị thế để kiểm tra đòn bẩy hiện tại
    const queryString = `category=linear&symbol=${symbol}`;
    try {
      const positionData = await _signedRequest('/v5/position/list', 'GET', queryString);
      const currentPosition = positionData.result.list.find(p => p.symbol === symbol);

      // Bybit trả về đòn bẩy dưới dạng string, ví dụ "10"
      if (currentPosition && currentPosition.leverage === leverageStr) {
        console.log(`   ✅ [Bybit] Leverage for ${symbol} is already ${leverageStr}x. No change needed.`);
        return; // Đòn bẩy đã đúng, không cần thay đổi
      }
    } catch (error) {
       console.warn(`   ⚠️  [Bybit] Could not fetch current leverage for ${symbol}. Proceeding with setting it. Error: ${error.message}`);
    }

    // 2. Nếu đòn bẩy chưa đúng, gọi API để thay đổi
    console.log(`   🔄 [Bybit] Changing Leverage for ${symbol} to ${leverageStr}x.`);
    const payload = {
      category: 'linear',
      symbol,
      buyLeverage: leverageStr,
      sellLeverage: leverageStr
    };
    return _signedRequest('/v5/position/set-leverage', 'POST', payload);
  },

  async getAllOpenOrders(symbol) {
    const queryString = `category=linear&symbol=${symbol}`;
    const data = await _signedRequest('/v5/order/realtime', 'GET', queryString);
    return data.result.list || [];
  },

  async placeOrder(symbol, side, quantity, leverage, price) {
    const payload = {
      category: 'linear',
      symbol,
      side: side === 'BUY' ? 'Buy' : 'Sell',
      orderType: 'Limit',
      qty: quantity.toString(),
      price: price.toString(),
      timeInForce: 'GTC',
    };
    
    const data = await _signedRequest('/v5/order/create', 'POST', payload);
    return { orderId: data.result.orderId };
  },

  async cancelAllOpenOrders(symbol) {
    console.log(`   -> [Bybit] Cancelling all open orders for ${symbol}`);
    const payload = { category: 'linear', symbol };
    try {
      await _signedRequest('/v5/order/cancel-all', 'POST', payload);
      console.log(`   ✅ [Bybit] Successfully cancelled open orders for ${symbol}.`);
    } catch (error) {
      // Bybit có thể trả về lỗi nếu không có lệnh nào để hủy, chúng ta có thể bỏ qua
      console.log(`   ⓘ [Bybit] No open orders to cancel or already cancelled for ${symbol}.`);
    }
  },

  async closePosition(symbol) {
    console.log(`   -> [Bybit] Starting full closure process for ${symbol}...`);

    // Bước 1: Hủy tất cả các lệnh đang mở
    await this.cancelAllOpenOrders(symbol);

    // 2. Lấy thông tin vị thế hiện tại để đóng
    const queryString = `category=linear&symbol=${symbol}`;
    const positionData = await _signedRequest('/v5/position/list', 'GET', queryString);
    const currentPosition = positionData.result.list.find(p => p.symbol === symbol && parseFloat(p.size) > 0);

    if (!currentPosition || parseFloat(currentPosition.size) === 0) {
      console.log(`   ✅ [Bybit] No open position found for ${symbol}.`);
      return { message: `No open position for ${symbol}` };
    }

    const positionSize = parseFloat(currentPosition.size);
    const closeSide = currentPosition.side === 'Buy' ? 'Sell' : 'Buy'; // Nếu đang Buy, thì bán. Nếu đang Sell, thì mua.

    console.log(`   -> [Bybit] Closing ${positionSize} of ${symbol} with side ${closeSide}`);
    const payload = {
      category: 'linear',
      symbol,
      side: closeSide,
      orderType: 'Market',
      qty: positionSize.toString(),
      reduceOnly: true // Đảm bảo lệnh này chỉ dùng để đóng vị thế
    };
    const data = await _signedRequest('/v5/order/create', 'POST', payload);
    return { orderId: data.result.orderId };
  }
};