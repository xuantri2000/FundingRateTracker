import axios from 'axios';
import crypto from 'crypto';
import { MODE, EXCHANGES, getCredentials } from '../config.js';

const CONFIG = EXCHANGES.binance;
const BASE_URL = CONFIG.urls[MODE];
const WS_URL = CONFIG.ws[MODE];

/**
 * Hàm nội bộ để tạo và gửi request có chữ ký đến Binance
 * @param {string} endpoint - Eg. /fapi/v1/order
 * @param {string} method - 'GET' hoặc 'POST'
 * @param {URLSearchParams} params - Các tham số của request
 * @returns {Promise<any>} - Dữ liệu data từ response của axios
 */
async function _signedRequest(endpoint, method = 'GET', params = new URLSearchParams()) {
  const credentials = getCredentials('binance');
  const timestamp = Date.now();
  params.append('timestamp', timestamp.toString());

  const signature = crypto
    .createHmac('sha256', credentials.secretKey)
    .update(params.toString())
    .digest('hex');
  
  params.append('signature', signature);

  const url = `${BASE_URL}${endpoint}?${params.toString()}`;
  const headers = { 'X-MBX-APIKEY': credentials.apiKey };

  try {
    let response;
    if (method === 'POST') {
      response = await axios.post(url, null, { // POST với body rỗng, params trong URL
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
      });
    } else { // GET
      response = await axios.get(url, { headers });
    }
    return response.data;
  } catch (error) {
    console.error(`❌ [Binance] Error ${method} ${endpoint}:`, error.response?.data || error.message);
    // Ném lỗi với thông báo từ sàn để API route bắt được
    throw new Error(`Binance API Error: ${error.response?.data?.msg || error.message}`);
  }
}

// ============================================
// BINANCE HANDLER
// ============================================
export const binanceHandler = {
  
  async getPrice(symbol) {
    try {
      const { data } = await axios.get(`${BASE_URL}/fapi/v1/ticker/price`, {
        params: { symbol }
      });
      return parseFloat(data.price);
    } catch (error) {
      console.error(`❌ [Binance] Error getPrice ${symbol}:`, error.response?.data || error.message);
      throw new Error(`Binance API Error: ${error.response?.data?.msg || error.message}`);
    }
  },

  async getPNL(symbol) {
    const params = new URLSearchParams({ symbol });
    // API v2/positionRisk là GET
    const data = await _signedRequest('/fapi/v2/positionRisk', 'GET', params);
    const position = data.find(p => p.symbol === symbol);
    return position ? parseFloat(position.unRealizedProfit) : 0;
  },

  createWebSocket(symbol, onMessage) {
    // Sử dụng WS_URL đã được chọn theo MODE
    const ws = new WebSocket(`${WS_URL}/ws/${symbol.toLowerCase()}@trade`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage({
        symbol: data.s,
        price: parseFloat(data.p),
        quantity: parseFloat(data.q),
        timestamp: data.T
      });
    };

    return ws;
  },

  async setLeverage(symbol, leverage) {
    const params = new URLSearchParams({
      symbol,
      leverage: leverage.toString(),
    });
    // API v1/leverage là POST
    return _signedRequest('/fapi/v1/leverage', 'POST', params);
  },

  async setMarginType(symbol, marginType) {
    const targetMarginType = marginType.toUpperCase();
    console.log(`   🛡️  [Binance] Checking and setting Margin Type for ${symbol} to ${targetMarginType}`);

    // 1. Lấy thông tin vị thế hiện tại để kiểm tra marginType
    const positionParams = new URLSearchParams({ symbol });
    let currentMarginType = null;
    try {
      const positionRiskData = await _signedRequest('/fapi/v2/positionRisk', 'GET', positionParams);
      const currentPosition = positionRiskData.find(p => p.symbol === symbol);
      if (currentPosition) {
        currentMarginType = currentPosition.marginType;
      }
    } catch (error) {
      console.warn(`   ⚠️  [Binance] Could not fetch current margin type for ${symbol}. Proceeding with setting margin type. Error: ${error.message}`);
      // Nếu không thể lấy được margin type hiện tại (ví dụ: không có vị thế mở),
      // ta vẫn cố gắng đặt margin type để đảm bảo.
    }

    if (currentMarginType && currentMarginType.toUpperCase() === targetMarginType) {
      console.log(`   ✅ [Binance] Margin Type for ${symbol} is already ${targetMarginType}. No change needed.`);
      return; // Không cần thay đổi nếu đã đúng loại
    }

    // 2. Nếu chưa phải là ISOLATED, thì mới gọi API để thay đổi
    const params = new URLSearchParams({
      symbol,
      marginType: targetMarginType,
    });
    console.log(`   🔄 [Binance] Changing Margin Type for ${symbol} from ${currentMarginType || 'unknown'} to ${targetMarginType}`);
    return _signedRequest('/fapi/v1/marginType', 'POST', params);
  },

  async placeOrder(symbol, side, quantity, price) {
    const params = new URLSearchParams({
      symbol,
      side,
      type: 'LIMIT',
      quantity: quantity.toString(),
      price: price.toString(),
      timeInForce: 'GTC', // Good 'Til Canceled
    });
    // API v1/order là POST
    const data = await _signedRequest('/fapi/v1/order', 'POST', params);
    return { orderId: data.orderId };
  },

  async closePosition(symbol, side, quantity) {
    console.log(`   -> [Binance] Closing position with MARKET order`);
    const params = new URLSearchParams({
      symbol,
      side, // side ngược lại để đóng
      type: 'MARKET',
      quantity: quantity.toString(),
    });
    const data = await _signedRequest('/fapi/v1/order', 'POST', params);
    return { orderId: data.orderId };
  }
};