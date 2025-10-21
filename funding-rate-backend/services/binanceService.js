import crypto from 'crypto'
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const BASE_URL = 'https://testnet.binancefuture.com' // Binance Futures Testnet

export async function placeOrder(symbol, side, type, quantity, price) {
  const timestamp = Date.now()
  const params = new URLSearchParams({
    symbol,
    side,       // BUY / SELL
    type,       // LIMIT / MARKET
    quantity,
    price,
    timeInForce: 'GTC',
    recvWindow: 5000,
    timestamp,
  })

  const signature = crypto
    .createHmac('sha256', process.env.BINANCE_SECRET_KEY)
    .update(params.toString())
    .digest('hex')

  params.append('signature', signature)

  const response = await axios.post(`${BASE_URL}/fapi/v1/order`, params, {
    headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY },
  })

  return response.data
}
