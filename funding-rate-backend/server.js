import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import binanceRoutes from './routes/binance.js'

dotenv.config()
const app = express()
app.use(cors())
app.use(express.json())

app.use('/api/binance', binanceRoutes)

app.listen(process.env.PORT || 3001, () =>
  console.log(`🚀 Server running on port ${process.env.PORT || 3001}`)
)
