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
    ws: {
      production: 'wss://fstream.binance.com',
      testnet: 'wss://fstream-testnet.binance.com'
    }
  },
  bybit: {
    name: 'Bybit',
    urls: {
      production: 'https://api.bybit.com',
      testnet: 'https://api-testnet.bybit.com'
    },
    ws: {
      production: 'wss://stream.bybit.com/v5/public/linear',
      testnet: 'wss://stream-testnet.bybit.com/v5/public/linear'
    }
  }
};

/**
 * Lấy API key và Secret key cho một sàn
 * @param {string} exchangeId - 'binance' hoặc 'bybit'
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