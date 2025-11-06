// funding-rate-backend/services/exchangeHandlers/bitgetHandler.js
import axios from 'axios';
import crypto from 'crypto';
import { MODE, EXCHANGES, getCredentials } from '../config.js';

const CONFIG = EXCHANGES.bitget;
// Bitget API V2 dùng chung URL cho cả production và demo trading
const BASE_URL = CONFIG.urls[MODE];
const PRODUCT_TYPE = 'usdt-futures';

// Cache để lưu thông tin sàn
let contractsInfoCache = null;

async function _getContractsInfo() {
	if (contractsInfoCache) return contractsInfoCache;
	try {
		console.log('⏳ [Bitget] Fetching contracts info...');
		const { data } = await axios.get(`${BASE_URL}/api/v2/mix/market/contracts`, {
			params: { productType: PRODUCT_TYPE }
		});
		if (data.code !== '00000') throw new Error(data.msg);
		contractsInfoCache = data.data;
		console.log('✅ [Bitget] Contracts info cached.');
		return contractsInfoCache;
	} catch (error) {
		console.error('❌ [Bitget] Error fetching contracts info:', error.message);
		throw new Error(`Could not fetch Bitget contracts info: ${error.message}`);
	}
}

/**
 * Hàm nội bộ để tạo và gửi request có chữ ký đến Bitget
 * @param {string} endpoint - Eg. /api/v2/mix/account/set-leverage
 * @param {string} method - 'GET' hoặc 'POST'
 * @param {object} payload - Body (cho POST) hoặc params (cho GET)
 * @returns {Promise<any>} - Dữ liệu data từ response của axios
 */
async function _signedRequest(endpoint, method = 'POST', payload = {}) {
	const credentials = getCredentials('bitget');
	const timestamp = new Date().toISOString(); // ✅ Bitget yêu cầu ISO 8601, không phải Date.now()
	const methodUpper = method.toUpperCase();

	let body = '';
	let queryString = '';

	if (methodUpper === 'POST') {
		body = JSON.stringify(payload);
	} else {
		queryString = Object.keys(payload)
			.sort()
			.map(key => `${key}=${encodeURIComponent(payload[key])}`)
			.join('&');
	}

	// ✅ Chuỗi để ký phải bao gồm '?' nếu có queryString
	const prehash = `${timestamp}${methodUpper}${endpoint}${queryString ? '?' + queryString : ''}${body}`;

	const signature = crypto
		.createHmac('sha256', credentials.secretKey)
		.update(prehash)
		.digest('base64');

	const headers = {
		'ACCESS-KEY': credentials.apiKey,
		'ACCESS-SIGN': signature,
		'ACCESS-TIMESTAMP': timestamp,
		'ACCESS-PASSPHRASE': credentials.passphrase,
		'Content-Type': 'application/json',
		'locale': 'en-US',
	};

	if (MODE === 'testnet') headers['paptrading'] = '1';

	const url = `${BASE_URL}${endpoint}${queryString ? '?' + queryString : ''}`;

	try {
		const response = await axios({
			url,
			method: methodUpper,
			headers,
			data: methodUpper === 'POST' ? payload : undefined,
		});

		if (response.data.code !== '00000') {
			throw new Error(`(${response.data.code}) ${response.data.msg}`);
		}
		return response.data;
	} catch (error) {
		const errorMsg = error.response?.data?.msg || error.message;
		console.error(`❌ [Bitget] Error ${method} ${endpoint}:`, errorMsg);
		throw new Error(`Bitget API Error: ${errorMsg}`);
	}
}


// ============================================
// BITGET HANDLER
// ============================================
export const bitgetHandler = {

	async getPrice(symbol) {
		try {
			const { data } = await axios.get(`${BASE_URL}/api/v2/mix/market/ticker`, {
				params: { productType: PRODUCT_TYPE, symbol }
			});
			if (data.code !== '00000') throw new Error(data.msg);
			const ticker = data.data[0];
			if (!ticker || !ticker.lastPr) {
				throw new Error(`Không tìm thấy cặp giao dịch ${symbol} trên Bitget.`);
			}
			return parseFloat(ticker.lastPr);
		} catch (error) {
			console.error(`❌ [Bitget] Error getPrice ${symbol}:`, error.response?.data || error.message);
			throw new Error(`Bitget API Error: ${error.response?.data?.msg || error.message}`);
		}
	},

	async getSymbolInfo(symbol) {
		const info = await _getContractsInfo();
		const symbolInfo = info.find(i => i.symbol === symbol);
		if (!symbolInfo) {
			throw new Error(`[Bitget] Symbol info not found for ${symbol}`);
		}

		return {
			// Bitget dùng 'volumePlace' cho độ chính xác của quantity
			quantityPrecision: parseInt(symbolInfo.volumePlace, 10),
			// Bitget dùng 'maxLever' cho đòn bẩy tối đa
			maxLeverage: parseFloat(symbolInfo.maxLever),
		};
	},

	async getPNL(symbol) {
		const payload = { productType: PRODUCT_TYPE, symbol };
		const data = await _signedRequest('/api/v2/mix/position/all-position', 'GET', payload);
		// API trả về mảng, có thể có vị thế long và short
		const position = data.data.find(p => p.symbol === symbol && parseFloat(p.total) > 0);

		return {
			pnl: position ? parseFloat(position.unrealizedPL) : 0,
			size: position ? parseFloat(position.total) : 0,
			holdSide: position ? position.holdSide : null, // 'long' hoặc 'short'
		};
	},

	async setMarginType(symbol, marginType) {
		const marginMode = marginType.toLowerCase(); // 'isolated' hoặc 'cross'
		console.log(`   🛡️  [Bitget] Setting Margin Type for ${symbol} to ${marginMode}`);
		const payload = {
			symbol,
			productType: PRODUCT_TYPE,
			marginMode,
			marginCoin: 'USDT'
		};
		return _signedRequest('/api/v2/mix/account/set-margin-mode', 'POST', payload);
	},

	async setLeverage(symbol, leverage) {
		console.log(`   ⚡️ [Bitget] Setting Leverage for ${symbol} to ${leverage}x`);
		const payload = {
			symbol,
			productType: PRODUCT_TYPE,
			leverage: leverage.toString(),
			marginCoin: 'USDT'
		};
		return _signedRequest('/api/v2/mix/account/set-leverage', 'POST', payload);
	},

	async placeOrder(symbol, side, quantity) {
		const payload = {
			symbol,
			productType: PRODUCT_TYPE,
			marginCoin: 'USDT',
			// ✅ Bitget dùng tradeSide và side để xác định hành động
			tradeSide: 'open',
			side: side === 'BUY' ? 'buy' : 'sell',
			marginMode: 'isolated', // ✅ Bitget yêu cầu marginMode trong payload đặt lệnh
			orderType: 'market',
			size: quantity.toString(),
		};

		const data = await _signedRequest('/api/v2/mix/order/place-order', 'POST', payload);
		return { orderId: data.data.orderId };
	},

	async cancelAllOpenOrders(symbol) {
		console.log(`   -> [Bitget] Cancelling all open orders for ${symbol}`);
		const payload = {
			productType: PRODUCT_TYPE,
			marginCoin: 'USDT' // Bitget API for cancel-all-orders works on productType, not symbol.
		};
		try {
			await _signedRequest('/api/v2/mix/order/cancel-all-orders', 'POST', payload);
			console.log(`   ✅ [Bitget] Successfully cancelled open orders for ${symbol}.`);
		} catch (error) {
			// Bỏ qua lỗi nếu không có lệnh để hủy. Bitget trả về "No order to cancel" (code 40014)
			// hoặc "Order does not exist" tùy trường hợp.
			if (error.message && (error.message.includes('No order to cancel') || error.message.includes('Order does not exist'))) {
				console.log(`   ⓘ [Bitget] No open orders to cancel for ${symbol}.`);
			} else {
				throw error;
			}
		}
	},

	async closePosition(symbol) {
		console.log(`   -> [Bitget] Starting flash close for ${symbol}...`);

		// 1️⃣ Hủy hết lệnh chờ trước
		await this.cancelAllOpenOrders(symbol);

		// 2️⃣ Lấy thông tin vị thế hiện tại
		const payload = { productType: PRODUCT_TYPE, symbol };
		const data = await _signedRequest('/api/v2/mix/position/all-position', 'GET', payload);

		const position = data.data.find(p => p.symbol === symbol && parseFloat(p.total) > 0);
		if (!position) {
			console.log(`   ✅ [Bitget] No open position found for ${symbol}.`);
			return { message: `No open position for ${symbol}` };
		}

		const holdSide = position.holdSide?.toLowerCase(); // long hoặc short
		const marginMode = position.marginMode?.toLowerCase() || 'isolated';
		const closeSide = holdSide === 'long' ? 'sell' : 'buy';

		console.log(`   -> [Bitget] Flash closing ${position.total} ${holdSide} of ${symbol} (${marginMode})...`);

		// 3️⃣ Gọi API flashClose
		const closePayload = {
			symbol,
			productType: PRODUCT_TYPE,
			marginCoin: 'USDT',
			side: closeSide, // 'sell' để đóng long, 'buy' để đóng short
			holdSide,        // cần thiết: 'long' hoặc 'short'
		};

		try {
			const closeData = await _signedRequest('/api/v2/mix/order/close-positions', 'POST', closePayload);
			console.log(`   ✅ [Bitget] Flash closed ${symbol}, orderId: ${closeData.data?.orderId || 'N/A'}`);
			return { orderId: closeData.data?.orderId };
		} catch (err) {
			console.error(`   ❌ [Bitget] Flash close failed for ${symbol}:`, err.message);
			throw err;
		}
	}



};