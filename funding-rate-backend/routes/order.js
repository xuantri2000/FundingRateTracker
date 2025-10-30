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
				const positionInfo = await handler.getPNL(symbol); // getPNL giờ trả về {pnl, size}
				return {
					...pos,
					...positionInfo
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

// POST /api/order/force-close - Buộc đóng các vị thế (bỏ qua điều kiện PNL)
router.post('/force-close', async (req, res) => {
	try {
		const { symbol, positions } = req.body;
		if (!symbol || !positions || !Array.isArray(positions) || positions.length === 0) {
			return res.status(400).json({ error: 'Invalid request, requires symbol and positions' });
		}

		console.log('🚨 Force closing orders...');
		// Đóng tất cả các vị thế (bằng cách gọi closePosition)
		const closeResults = await Promise.allSettled(
			positions.map(async (pos) => {
				const handler = exchangeHandlers[pos.exchange];
				return handler.closePosition(symbol); // closePosition đã bao gồm hủy lệnh mở và đóng vị thế
			})
		);

		// Kiểm tra xem có lỗi nào không
		const failedClosures = closeResults.filter(r => r.status === 'rejected');
		if (failedClosures.length > 0) {
			const errorMessages = failedClosures.map(r => r.reason.message).join('; ');
			return res.status(500).json({ message: `Buộc hủy lệnh có lỗi: ${errorMessages}`, results: closeResults });
		}

		res.json({ message: 'Tất cả các lệnh đã được buộc hủy thành công!', results: closeResults });

	} catch (error) {
		console.error('❌ Error in force-close:', error);
		res.status(500).json({ error: 'Internal server error', message: error.message });
	}
});

// POST /api/order/close-hedged - Đóng các vị thế đã hedge
router.post('/close-hedged', async (req, res) => {
	try {
		const { symbol, positions } = req.body;
		if (!symbol || !positions || !Array.isArray(positions) || positions.length !== 2) {
			return res.status(400).json({ error: 'Invalid request, requires symbol and 2 positions' });
		}

		console.log(`\n💰 Received request to close hedged positions for ${symbol}.`);
		console.log('   -> Verifying PNL on server-side as a final check...');
		// 1. Lấy PNL của cả 2 vị thế
		const pnlResults = await Promise.all(
			positions.map(pos => {
				const handler = exchangeHandlers[pos.exchange];
				if (!handler || !handler.getPNL) throw new Error(`PNL not supported for ${pos.exchange}`);
				return handler.getPNL(symbol);
			})
		);

		// pnlResults giờ là một mảng các đối tượng {pnl, size}, cần truy cập vào thuộc tính .pnl
		const totalPnl = pnlResults.reduce((sum, positionInfo) => sum + positionInfo.pnl, 0);
		console.log(`   -> Server-side check result: Total PNL = ${totalPnl.toFixed(4)} USDT`);

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

		res.json({
			message: 'Các lệnh đã được đóng thành công!',
			results: closeResults,
			closedPnl: pnlResults.map(p => p.pnl), // Chỉ trả về mảng các số PNL
			totalPnl: totalPnl      // Trả về tổng PNL
		});

	} catch (error) {
		console.error('❌ Error in close-hedged:', error);
		res.status(500).json({ error: 'Internal server error', message: error.message });
	}
});

// Xử lý từng order
async function processOrder(symbol, order) {
	const { exchange, side, leverage, amount } = order;

	console.log(`------------------------ [${exchange.toUpperCase()}] ------------------------`);
	console.log(`📊 [${exchange}] ${side} ${symbol} - Leverage: ${leverage}x, Quantity: ${amount}`);

	// KIỂM TRA ĐẦU VÀO: amount và leverage phải là số hợp lệ và lớn hơn 0
	if (typeof amount !== 'number' || amount <= 0 || typeof leverage !== 'number' || leverage <= 0) {
		throw new Error('Số lượng (Amount) và Đòn bẩy (Leverage) phải là số và lớn hơn 0.');
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

	// 1. Lấy thông tin symbol
	const symbolInfo = await handler.getSymbolInfo(symbol);

	// 2. Sử dụng 'amount' trực tiếp làm 'quantity' và làm tròn đến 2 chữ số thập phân
	const quantity = parseFloat(amount.toFixed(2));
	console.log(`   📦 Quantity: ${quantity} (from input)`);

	// KIỂM TRA QUANTITY SAU KHI LÀM TRÒN
	if (quantity <= 0) {
		throw new Error(`Số lượng (Amount) không hợp lệ. Số lượng phải lớn hơn 0.`);
	}

	// 3. SET MARGIN TYPE (BƯỚC MỚI)
	if (!handler.setMarginType) throw new Error(`setMarginType not implemented for ${exchange}`);
	// Luôn đặt là CROSS theo yêu cầu
	await handler.setMarginType(symbol, 'ISOLATED');

	// KIỂM TRA ĐÒN BẨY HỢP LỆ
	if (leverage > symbolInfo.maxLeverage) {
		throw new Error(`Đòn bẩy ${leverage}x vượt quá mức tối đa cho phép của sàn là ${symbolInfo.maxLeverage}x cho cặp ${symbol}.`);
	}

	// 4. Set leverage (Bước cũ)
	await handler.setLeverage(symbol, leverage);
	console.log(`   ⚡ Leverage set: ${leverage}x`);

	// 5. Place order (Bước cũ)
	const result = await handler.placeOrder(symbol, side, quantity);
	console.log(`   ✅ Order placed: ${result.orderId || 'OK'}`);

	return {
		price: null, // Không còn tính toán giá ở bước này
		quantity,
		leverage,
		orderId: result.orderId,
		timestamp: new Date().toISOString()
	};
}

export default router;