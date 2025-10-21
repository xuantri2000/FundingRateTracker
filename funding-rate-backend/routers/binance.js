import express from 'express'
import { placeOrder } from '../services/binanceService.js'

const router = express.Router()

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

export default router
