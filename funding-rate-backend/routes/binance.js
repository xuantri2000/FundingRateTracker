import express from 'express'
import { placeOrder, getOpenOrders } from '../services/binanceService.js'

const router = express.Router()

// 🟩 Đặt lệnh
router.post('/order', async (req, res) => {
  try {
    const { symbol, side, type, quantity, price } = req.body
    const result = await placeOrder(symbol, side, type, quantity, price)
    res.json(result)
  } catch (err) {
    console.error('❌ Binance order error:', err)
    res.status(500).json({ error: err.message })
  }
})

// 🟦 Lấy danh sách lệnh Futures đang mở
router.get('/orders', async (req, res) => {
  try {
    const { symbol } = req.query
    const orders = await getOpenOrders(symbol)
    res.json(orders)
  } catch (err) {
    console.error('❌ Binance get orders error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
