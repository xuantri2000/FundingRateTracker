import axios from 'axios';
import crypto from 'crypto';
import { MODE, EXCHANGES, getCredentials } from '../config.js';

const CONFIG = EXCHANGES.bybit;
const BASE_URL = CONFIG.urls[MODE];
const RECV_WINDOW = '5000'; // Bybit khuyến nghị

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
      return parseFloat(data.result.list[0].lastPrice);
    } catch (error) {
       console.error(`❌ [Bybit] Error getPrice ${symbol}:`, error.response?.data || error.message);
      throw new Error(`Bybit API Error: ${error.response?.data?.retMsg || error.message}`);
    }
  },

  async setLeverage(symbol, leverage) {
    const payload = {
      category: 'linear',
      symbol,
      buyLeverage: leverage.toString(),
      sellLeverage: leverage.toString()
    };
    return _signedRequest('/v5/position/set-leverage', 'POST', payload);
  },

  async placeOrder(symbol, side, quantity) {
    const payload = {
      category: 'linear',
      symbol,
      side: side === 'BUY' ? 'Buy' : 'Sell',
      orderType: 'Market',
      qty: quantity.toString(),
      timeInForce: 'GTC'
    };
    
    const data = await _signedRequest('/v5/order/create', 'POST', payload);
    return { orderId: data.result.orderId };
  }
};