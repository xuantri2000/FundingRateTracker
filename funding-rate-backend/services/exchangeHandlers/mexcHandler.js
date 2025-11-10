// funding-rate-backend/services/exchangeHandlers/mexcHandler.js
import axios from 'axios';
import crypto from 'crypto';
import { MODE, EXCHANGES, getCredentials } from '../config.js';

const CONFIG = EXCHANGES.mexc;
const BASE_URL = CONFIG.urls[MODE];

// Cache để lưu thông tin sàn
let contractsInfoCache = null;

async function _getContractsInfo() {
	if (contractsInfoCache) return contractsInfoCache;
	try {
		console.log('⏳ [MEXC] Fetching contracts info...');
		const { data } = await axios.get(`${BASE_URL}/api/v1/contract/detail`);
		if (!data.success) throw new Error(data.message);
		contractsInfoCache = data.data;
		console.log('✅ [MEXC] Contracts info cached.');
		return contractsInfoCache;
	} catch (error) {
		console.error('❌ [MEXC] Error fetching contracts info:', error.message);
		throw new Error(`Could not fetch MEXC contracts info: ${error.message}`);
	}
}

/**
 * Hàm nội bộ để tạo và gửi request có chữ ký đến MEXC
 * @param {string} endpoint - Eg. /api/v1/private/position/open_positions
 * @param {string} method - 'GET', 'POST', 'DELETE'
 * @param {object} payload - Body (cho POST) hoặc params (cho GET/DELETE)
 * @returns {Promise<any>} - Dữ liệu data từ response của MEXC
 */
async function _signedRequest(endpoint, method = 'GET', payload = {}) {
  const credentials = getCredentials('mexc');
  const accessKey = credentials.apiKey;
  const secretKey = credentials.secretKey;
  const timestamp = Date.now().toString();
  const methodUpper = method.toUpperCase();

  // 1️⃣ Tạo parameter string
  let paramString = '';
  if (['GET', 'DELETE'].includes(methodUpper) && Object.keys(payload).length > 0) {
    // Sắp xếp key theo thứ tự chữ cái
    const sortedKeys = Object.keys(payload).sort();
    const sortedParams = sortedKeys
      .map(k => `${k}=${encodeURIComponent(payload[k])}`)
      .join('&');
    paramString = sortedParams;
  }

  const bodyString =
    methodUpper === 'POST' && Object.keys(payload).length > 0
      ? JSON.stringify(payload)
      : '';

  // 2️⃣ Tạo chuỗi để ký
  const signString = `${accessKey}${timestamp}${paramString || bodyString}`;

  // 3️⃣ Sinh chữ ký
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(signString)
    .digest('hex');

  // 4️⃣ Headers
  const headers = {
    'ApiKey': accessKey,
    'Request-Time': timestamp,
    'Signature': signature,
    'Content-Type': 'application/json',
  };

  // 5️⃣ URL
  const url = `${BASE_URL}${endpoint}${paramString ? `?${paramString}` : ''}`;

  try {
    const response = await axios({
      url,
      method: methodUpper,
      headers,
      data: bodyString ? JSON.parse(bodyString) : undefined,
	  timeout: 5000
    });

    if (!response.data.success) {
      throw new Error(`(${response.data.code}) ${response.data.message}`);
    }

    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    console.error(`❌ [MEXC] Error ${methodUpper} ${endpoint}:`, msg);
    throw new Error(`MEXC API Error: ${msg}`);
  }
}

function formatSymbol(symbol) {
	return symbol.replace('USDT', '_USDT');
}

// ============================================
// MEXC HANDLER
// ============================================
export const mexcHandler = {

	async getPrice(symbol) {
		const contract = formatSymbol(symbol);
		try {
			const { data } = await axios.get(`${BASE_URL}/api/v1/contract/ticker`, {
				params: { symbol: contract }
			});
			if (!data.success || !data.data) {
				throw new Error(data.message || `Không tìm thấy cặp giao dịch ${contract} trên MEXC.`);
			}
			return parseFloat(data.data.lastPrice);
		} catch (error) {
			console.error(`❌ [MEXC] Error getPrice ${symbol}:`, error.response?.data || error.message);
			throw new Error(`MEXC API Error: ${error.response?.data?.message || error.message}`);
		}
	},

	async getSymbolInfo(symbol) {
		const contract = formatSymbol(symbol);
		const info = await _getContractsInfo();
		const symbolInfo = info.find(i => i.symbol === contract);
		if (!symbolInfo) {
			throw new Error(`[MEXC] Symbol info not found for ${contract}`);
		}

		return {
			quantityPrecision: parseInt(symbolInfo.amountScale, 10),
			maxLeverage: parseInt(symbolInfo.maxLeverage, 10),
		};
	},

	async getPNL(symbol) {
		const contract = formatSymbol(symbol);
		try {
			const data = await _signedRequest('/api/v1/private/position/open_positions', 'GET', { symbol: contract });
			const position = data.data.find(p => p.symbol === contract);
			return {
				pnl: position ? parseFloat(position.unrealisedPnl) : 0,
				size: position ? parseFloat(position.holdVol) : 0,
				holdSide: position ? (position.positionType === 1 ? 'long' : 'short') : null,
			};
		} catch (error) {
			// API không trả lỗi nếu không có vị thế, chỉ trả mảng rỗng
			return { pnl: 0, size: 0, holdSide: null };
		}
	},

	async setMarginType(symbol, marginType) {
		console.log(`   ⓘ [MEXC] Margin type is setting on place order step. Skipping for ${symbol}.`);
		return;
	},

	async setLeverage(symbol, leverage) {
		const contract = formatSymbol(symbol);
		console.log(`   ⚡️ [MEXC] Setting Leverage for ${contract} to ${leverage}x`);
		const payload = {
			symbol: contract,
			leverage,
			openType: 1, // Chỉ set cho Isolated
			positionType: 1 // Long
		};
		await _signedRequest('/api/v1/private/position/change_leverage', 'POST', payload);

		payload.positionType = 2; // Short
		return _signedRequest('/api/v1/private/position/change_leverage', 'POST', payload);
	},

	async placeOrder(symbol, side, quantity) {
		const contract = formatSymbol(symbol);
		const payload = {
			symbol: contract,
			vol: quantity,
			side: side === 'BUY' ? 1 : 3, // 1: Open Long, 3: Open Short
			type: 5, // Market order
			openType: 1, // Isolated
		};
		console.log(payload);

		const data = await _signedRequest('/api/v1/private/order/create', 'POST', payload);
		return { orderId: data.data };
	},

	async cancelAllOpenOrders(symbol) {
		const contract = formatSymbol(symbol);
		console.log(`   -> [MEXC] Cancelling all open orders for ${contract}`);
		const payload = { symbol: contract };
		try {
			await _signedRequest('/api/v1/private/order/cancel_all', 'POST', payload);
			console.log(`   ✅ [MEXC] Successfully cancelled open orders for ${contract}.`);
		} catch (error) {
			// Bỏ qua lỗi nếu không có lệnh để hủy (code 20103)
			if (error.message && error.message.includes('20103')) {
				console.log(`   ⓘ [MEXC] No open orders to cancel for ${contract}.`);
			} else {
				throw error;
			}
		}
	},

	async closePosition(symbol) {
		const contract = formatSymbol(symbol);
		console.log(`   -> [MEXC] Starting full closure process for ${contract}...`);
		await this.cancelAllOpenOrders(symbol);

		const positionInfo = await this.getPNL(symbol);

		if (!positionInfo || positionInfo.size === 0) {
			console.log(`   ✅ [MEXC] No open position found for ${contract}.`);
			return { message: `No open position for ${contract}` };
		}

		const quantityToClose = positionInfo.size;
		// 2: Close Long, 4: Close Short
		const closeSide = positionInfo.holdSide === 'long' ? 2 : 4;

		console.log(`   -> [MEXC] Closing ${quantityToClose} of ${contract} (side: ${positionInfo.holdSide})`);

		const payload = {
			symbol: contract,
			vol: quantityToClose,
			side: closeSide,
			type: 5, // Market order
			openType: 1 // Isolated
		};

		const data = await _signedRequest('/api/v1/private/order/create', 'POST', payload);
		console.log(`   ✅ [MEXC] Closed position ${contract}, orderId: ${data.data}`);
		return { orderId: data.data };
	}
};