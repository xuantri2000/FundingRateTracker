// funding-rate-backend/services/exchangeHandlers/htxHandler.js
import axios from 'axios';
import crypto from 'crypto';
import https from 'https';
import { MODE, EXCHANGES, getCredentials } from '../config.js';

const CONFIG = EXCHANGES.htx;
const BASE_URL = CONFIG.urls[MODE];

// =============================================================================
// CẢNH BÁO BẢO MẬT:
// Đoạn code dưới đây dùng để bỏ qua lỗi xác thực SSL "unable to get local issuer certificate".
// Chỉ sử dụng cho môi trường phát triển (development/test).
// KHÔNG BAO GIỜ sử dụng trong môi trường production vì nó làm tăng nguy cơ tấn công MITM.
// =============================================================================
const insecureAgent = new https.Agent({
	rejectUnauthorized: false
});

// Cache để lưu thông tin hợp đồng
let contractInfoCache = null;

async function _getContractInfo() {
	if (contractInfoCache) return contractInfoCache;
	try {
		console.log('⏳ [HTX] Fetching contract info...');
		const { data } = await axios.get(`${BASE_URL}/linear-swap-api/v1/swap_contract_info`, {
			httpsAgent: insecureAgent // Sử dụng agent không an toàn
		});
		if (data.status === 'ok') {
			contractInfoCache = data.data;
			console.log('✅ [HTX] Contract info cached.');
			return contractInfoCache;
		}
		throw new Error('Failed to fetch contract info');
	} catch (error) {
		console.error('❌ [HTX] Error fetching contract info:', error.message);
		throw new Error(`Could not fetch HTX contract info: ${error.message}`);
	}
}

/**
 * Hàm nội bộ để tạo và gửi request có chữ ký đến HTX
 * @param {string} method - 'GET', 'POST'
 * @param {string} endpoint - Eg. /linear-swap-api/v1/swap_order
 * @param {object} params - Parameters cho request
 * @returns {Promise<any>}
 */
async function _signedRequest(method, endpoint, businessParams = {}) {
	const credentials = getCredentials('htx');
	const timestamp = new Date().toISOString().slice(0, 19); // Format: YYYY-MM-DDTHH:mm:ss

	// 1. Các tham số xác thực luôn nằm trong query string
	const authParams = {
		AccessKeyId: credentials.apiKey,
		SignatureMethod: 'HmacSHA256',
		SignatureVersion: '2',
		Timestamp: timestamp,
	};

	// 2. Chuẩn bị các tham số để tạo chữ ký
	// - Với GET, gộp cả tham số xác thực và nghiệp vụ
	// - Với POST, chỉ dùng tham số xác thực
	const paramsToSign = method === 'GET' ? { ...authParams, ...businessParams } : authParams;

	// 3. Sắp xếp các tham số theo thứ tự alphabet và tạo query string
	const sortedQueryString = Object.keys(paramsToSign)
		.sort()
		.map(key => `${encodeURIComponent(key)}=${encodeURIComponent(paramsToSign[key])}`)
		.join('&');

	// 4. Tạo chuỗi để ký
	const host = new URL(BASE_URL).host;
	const stringToSign = `${method}\n${host}\n${endpoint}\n${sortedQueryString}`;

	// 5. Tạo chữ ký
	const signature = crypto
		.createHmac('sha256', credentials.secretKey)
		.update(stringToSign)
		.digest('base64');

	// 6. Tạo URL cuối cùng với các tham số xác thực và chữ ký
	const finalQueryString = `${sortedQueryString}&Signature=${encodeURIComponent(signature)}`;
	const url = `${BASE_URL}${endpoint}?${finalQueryString}`;

	try {
		let response;
		if (method === 'POST') {
			// Với POST, tham số nghiệp vụ nằm trong body, URL đã chứa đủ thông tin xác thực
			response = await axios.post(url, businessParams, {
				httpsAgent: insecureAgent, // Sử dụng agent không an toàn
				headers: {
					'Content-Type': 'application/json',
				}
			});
		} else {
			// Với GET, tất cả tham số đã nằm trong URL
			response = await axios.get(url, {
				httpsAgent: insecureAgent,
			});
		}
		if (response.data.status !== 'ok' && response.data.code !== 200) {
			const errorMsg = response.data.err_msg || response.data['err_msg'] || response.data.message || 'HTX API Error';
			throw new Error(errorMsg);
		}
		return response.data.data || response.data; // Trả về data hoặc toàn bộ response nếu không có data field
	} catch (error) {
		// Nếu error đã được throw từ trên (có message rõ ràng), giữ nguyên
		if (error.message && !error.response) {
			console.error(`❌ [HTX] Error ${method} ${endpoint}:`, error.message);
			throw error;
		}

		// Xử lý lỗi từ axios
		const errorMsg = error.response?.data?.err_msg || error.response?.data?.['err-msg'] || error.message;
		console.error(`❌ [HTX] Error ${method} ${endpoint}:`, errorMsg);
		throw new Error(`HTX API Error: ${errorMsg}`);
	}
}

function formatSymbol(symbol) {
	// HTX sử dụng format như BTC-USDT
	return symbol.replace('USDT', '-USDT');
}

function unformatSymbol(htxSymbol) {
	// Chuyển từ BTC-USDT về BTCUSDT
	return htxSymbol.replace('-USDT', 'USDT');
}

// ============================================
// HTX HANDLER
// ============================================
export const htxHandler = {

	async getPrice(symbol) {
		const contract = formatSymbol(symbol);
		try {
			const { data } = await axios.get(`${BASE_URL}/linear-swap-ex/market/detail/merged`, {
				params: { contract_code: contract },
				httpsAgent: insecureAgent // Sử dụng agent không an toàn
			});
			if (data.status !== 'ok' || !data.tick) {
				throw new Error(`Không tìm thấy cặp giao dịch ${contract} trên HTX.`);
			}
			return parseFloat(data.tick.close);
		} catch (error) {
			console.error(`❌ [HTX] Error getPrice ${symbol}:`, error.response?.data || error.message);
			throw new Error(`HTX API Error: ${error.response?.data?.err_msg || error.message}`);
		}
	},

	async getSymbolInfo(symbol) {
		const contract = formatSymbol(symbol);
		const info = await _getContractInfo();
		const symbolInfo = info.find(i => i.contract_code === contract);
		// console.log(symbolInfo);
		if (!symbolInfo) {
			throw new Error(`[HTX] Symbol info not found for ${contract}`);
		}
		return {
			quantityPrecision: 0, // HTX sử dụng số lượng hợp đồng (contract)
			maxLeverage: parseFloat(symbolInfo.lever_rate?.split(',').pop()) || 75,
			contractSize: parseFloat(symbolInfo.contract_size) || 1,
		};
	},

	async getPNL(symbol) {
		const contract = formatSymbol(symbol);
		try {
			// API này trả về một Array [ ... ]
			const data = await _signedRequest('POST', '/linear-swap-api/v1/swap_position_info', {
				contract_code: contract
			});

			if (data && Array.isArray(data) && data.length > 0) {
				const positionData = data[0];
				return {
					pnl: parseFloat(positionData.profit_unreal) || 0,
					size: parseFloat(positionData.volume) || 0,
					direction: positionData.direction || 'none',
				};
			}
			return { pnl: 0, size: 0 };

		} catch (error) {
			console.error('Error in getPNL:', error.message);
			if (error.message && error.message.includes('No position')) {
				return { pnl: 0, size: 0 };
			}
			throw error;
		}
	},

	async setMarginType(symbol, marginType) {
		const contract = formatSymbol(symbol);
		const isIsolated = marginType.toUpperCase() === 'ISOLATED';

		console.log(`   🛡️ [HTX] Setting Margin for ${contract} to ${isIsolated ? 'ISOLATED' : 'CROSS'}`);

		// HTX API để set margin mode
		// return _signedRequest('POST', '/linear-swap-api/v3/swap_switch_account_type', {
		// 	contract_code: contract,
		// 	lever_rate: isIsolated ? 'isolated' : 'cross'
		// });
	},

	async setLeverage(symbol, leverage) {
		const contract = formatSymbol(symbol);
		console.log(`   ⚡️ [HTX] Setting Leverage for ${contract} to ${leverage}x`);

		return _signedRequest('POST', '/linear-swap-api/v1/swap_switch_lever_rate', {
			contract_code: contract,
			lever_rate: leverage
		});
	},

	async placeOrder(symbol, side, quantity) {
		const contract = formatSymbol(symbol);

		const orderParams = {
			contract_code: contract,
			volume: Math.round(quantity),
			direction: side === 'BUY' ? 'buy' : 'sell',
			offset: 'open',
			lever_rate: 1, // Default leverage, should be set before
			order_price_type: 'opponent', // Market order
		};

		try {
			const data = await _signedRequest('POST', '/linear-swap-api/v1/swap_order', orderParams);
			return { orderId: data.order_id_str };
		} catch (error) {
			if (error.message && error.message.includes('The amount cannot be left empty or smaller than the ')) {
				throw new Error(`Số lượng quá nhỏ hoặc không hợp lệ.`);
			} if (error.message && error.message.includes('Insufficient margin availab')) {
				throw new Error(`Hết lúa!`);
			}
			else {
				throw error;
			}
		}
	},

	async cancelAllOpenOrders(symbol) {
		const contract = formatSymbol(symbol);
		console.log(`   -> [HTX] Cancelling all open orders for ${contract}`);
		try {
			await _signedRequest('POST', '/linear-swap-api/v1/swap_cancelall', {
				contract_code: contract
			});
			console.log(`   ✅ [HTX] Successfully cancelled open orders for ${contract}.`);
		} catch (error) {
			if (error.message && error.message.includes('No cancellable orders')) {
				console.log(`   ℹ️ [HTX] No open orders to cancel for ${contract}.`);
			} else {
				throw error;
			}
		}
	},

	async closePosition(symbol) {
		const contract = formatSymbol(symbol);
		console.log(`   -> [HTX] Starting full closure process for ${contract}...`);

		// Hủy tất cả lệnh đang mở
		await this.cancelAllOpenOrders(symbol);

		// Lấy thông tin vị thế
		const positionInfo = await this.getPNL(symbol);
		if (!positionInfo || positionInfo.size === 0) {
			console.log(`   ✅ [HTX] No open position found for ${contract}.`);
			return { message: `No open position for ${contract}` };
		}

		console.log(`   -> [HTX] Closing position for ${contract} (size: ${positionInfo.size})`);

		const direction = positionInfo.direction === 'buy' ? 'sell' : 'buy';
		const closeParams = {
			contract_code: contract,
			// volume: Math.abs(positionInfo.size),
			direction: direction,
			// offset: 'close',
			// order_price_type: 'opponent',
		};

		const data = await _signedRequest('POST', '/linear-swap-api/v1/swap_lightning_close_position', closeParams);

		console.log(`   ✅ [HTX] Close order placed for ${contract}. Order ID: ${data.order_id_str}`);
		return { orderId: data.order_id_str };
	},

	/**
	 * Chuyển account mode giữa Unified và Non-Unified trên HTX
	 * @param {number} accountType - 1: Non-Unified (cross + isolated), 2: Unified
	 */
	async switchAccountType(accountType = 1) {
		console.log(`🔁 [HTX] Switching account type to ${accountType === 1 ? 'Non-Unified' : 'Unified'}...`);

		try {
			const res = await _signedRequest(
				'POST',
				'/linear-swap-api/v3/swap_switch_account_type',
				{ account_type: accountType }
			);

			if (res.status === 'ok') {
				console.log(`✅ [HTX] Successfully switched to ${accountType === 1 ? 'Non-Unified' : 'Unified'} mode.`);
			} else {
				console.warn('⚠️ [HTX] Response:', res);
			}
		} catch (error) {
			console.error('❌ [HTX] Failed to switch account type:', error.message);
			throw error;
		}
	},

	async swapAccountInfo() {
		try {
			const res = await _signedRequest(
				'POST',
				'/linear-swap-api/v1/swap_balance_valuation', {
				valuation_asset: 'USDT'
			}
			);

			if (res.status === 'ok') {
				return res
			} else {
				console.warn('⚠️ [HTX] Response:', res);
			}
		} catch (error) {
			console.error('❌ [HTX] Failed to switch account type:', error.message);
			throw error;
		}
	}
};