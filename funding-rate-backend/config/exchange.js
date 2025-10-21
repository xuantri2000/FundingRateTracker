import dotenv from 'dotenv'
dotenv.config()

const ENV = process.env.ENVIRONMENT || 'production'

/**
 * 🌐 Cấu hình base URL cho từng môi trường
 */
const BASE_URLS = {
  binance: {
    production: 'https://api.binance.com',
    testnet: 'https://testnet.binancefuture.com',
  },
  bybit: {
    production: 'https://api.bybit.com',
    testnet: 'https://api-testnet.bybit.com',
  },
}

/**
 * 🧩 Danh sách sàn — tự động lấy URL theo ENV
 */
export const EXCHANGES = Object.entries(BASE_URLS).map(([id, urls]) => ({
  id,
  name: id === 'binance' ? 'Binance' : 'Bybit',
  baseUrl: urls[ENV] || urls.production,
}))

/**
 * 🔐 Cấu hình API key
 */
export const EXCHANGE_CONFIG = {
  binance: {
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_SECRET_KEY,
  },
  bybit: {
    apiKey: process.env.BYBIT_API_KEY,
    secret: process.env.BYBIT_SECRET_KEY,
  },
}

console.log(`🌍 ENVIRONMENT = ${ENV}`)
console.log(
  '✅ Loaded exchange:',
  EXCHANGES.map((e) => `${e.name}: ${e.baseUrl}`).join(', ')
)
