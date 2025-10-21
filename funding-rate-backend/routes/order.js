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

// POST /api/order/pnl - Lấy PNL của các vị thế
router.post('/pnl', async (req, res) => {
	try {
		const { symbol, positions } = req.body;

		if (!symbol || !positions || !Array.isArray(positions) || positions.length === 0) {
			return res.status(400).json({
				error: 'Invalid request',
				message: 'Symbol and positions array are required'
			});
		}

		const results = await Promise.allSettled(
			positions.map(async (pos) => {
				const handler = exchangeHandlers[pos.exchange];
				if (!handler || !handler.getPNL) {
					throw new Error(`PNL not supported for ${pos.exchange}`);
				}
				if (!hasCredentials(pos.exchange)) {
					throw new Error(`Missing credentials for ${pos.exchange}`);
				}
				const pnl = await handler.getPNL(symbol);
				return {
					...pos,
					pnl
				};
			})
		);

		const response = results.map(result => {
			if (result.status === 'fulfilled') {
				return { success: true, data: result.value };
			} else {
				return { success: false, error: result.reason.message };
			}
		});

		res.json({ results: response });

	} catch (error) {
		console.error('❌ Error in PNL check:', error);
		res.status(500).json({
			error: 'Internal server error',
			message: error.message
		});
	}
});

// POST /api/order/close-hedged - Đóng các vị thế đã hedge
router.post('/close-hedged', async (req, res) => {
	try {
		const { symbol, positions } = req.body;
		if (!symbol || !positions || !Array.isArray(positions) || positions.length !== 2) {
			return res.status(400).json({ error: 'Invalid request, requires symbol and 2 positions' });
		}

		// 1. Lấy PNL của cả 2 vị thế
		const pnlResults = await Promise.all(
			positions.map(pos => {
				const handler = exchangeHandlers[pos.exchange];
				if (!handler || !handler.getPNL) throw new Error(`PNL not supported for ${pos.exchange}`);
				return handler.getPNL(symbol);
			})
		);

		const totalPnl = pnlResults.reduce((sum, pnl) => sum + pnl, 0);
		console.log(`\n💰 Checking PNL for closing: Total PNL = ${totalPnl.toFixed(4)} USDT`);

		// 2. Kiểm tra điều kiện mới: Tổng PNL phải > 0
		if (totalPnl <= 0) {
			console.log('📉 Total PNL is not positive. Orders will not be closed.');
			return res.status(400).json({
				message: `Không thể đóng lệnh, tổng PNL là ${totalPnl.toFixed(4)} USDT (<= 0)`
			});
		}

		console.log('📈 Total PNL is positive. Closing orders...');
		// 3. Đóng cả 2 vị thế (bằng cách đặt lệnh ngược lại)
		const closeResults = await Promise.allSettled(
			positions.map(async (pos) => {
				const handler = exchangeHandlers[pos.exchange]; // Lấy handler của sàn
				// Gọi hàm closePosition mà không cần truyền quantity hay side,
				// vì hàm này sẽ tự động lấy vị thế hiện tại và đóng toàn bộ.
				return handler.closePosition(symbol);
			})
		);

		res.json({ message: 'Các lệnh đã được đóng thành công!', results: closeResults });

	} catch (error) {
		console.error('❌ Error in close-hedged:', error);
		res.status(500).json({ error: 'Internal server error', message: error.message });
	}
});

// Xử lý từng order
async function processOrder(symbol, order) {
	const { exchange, side, leverage, amount } = order;

	console.log(`📊 [${exchange}] ${side} ${symbol} - Leverage: ${leverage}x, Amount: ${amount} USDT`);

	// KIỂM TRA ĐẦU VÀO: amount và leverage phải là số hợp lệ và lớn hơn 0
	if (typeof amount !== 'number' || amount <= 0 || typeof leverage !== 'number' || leverage <= 0) {
		throw new Error('Số tiền (Amount) và Đòn bẩy (Leverage) phải là số và lớn hơn 0.');
	}

	// Kiểm tra exchange có handler không
	const handler = exchangeHandlers[exchange];
	if (!handler) {
		throw new Error(`Exchange "${exchange}" is not supported`);
	}

	// Kiểm tra credentials (sử dụng hàm từ config)
	if (!hasCredentials(exchange)) {
		throw new Error(`Missing API credentials for ${exchange}`);
	}

	// BƯỚC MỚI: Đóng tất cả các lệnh và vị thế cũ trước khi mở lệnh mới
	console.log(`   🧹 [${exchange}] Dọn dẹp các lệnh và vị thế cũ cho ${symbol}...`);
	if (!handler.closePosition) {
		throw new Error(`closePosition not implemented for ${exchange}`);
	}
	await handler.closePosition(symbol);

	// 1. Lấy giá hiện tại
	const price = await handler.getPrice(symbol);
	console.log(`   💰 Current price: $${price}`);

	// 2. Lấy thông tin symbol và tính quantity
	const symbolInfo = await handler.getSymbolInfo(symbol);
	const quantity = calculateQuantity(amount, price, leverage, symbolInfo.quantityPrecision);
	console.log(`   📦 Quantity: ${quantity}`);

	// KIỂM TRA QUANTITY SAU KHI LÀM TRÒN
	if (quantity <= 0) {
		throw new Error(`Số tiền (Amount) quá nhỏ để giao dịch. Số lượng tính toán ra là 0.`);
	}

	// 3. SET MARGIN TYPE (BƯỚC MỚI)
	if (!handler.setMarginType) throw new Error(`setMarginType not implemented for ${exchange}`);
	// Luôn đặt là ISOLATED theo yêu cầu của bạn
	await handler.setMarginType(symbol, 'ISOLATED');

	// KIỂM TRA ĐÒN BẨY HỢP LỆ
	if (leverage > symbolInfo.maxLeverage) {
		throw new Error(`Đòn bẩy ${leverage}x vượt quá mức tối đa cho phép của sàn là ${symbolInfo.maxLeverage}x cho cặp ${symbol}.`);
	}

	// 4. Set leverage (Bước cũ)
	await handler.setLeverage(symbol, leverage);
	console.log(`   ⚡ Leverage set: ${leverage}x`);

	// 5. Place order (Bước cũ)
	const result = await handler.placeOrder(symbol, side, quantity, price);
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
	function calculateQuantity(amount, price, leverage, precision) {
		// Quantity = (Amount * Leverage) / Price
		const qty = (amount * leverage) / price;
		console.log(qty);
		console.log(`   📐 Calculated Qty (raw): ${qty}, Precision: ${precision}`);
		// Làm tròn đến độ chính xác được yêu cầu bởi sàn
		return parseFloat(qty.toFixed(precision));
	}

export default router;