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
	// THÊM WHITEBIT
	whitebit: {
		name: 'WhiteBIT',
		urls: {
			production: 'https://whitebit.com',
			testnet: 'https://whitebit.com'
		},
		ws: {}
	}
};

/**
 * Lấy API key và Secret key cho một sàn
 * @param {string} exchangeId - 'binance', 'bybit', 'whitebit'
 * @returns {{apiKey: string, secretKey: string}}
 */
export function getCredentials(exchangeId) {
	const prefix = exchangeId.toUpperCase();
	return {
		apiKey: process.env[`${prefix}_API_KEY`],
		secretKey: process.env[`${prefix}_SECRET_KEY`]
	};
}

/**
 * Kiểm tra xem sàn có đủ credentials không
 * @param {string} exchangeId - 'binance' hoặc 'bybit'
 * @returns {boolean}
 */
export function hasCredentials(exchangeId) {
	const { apiKey, secretKey } = getCredentials(exchangeId);
	return !!(apiKey && secretKey);
}