// funding-rate-backend/services/exchangeHandlers/gateioHandler.js
import axios from 'axios';
import crypto from 'crypto';
import { MODE, EXCHANGES, getCredentials } from '../config.js';

const CONFIG = EXCHANGES.gateio;
const BASE_URL = CONFIG.urls[MODE];
const SETTLE_CURRENCY = 'usdt';

let contractsInfoCache = null;

async function _getContractsInfo() {
	if (contractsInfoCache) return contractsInfoCache;
	try {
		console.log('⏳ [Gate.io] Fetching contracts info...');
		const { data } = await axios.get(`${BASE_URL}/api/v4/futures/${SETTLE_CURRENCY}/contracts`);
		contractsInfoCache = data;
		console.log('✅ [Gate.io] Contracts info cached.');
		return contractsInfoCache;
	} catch (error) {
		console.error('❌ [Gate.io] Error fetching contracts info:', error.message);
		throw new Error(`Could not fetch Gate.io contracts info: ${error.message}`);
	}
}

/**
 * Hàm nội bộ để tạo và gửi request có chữ ký đến Gate.io
 * @param {string} endpoint - Eg. /futures/usdt/accounts
 * @param {string} method - 'GET', 'POST', 'DELETE'
 * @param {object} queryParams - Query parameters cho URL
 * @param {object} bodyParams - Body parameters (chỉ cho POST)
 * @returns {Promise<any>}
 */
async function _signedRequest(endpoint, method = 'GET', queryParams = {}, bodyParams = null) {
	const credentials = getCredentials('gateio');
	const timestamp = (Date.now() / 1000).toString();
	const methodUpper = method.toUpperCase();

	// Query string
	let queryString = '';
	if (Object.keys(queryParams).length > 0) {
		queryString = new URLSearchParams(queryParams).toString();
	}

	// Body string - CHỈ dùng cho POST
	let bodyString = '';
	if (bodyParams && methodUpper === 'POST') {
		bodyString = JSON.stringify(bodyParams);
	}
	
	const hashedPayload = crypto.createHash('sha512').update(bodyString).digest('hex');

	const fullEndpoint = `/api/v4${endpoint}`;
	const signString = `${methodUpper}\n${fullEndpoint}\n${queryString}\n${hashedPayload}\n${timestamp}`;

	const signature = crypto
		.createHmac('sha512', credentials.secretKey)
		.update(signString)
		.digest('hex');

	const headers = {
		'KEY': credentials.apiKey,
		'SIGN': signature,
		'Timestamp': timestamp,
		'Content-Type': 'application/json',
		'Accept': 'application/json',
	};

	const url = `${BASE_URL}${fullEndpoint}${queryString ? '?' + queryString : ''}`;

	try {
		const response = await axios({
			url,
			method: methodUpper,
			headers,
			data: bodyParams || undefined,
		});
		return response.data;
	} catch (error) {
		const errorMsg = error.response?.data?.message || error.response?.data?.label || error.message;
		console.error(`❌ [Gate.io] Error ${method} ${endpoint}:`, errorMsg);
		throw new Error(`Gate.io API Error: ${errorMsg}`);
	}
}

function formatSymbol(symbol) {
	return symbol.replace('USDT', '_USDT');
}

// ============================================
// GATE.IO HANDLER
// ============================================
export const gateioHandler = {

	async getPrice(symbol) {
		const contract = formatSymbol(symbol);
		try {
			const { data } = await axios.get(`${BASE_URL}/api/v4/futures/${SETTLE_CURRENCY}/tickers`, {
				params: { contract }
			});
			if (!data || data.length === 0) {
				throw new Error(`Không tìm thấy cặp giao dịch ${contract} trên Gate.io.`);
			}
			return parseFloat(data[0].last);
		} catch (error) {
			console.error(`❌ [Gate.io] Error getPrice ${symbol}:`, error.response?.data || error.message);
			throw new Error(`Gate.io API Error: ${error.response?.data?.message || error.message}`);
		}
	},

	async getSymbolInfo(symbol) {
		const contract = formatSymbol(symbol);
		const info = await _getContractsInfo();
		const symbolInfo = info.find(i => i.name === contract);
		if (!symbolInfo) {
			throw new Error(`[Gate.io] Symbol info not found for ${contract}`);
		}
		return {
			quantityPrecision: 0,
			maxLeverage: parseFloat(symbolInfo.leverage_max) || 100, // Thêm fallback
			quantoMultiplier: parseFloat(symbolInfo.quanto_multiplier),
		};
	},

	async getPNL(symbol) {
		const contract = formatSymbol(symbol);
		try {
			const data = await _signedRequest(`/futures/${SETTLE_CURRENCY}/positions/${contract}`, 'GET');
			return {
				pnl: data ? parseFloat(data.unrealised_pnl) : 0,
				size: data ? parseFloat(data.size) : 0,
			};
		} catch (error) {
			if (error.message && error.message.includes('POSITION_NOT_FOUND')) {
				return { pnl: 0, size: 0 };
			}
			throw error;
		}
	},

	async setMarginType(symbol, marginType) {
		const contract = formatSymbol(symbol);
		const isIsolated = marginType.toUpperCase() === 'ISOLATED';
		
		console.log(`   🛡️  [Gate.io] Setting Margin for ${contract} to ${isIsolated ? 'ISOLATED' : 'CROSS'}`);
		
		// ⚠️ Gate.io KHÔNG có API trực tiếp để set margin type
		// Margin type được xác định bởi cách bạn set leverage:
		// - Isolated: Set leverage cụ thể cho contract (sẽ làm ở setLeverage)
		// - Cross: Leverage chia sẻ cho toàn bộ account
		
		// Workaround: Chúng ta chỉ cần đảm bảo position mode đúng
		// Gate.io mặc định là dual mode (có thể long/short cùng lúc)
		// Nếu cần set về hedge mode hoặc one-way mode, dùng endpoint:
		// POST /futures/{settle}/dual_mode với dual_mode: true/false
		
		console.log(`   ℹ️  [Gate.io] Note: Margin type is controlled by leverage setting`);
		return { success: true, message: 'Margin type will be set with leverage' };
	},

	async setLeverage(symbol, leverage) {
		const contract = formatSymbol(symbol);
		console.log(`   ⚡️ [Gate.io] Setting Leverage for ${contract} to ${leverage}x`);
		
		// Set leverage - body parameters
		return _signedRequest(
			`/futures/${SETTLE_CURRENCY}/positions/${contract}/leverage`, 
			'POST',
			{ leverage: leverage.toString() }, // no query params
			{ } // body params
		);
	},

	async placeOrder(symbol, side, quantity) {
		const contract = formatSymbol(symbol);
		
		// ✅ ĐÚNG: POST order phải gửi qua BODY
		const bodyParams = {
			contract,
			size: side === 'BUY' ? Math.round(quantity) : -Math.round(quantity),
			tif: 'ioc',
			price: 0, // Market order không cần price
		};
		
		const data = await _signedRequest(
			`/futures/${SETTLE_CURRENCY}/orders`, 
			'POST',
			{}, // no query params
			bodyParams // body params
		);
		
		return { orderId: data.id };
	},

	async cancelAllOpenOrders(symbol) {
		const contract = formatSymbol(symbol);
		console.log(`   -> [Gate.io] Cancelling all open orders for ${contract}`);
		try {
			// DELETE với query params
			await _signedRequest(
				`/futures/${SETTLE_CURRENCY}/orders`, 
				'DELETE', 
				{ contract } // query params
			);
			console.log(`   ✅ [Gate.io] Successfully cancelled open orders for ${contract}.`);
		} catch (error) {
			if (error.message && error.message.includes('ORDER_NOT_FOUND')) {
				console.log(`   ℹ️ [Gate.io] No open orders to cancel for ${contract}.`);
			} else {
				throw error;
			}
		}
	},

	async closePosition(symbol) {
		const contract = formatSymbol(symbol);
		console.log(`   -> [Gate.io] Starting full closure process for ${contract}...`);
		await this.cancelAllOpenOrders(symbol);

		const positionInfo = await this.getPNL(symbol);
		if (!positionInfo || positionInfo.size === 0) {
			console.log(`   ✅ [Gate.io] No open position found for ${contract}.`);
			return { message: `No open position for ${contract}` };
		}

		console.log(`   -> [Gate.io] Closing position for ${contract} (size: ${positionInfo.size})`);
		
		// ✅ ĐÚNG: Đóng position = gửi order NGƯỢC CHIỀU với size đối nghịch
		const bodyParams = {
			contract,
			size: 0, // Đảo chiều size để đóng position
			tif: 'ioc',
			price: 0,
			close: true, // Optional: đánh dấu đây là lệnh đóng position
		};
		
		const data = await _signedRequest(
			`/futures/${SETTLE_CURRENCY}/orders`, 
			'POST',
			{}, // no query params
			bodyParams // body params
		);
		
		console.log(`   ✅ [Gate.io] Close order placed for ${contract}. Order ID: ${data.id}`);
		return { orderId: data.id };
	}
};