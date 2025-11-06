// funding-rate-backend/services/exchangeHandlers/kucoinHandler.js
import axios from 'axios';
import crypto from 'crypto';
import { MODE, EXCHANGES, getCredentials } from '../config.js';

const CONFIG = EXCHANGES.kucoin;
const BASE_URL = CONFIG.urls[MODE];

// Cache để lưu thông tin sàn
let contractsInfoCache = null;

async function _getContractsInfo() {
	if (contractsInfoCache) return contractsInfoCache;
	try {
		console.log('⏳ [KuCoin] Fetching contracts info...');
		const { data } = await axios.get(`${BASE_URL}/api/v1/contracts/active`);
		if (data.code !== '200000') throw new Error(data.message);
		contractsInfoCache = data.data;
		console.log('✅ [KuCoin] Contracts info cached.');
		return contractsInfoCache;
	} catch (error) {
		console.error('❌ [KuCoin] Error fetching contracts info:', error.message);
		throw new Error(`Could not fetch KuCoin contracts info: ${error.message}`);
	}
}

/**
 * Hàm nội bộ để tạo và gửi request có chữ ký đến KuCoin
 * @param {string} endpoint - Eg. /api/v1/orders
 * @param {string} method - 'GET', 'POST', 'DELETE'
 * @param {object} payload - Body (cho POST) hoặc params (cho GET/DELETE)
 * @returns {Promise<any>} - Dữ liệu data từ response của KuCoin
 */
async function _signedRequest(endpoint, method = 'GET', payload = {}) {
	const credentials = getCredentials('kucoin');
	const timestamp = Date.now().toString();
	const methodUpper = method.toUpperCase();

	let queryString = '';
	let body = '';

	if (methodUpper === 'GET' || methodUpper === 'DELETE') {
		if (Object.keys(payload).length > 0) {
			queryString = '?' + new URLSearchParams(payload).toString();
		}
	} else if (methodUpper === 'POST') {
		body = JSON.stringify(payload);
	}

	const strForSign = `${timestamp}${methodUpper}${endpoint}${queryString}${body}`;

	const signature = crypto
		.createHmac('sha256', credentials.secretKey)
		.update(strForSign)
		.digest('base64');

	const headers = {
		'KC-API-KEY': credentials.apiKey,
		'KC-API-SIGN': signature,
		'KC-API-TIMESTAMP': timestamp,
		'KC-API-PASSPHRASE': credentials.passphrase,
		'KC-API-KEY-VERSION': '2',
		'Content-Type': 'application/json',
	};

	const url = `${BASE_URL}${endpoint}${queryString}`;

	try {
		const response = await axios({
			url,
			method: methodUpper,
			headers,
			data: body ? payload : undefined,
		});

		if (response.data.code !== '200000') {
			throw new Error(response.data.message || 'KuCoin API Error');
		}
		return response.data;
	} catch (error) {
		const errorMsg = error.response?.data?.message || error.message;
		console.error(`❌ [KuCoin] Error ${method} ${endpoint}:`, errorMsg);
		throw new Error(`KuCoin API Error: ${errorMsg}`);
	}
}

// ============================================
// KUCOIN HANDLER
// ============================================
export const kucoinHandler = {

	async getPrice(symbol) {
		try {
			const { data } = await axios.get(`${BASE_URL}/api/v1/ticker?symbol=${symbol}`);
			if (data.code !== '200000' || !data.data) {
				throw new Error(data.message || `Không tìm thấy cặp giao dịch ${symbol} trên KuCoin.`);
			}
			return parseFloat(data.data.price);
		} catch (error) {
			console.error(`❌ [KuCoin] Error getPrice ${symbol}:`, error.response?.data || error.message);
			throw new Error(`KuCoin API Error: ${error.response?.data?.message || error.message}`);
		}
	},

	async getSymbolInfo(symbol) {
		const info = await _getContractsInfo();
		const symbolInfo = info.find(i => i.symbol === symbol);
		if (!symbolInfo) {
			throw new Error(`[KuCoin] Symbol info not found for ${symbol}`);
		}

		// KuCoin dùng lotSize để xác định số lượng tối thiểu, không có precision rõ ràng.
		// Giả sử precision dựa trên multiplier. Ví dụ 0.001 -> 3.
		const multiplier = parseFloat(symbolInfo.multiplier);
		const precision = multiplier > 0 && multiplier < 1 ? (multiplier.toString().split('.')[1] || '').length : 0;

		return {
			quantityPrecision: precision,
			maxLeverage: parseInt(symbolInfo.maxLeverage, 10),
		};
	},

	async getPNL(symbol) {
		try {
			const data = await _signedRequest(`/api/v1/positions/${symbol}`, 'GET');
			const position = data.data;
			return {
				pnl: position ? parseFloat(position.unrealisedPnl) : 0,
				size: position ? parseFloat(position.currentQty) : 0,
				holdSide: position ? (position.currentQty > 0 ? 'long' : 'short') : null,
			};
		} catch (error) {
			// API trả lỗi 404 nếu không có vị thế
			if (error.message && error.message.includes('position does not exist')) {
				return { pnl: 0, size: 0, holdSide: null };
			}
			throw error;
		}
	},

	// KuCoin không có API để set margin type riêng lẻ, nó được quản lý ở cấp độ tài khoản (cross/isolated)
	async setMarginType(symbol, marginType) {
		console.log(`   ⓘ [KuCoin] Margin type is managed at the account level. Please set it in your KuCoin account settings. Skipping for ${symbol}.`);
		return;
	},

	async setLeverage(symbol, leverage) {
		console.log(`   ⚡️ [KuCoin] Setting Leverage for ${symbol} to ${leverage}x`);
		const payload = { leverage: leverage.toString() };
		// Endpoint này yêu cầu symbol trong path
		return _signedRequest(`/api/v1/position/leverage/${symbol}`, 'POST', payload);
	},

	async placeOrder(symbol, side, quantity) {
		const payload = {
			clientOid: `my-trader-${Date.now()}`, // ID duy nhất cho lệnh
			symbol,
			side: side.toLowerCase(), // 'buy' hoặc 'sell'
			type: 'market',
			size: Math.round(quantity), // KuCoin yêu cầu size là số nguyên (số lượng hợp đồng)
		};

		const data = await _signedRequest('/api/v1/orders', 'POST', payload);
		return { orderId: data.data.orderId };
	},

	async cancelAllOpenOrders(symbol) {
		console.log(`   -> [KuCoin] Cancelling all open orders for ${symbol}`);
		const params = { symbol };
		try {
			await _signedRequest('/api/v1/orders', 'DELETE', params);
			console.log(`   ✅ [KuCoin] Successfully cancelled open orders for ${symbol}.`);
		} catch (error) {
			// Bỏ qua lỗi nếu không có lệnh để hủy
			if (error.message && error.message.includes('no order')) {
				console.log(`   ⓘ [KuCoin] No open orders to cancel for ${symbol}.`);
			} else {
				throw error;
			}
		}
	},

	async closePosition(symbol) {
		console.log(`   -> [KuCoin] Starting full closure process for ${symbol}...`);
		await this.cancelAllOpenOrders(symbol);

		const positionInfo = await this.getPNL(symbol);

		if (!positionInfo || positionInfo.size === 0) {
			console.log(`   ✅ [KuCoin] No open position found for ${symbol}.`);
			return { message: `No open position for ${symbol}` };
		}

		const quantityToClose = Math.abs(positionInfo.size);
		const closeSide = positionInfo.holdSide === 'long' ? 'sell' : 'buy';

		console.log(`   -> [KuCoin] Closing ${quantityToClose} of ${symbol} with side ${closeSide}`);

		const payload = {
			clientOid: `my-trader-close-${Date.now()}`,
			symbol,
			side: closeSide,
			type: 'market',
			size: Math.round(quantityToClose),
			closeOrder: true, // Đánh dấu đây là lệnh đóng vị thế
		};

		const data = await _signedRequest('/api/v1/orders', 'POST', payload);
		console.log(`   ✅ [KuCoin] Closed position ${symbol}, orderId: ${data.data.orderId}`);
		return { orderId: data.data.orderId };
	}
};