import 'dotenv/config';

export const MODE = process.env.TRADING_MODE || 'testnet';

// Cấu hình tập trung cho tất cả các sàn
export const EXCHANGES = {
	binance: {
		name: 'Binance',
		urls: {
			production: 'https://fapi.binance.com',
			testnet: 'https://testnet.binancefuture.com'
		},
		ws: { /* ... */ }
	},
	bybit: {
		name: 'Bybit',
		urls: {
			production: 'https://api.bybit.com',
			testnet: 'https://api-testnet.bybit.com' // Bybit có testnet
		},
		ws: { /* ... */ }
	},
	whitebit: {
		name: 'WhiteBIT',
		urls: {
			production: 'https://whitebit.com',
			testnet: 'https://whitebit.com'
		},
		ws: {}
	},
	// THÊM BITGET
	bitget: {
		name: 'Bitget',
		urls: {
			// Bitget API V2 dùng chung URL cho cả production và demo trading
			production: 'https://api.bitget.com',
			testnet: 'https://api.bitget.com'
		},
		ws: {}
	}
};

/**
 * Lấy API key và Secret key cho một sàn
 * @param {string} exchangeId - 'binance', 'bybit', 'whitebit'
 * @returns {{apiKey: string, secretKey: string, passphrase?: string}}
 */
export function getCredentials(exchangeId) {
	const prefix = exchangeId.toUpperCase();
	return {
		apiKey: process.env[`${prefix}_API_KEY`],
		secretKey: process.env[`${prefix}_SECRET_KEY`],
		passphrase: process.env[`${prefix}_PASSPHRASE`] || "" // Thêm passphrase cho Bitget
	};
}

/**
 * Kiểm tra xem sàn có đủ credentials không
 * @param {string} exchangeId - 'binance' hoặc 'bybit'
 * @returns {boolean}
 */
export function hasCredentials(exchangeId) {
	const creds = getCredentials(exchangeId);
	// Bitget yêu cầu thêm passphrase
	if (exchangeId === 'bitget') {
		// Kiểm tra cả 3 giá trị: apiKey, secretKey, và passphrase
		return !!(creds.apiKey && creds.secretKey && creds.passphrase);
	}
	// Các sàn khác chỉ cần apiKey và secretKey
	return !!(creds.apiKey && creds.secretKey);
}