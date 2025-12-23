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
				const positionInfo = await handler.getPNL(symbol);
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

// POST /api/order/close-single - Đóng 1 vị thế cụ thể
router.post('/close-single', async (req, res) => {
	try {
		const { symbol, exchange } = req.body;
		if (!symbol || !exchange) {
			return res.status(400).json({ 
				error: 'Invalid request', 
				message: 'Symbol and exchange are required' 
			});
		}

		console.log(`\n🔴 Closing single position: ${symbol} on ${exchange}`);
		
		const handler = exchangeHandlers[exchange];
		if (!handler || !handler.closePosition) {
			throw new Error(`closePosition not supported for ${exchange}`);
		}
		if (!hasCredentials(exchange)) {
			throw new Error(`Missing credentials for ${exchange}`);
		}

		// Đóng vị thế trên sàn này
		const result = await handler.closePosition(symbol);
		
		console.log(`✅ Position closed on ${exchange}`);
		res.json({ 
			success: true,
			message: `Đã đóng vị thế ${symbol} trên ${exchange}`,
			data: result 
		});

	} catch (error) {
		console.error('❌ Error in close-single:', error);
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
		const closeResults = await Promise.allSettled(
			positions.map(async (pos) => {
				const handler = exchangeHandlers[pos.exchange];
				return handler.closePosition(symbol);
			})
		);

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

// POST /api/order/open-orders - Lấy tất cả lệnh đang mở cho các sàn
router.post('/open-orders', async (req, res) => {
	try {
		const { symbol, exchanges: exchangeIds } = req.body;

		if (!symbol || !exchangeIds || !Array.isArray(exchangeIds) || exchangeIds.length === 0) {
			return res.status(400).json({
				error: 'Invalid request',
				message: 'Symbol and exchanges array are required'
			});
		}

		const results = await Promise.allSettled(
			exchangeIds.map(async (exchangeId) => {
				const handler = exchangeHandlers[exchangeId];
				if (!handler || !handler.getAllOpenOrders) {
					throw new Error(`getAllOpenOrders not supported for ${exchangeId}`);
				}
				if (!hasCredentials(exchangeId)) {
					throw new Error(`Missing credentials for ${exchangeId}`);
				}
				const openOrders = await handler.getAllOpenOrders(symbol);
				return {
					exchange: exchangeId,
					orders: openOrders
				};
			})
		);

		const response = results.map((result, index) => {
			if (result.status === 'fulfilled') {
				return { success: true, data: result.value };
			} else {
				return {
					success: false,
					exchange: exchangeIds[index],
					error: result.reason.message
				};
			}
		});

		res.json({ results: response });

	} catch (error) {
		console.error('❌ Error in open-orders check:', error);
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

		const totalPnl = pnlResults.reduce((sum, positionInfo) => sum + positionInfo.pnl, 0);
		console.log(`   -> Server-side check result: Total PNL = ${totalPnl.toFixed(4)} USDT`);

		// 2. Kiểm tra điều kiện: Tổng PNL phải > 0
		if (totalPnl <= 0) {
			console.log('📉 Total PNL is not positive. Orders will not be closed.');
			return res.status(400).json({
				message: `Không thể đóng lệnh, tổng PNL là ${totalPnl.toFixed(4)} USDT (<= 0)`
			});
		}

		console.log('📈 Total PNL is positive. Closing orders...');
		
		// 3. Đóng cả 2 vị thế
		const closeResults = await Promise.allSettled(
			positions.map(async (pos) => {
				const handler = exchangeHandlers[pos.exchange];
				return handler.closePosition(symbol);
			})
		);

		res.json({
			message: 'Các lệnh đã được đóng thành công!',
			results: closeResults,
			closedPnl: pnlResults.map(p => p.pnl),
			totalPnl: totalPnl
		});

	} catch (error) {
		console.error('❌ Error in close-hedged:', error);
		res.status(500).json({ error: 'Internal server error', message: error.message });
	}
});

// Xử lý từng order
async function processOrder(symbol, order) {
	const { exchange, side, leverage, amount, price } = order; // <<< ĐÃ THÊM price

	console.log(`------------------------ [${exchange.toUpperCase()}] ------------------------`);
	console.log(`📊 [${exchange}] ${side} ${symbol} - Leverage: ${leverage}x, Quantity: ${amount}, Price: ${price}`);

	// KIỂM TRA ĐẦU VÀO
	if (typeof amount !== 'number' || amount <= 0 || typeof leverage !== 'number' || leverage <= 0) {
		throw new Error('Số lượng (Amount) và Đòn bẩy (Leverage) phải là số và lớn hơn 0.');
	}
    // THÊM: Kiểm tra price nếu nó được cung cấp
    if (!price || typeof price !== 'number' || price <= 0) {
        throw new Error('Giá (Price) là bắt buộc và phải là số lớn hơn 0 cho lệnh Limit.');
	}

	// Kiểm tra exchange có handler không
	const handler = exchangeHandlers[exchange];
	if (!handler) {
		throw new Error(`Exchange "${exchange}" is not supported`);
	}

	// Kiểm tra credentials
	if (!hasCredentials(exchange)) {
		throw new Error(`Missing API credentials for ${exchange}`);
	}

	// Dọn dẹp các lệnh và vị thế cũ
	console.log(`   🧹 [${exchange}] Dọn dẹp các lệnh và vị thế cũ cho ${symbol}...`);
	if (!handler.closePosition) {
		throw new Error(`closePosition not implemented for ${exchange}`);
	}
	await handler.closePosition(symbol);

	// 1. Lấy thông tin symbol
	const symbolInfo = await handler.getSymbolInfo(symbol);

	// 2. Tính toán quantity
	let quantity = parseFloat(amount.toFixed(6)); // Mặc định quantity là amount (số lượng base asset)

	// ✨ Xử lý đặc biệt cho Gate.io: Chuyển đổi amount (USDT) sang số lượng hợp đồng
	if (exchange === 'gateio' && symbolInfo.quantoMultiplier) {
		console.log(`    Gate.io: Converting amount to contract size...`);
		// Số lượng hợp đồng = Số lượng base asset / Kích thước 1 hợp đồng (quantoMultiplier)
		quantity = amount / symbolInfo.quantoMultiplier;
		console.log(`   Gate.io: Amount ${amount} (base asset) ≈ ${quantity.toFixed(2)} contracts (Multiplier: ${symbolInfo.quantoMultiplier})`);

		if(quantity <= 0) {
			throw new Error(`Gate.io: Số lượng tối thiểu phải là ${symbolInfo.quantoMultiplier}.`);
		}
	}
	// ✨ Xử lý đặc biệt cho HTX: Chuyển đổi amount (base asset) sang số lượng hợp đồng
	if (exchange === 'htx' && symbolInfo.contractSize) {
		console.log(`    HTX: Converting amount to contract size...`);
		// Số lượng hợp đồng = Số lượng base asset / Kích thước 1 hợp đồng (contractSize)
		quantity = amount / symbolInfo.contractSize;
		// HTX yêu cầu số lượng là số nguyên
		quantity = Math.round(quantity);
		console.log(`   HTX: Amount ${amount} (base asset) ≈ ${quantity} contracts (Contract Size: ${symbolInfo.contractSize})`);

		if(quantity <= 0) {
			throw new Error(`HTX: Số lượng tối thiểu phải là ${symbolInfo.contractSize}.`);
		}
	}
	// ✨ Xử lý đặc biệt cho KuCoin: Chuyển đổi amount (base asset) sang số lượng hợp đồng
	if (exchange === 'kucoin' && symbolInfo.multiplier) {
		console.log(`    KuCoin: Converting amount to contract size...`);
		// Số lượng hợp đồng = Số lượng base asset / Kích thước 1 hợp đồng (multiplier)
		quantity = amount / symbolInfo.multiplier;
		quantity = Math.round(quantity); // KuCoin yêu cầu số lượng là số nguyên
		console.log(`   KuCoin: Amount ${amount} (base asset) ≈ ${quantity} contracts (Multiplier: ${symbolInfo.multiplier})`);

		if(quantity <= 0) {
			throw new Error(`KuCoin: Số lượng tối thiểu phải là ${symbolInfo.multiplier}.`);
		}
	}

	if (exchange === 'bitget' && symbolInfo.sizeMultiplier) {
		console.log(`    Bitget: Converting amount to contract size...`);
		// Số lượng hợp đồng = Số lượng base asset / Kích thước 1 hợp đồng (multiplier)
		quantity = amount / symbolInfo.sizeMultiplier;
		quantity = Math.round(quantity);
		console.log(`   Bitget: Amount ${amount} (base asset) ≈ ${quantity} contracts (Multiplier: ${symbolInfo.sizeMultiplier})`);

		if(quantity <= 0) {
			throw new Error(`Bitget: Số lượng tối thiểu phải là ${symbolInfo.sizeMultiplier}.`);
		}
	}

	
	// KIỂM TRA QUANTITY SAU KHI LÀM TRÒN
	// if (quantity <= 0) {
	// 	throw new Error(`Số lượng (Amount) không hợp lệ. Số lượng phải lớn hơn 0.`);
	// }

	// 3. SET MARGIN TYPE
	if (!handler.setMarginType) throw new Error(`setMarginType not implemented for ${exchange}`);
	await handler.setMarginType(symbol, 'ISOLATED');

	// KIỂM TRA ĐÒN BẨY HỢP LỆ
	if (leverage > symbolInfo.maxLeverage) {
		throw new Error(`Đòn bẩy ${leverage}x vượt quá mức tối đa cho phép của sàn là ${symbolInfo.maxLeverage}x cho cặp ${symbol}.`);
	}
	
	// 4. Set leverage
	// KuCoin gửi leverage cùng với lệnh, không cần set riêng
	if (exchange !== 'kucoin' && exchange !== 'htx') {
		await handler.setLeverage(symbol, leverage);
		console.log(`   ⚡ Leverage set: ${leverage}x`);
	}

	// 5. Place order
	// TRUYỀN THÊM leverage VÀ price
	const result = await handler.placeOrder(symbol, side, quantity, leverage, price); 
	console.log(`   ✅ Order placed: ${result.orderId || 'OK'}`);

	return {
		price: price, // <<< TRẢ VỀ price
		quantity,
		leverage,
		orderId: result.orderId,
		timestamp: new Date().toISOString()
	};
}

export default router;