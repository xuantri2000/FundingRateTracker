import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import binanceRoutes from './routes/binance.js'
import exchangeRoutes from './routes/exchange.js'

dotenv.config()
const app = express()
app.use(cors())
app.use(express.json())

// 🧩 Các route
app.use('/exchange', exchangeRoutes)
app.use('/binance', binanceRoutes)

// 🚀 Start
app.listen(process.env.PORT || 3001, () =>
  console.log(`🚀 Server running on port ${process.env.PORT || 3001}`)
)
