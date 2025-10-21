import express from 'express'
import { EXCHANGES } from '../config/exchange.js'

const router = express.Router()

// 🟦 API: Lấy danh sách sàn (cho frontend)
router.get('/', (req, res) => {
  res.json(EXCHANGES)
})

export default router
