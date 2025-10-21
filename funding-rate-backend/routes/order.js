import express from 'express';
import exchangeHandlers from '../services/exchangeHandlers/index.js';
import { hasCredentials } from '../services/config.js';

const router = express.Router();

router.post('/multi', async (req, res) => {
	try {
		const { symbol, orders } = req.body;

		// Validate input
		if (!symbol || !orders || !Array.isArray(orders) || orders.length === 0) {
			return res.status(400).json({
				error: 'Invalid request',
				message: 'Symbol and orders array are required'
			});
		}

		console.log(`\n🚀 Processing ${orders.length} orders for ${symbol}`);

		// Xử lý tất cả orders song song
		const results = await Promise.allSettled(
			orders.map(order => processOrder(symbol, order))
		);

		// Format kết quả
		const response = results.map((result, index) => {
			const order = orders[index];

			if (result.status === 'fulfilled') {
				return {
					exchange: order.exchange,
					side: order.side,
					success: true,
					data: result.value
				};
			} else {
				// Trả về thông báo lỗi rõ ràng hơn từ handler
				return {
					exchange: order.exchange,
					side: order.side,
					success: false,
					error: result.reason.message || 'Unknown error'
				};
			}
		});

		// Log summary
		const successCount = response.filter(r => r.success).length;
		console.log(`✅ ${successCount}/${orders.length} orders placed successfully\n`);

		res.json({
			symbol,
			results: response,
			summary: {
				total: orders.length,
				success: successCount,
				failed: orders.length - successCount
			}
		});

	} catch (error) {
		console.error('❌ Error in multi order:', error);
		res.status(500).json({
			error: 'Internal server error',
			message: error.message
		});
	}
});

// Xử lý từng order
async function processOrder(symbol, order) {
	const { exchange, side, leverage, amount } = order;

	console.log(`📊 [${exchange}] ${side} ${symbol} - Leverage: ${leverage}x, Amount: ${amount} USDT`);

	// Kiểm tra exchange có handler không
	const handler = exchangeHandlers[exchange];
	if (!handler) {
		throw new Error(`Exchange "${exchange}" is not supported`);
	}

	// Kiểm tra credentials (sử dụng hàm từ config)
	if (!hasCredentials(exchange)) {
		throw new Error(`Missing API credentials for ${exchange}`);
	}

	// 1. Lấy giá hiện tại
	const price = await handler.getPrice(symbol);
	console.log(`   💰 Current price: $${price}`);

	// 2. Tính quantity
	const quantity = calculateQuantity(amount, price, leverage);
	console.log(`   📦 Quantity: ${quantity}`);

	// 3. SET MARGIN TYPE (BƯỚC MỚI)
	// Luôn đặt là ISOLATED theo yêu cầu của bạn
	await handler.setMarginType(symbol, 'ISOLATED');

	// 4. Set leverage (Bước cũ)
	await handler.setLeverage(symbol, leverage);
	console.log(`   ⚡ Leverage set: ${leverage}x`);

	// 5. Place order (Bước cũ)
	const result = await handler.placeOrder(symbol, side, quantity);
	console.log(`   ✅ Order placed: ${result.orderId || 'OK'}`);

	return {
		price,
		quantity,
		leverage,
		orderId: result.orderId,
		timestamp: new Date().toISOString()
	};
}

	// Tính quantity dựa trên amount và giá
	function calculateQuantity(amount, price, leverage) {
		// Quantity = (Amount * Leverage) / Price
		const qty = (amount * leverage) / price;
		// Làm tròn đến 3 chữ số thập phân
		return parseFloat(qty.toFixed(3));
	}

export default router;