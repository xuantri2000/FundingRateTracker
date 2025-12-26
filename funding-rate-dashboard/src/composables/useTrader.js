import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import axios from 'axios'

const STORAGE_KEY = 'traderState';

export function useTrader() {
	// --- State ---
	const symbol = ref('BTCUSDT')
	const longOrder = ref(null)
	const shortOrder = ref(null)
	const exchanges = ref([])
	const isLoading = ref(false)
	const logs = ref([])
	const toasts = ref([])
	const isOrderHunting = ref(false);
	const isTrackingPnl = ref(false);
	const isWaitingForFills = ref(false);
	const pnlData = ref([]);
	const successfulPositions = ref([]);
	const pendingOrders = ref([]);
	const isPnlHunting = ref(false);
	const longOrderValue = ref(0);
	const shortOrderValue = ref(0);

	// --- Private state (not returned) ---
	let lastPnlDataBeforeUpdate = [];
	let totalOrderValueForPnlHunt = 0;
	let orderFillInterval = null;
	let pnlInterval = null;
	let longPoller = null;
	let shortPoller = null;

	// --- Methods ---
	const addToast = (message, type = 'info') => {
		const id = Date.now()
		toasts.value.push({ id, message, type })
		setTimeout(() => {
			toasts.value = toasts.value.filter(t => t.id !== id)
		}, 4000)
	}

	const addLog = (message, type = 'info') => {
		const timestamp = new Date().toLocaleTimeString('vi-VN');
		logs.value.push({ id: Date.now() + Math.random(), timestamp, message, type });
		console.log(`[${type.toUpperCase()}] ${message}`);
	}

	// --- Computed ---
	const exchangeNameMap = computed(() => {
		const map = {};
		exchanges.value.forEach(ex => { map[ex.key] = ex.name; });
		return map;
	});

	const totalPnl = computed(() => {
		return pnlData.value.reduce((sum, pos) => sum + (pos.pnl || 0), 0)
	})

	const orderRatio = computed(() => {
		if (shortOrderPrice.value > 0 && longOrderPrice.value > 0) {
			const ratio = longOrderPrice.value / shortOrderPrice.value;
			return ratio.toFixed(5);
		}
		return 'N/A';
	});

	const entryPriceRatio = computed(() => {
		const lPrice = longOrder.value?.price;
		const sPrice = shortOrder.value?.price;
		if (lPrice > 0 && sPrice > 0) {
			return (lPrice / sPrice).toFixed(5);
		}
		return 'N/A';
	});

	const longOrderPrice = computed(() => {
		if (longOrderValue.value > 0 && longOrder.value?.amount > 0) {
			return longOrderValue.value / longOrder.value.amount;
		}
		return 0;
	});

	const shortOrderPrice = computed(() => {
		if (shortOrderValue.value > 0 && shortOrder.value?.amount > 0) {
			return shortOrderValue.value / shortOrder.value.amount;
		}
		return 0;
	});

	// --- Formatting/Helper Functions ---
	const formatPnl = (pnl) => {
		if (pnl === null || pnl === undefined) return 'Đang tải...'
		return pnl.toFixed(4)
	}

	const getPnlClass = (pnl) => {
		if (pnl === null || pnl === undefined) return 'text-slate-400'
		return pnl > 0 ? 'text-green-400' : pnl < 0 ? 'text-red-400' : 'text-slate-400'
	}

	const getPendingStatusText = (status) => {
		switch (status) {
			case 'filled': return 'Đã khớp';
			case 'failed': return 'Thất bại';
			case 'pending':
			default: return 'Đang chờ...';
		}
	};

	const getPendingStatusClass = (status) => {
		switch (status) {
			case 'filled': return 'text-green-400';
			case 'failed': return 'text-red-400';
			case 'pending':
			default: return 'text-blue-400';
		}
	};

	const reset = (shouldRestartPolling = true) => {
		isTrackingPnl.value = false
		isWaitingForFills.value = false;
		if (pnlInterval) clearInterval(pnlInterval)
		if (orderFillInterval) clearInterval(orderFillInterval);
		pnlData.value = []
		successfulPositions.value = []
		isPnlHunting.value = false; // Reset chế độ săn PNL
		pendingOrders.value = [];
		localStorage.removeItem(STORAGE_KEY); // Xóa state khi reset

		if (shouldRestartPolling && longPoller && shortPoller) {
			addLog('Khởi động lại theo dõi giá trị ước tính.', 'info');
			longPoller.startPolling();
			shortPoller.startPolling();
		}
	}

	const forceClosePositions = async (positionsToClose = null, shouldReset = true) => {
		// Dừng mọi hoạt động săn PNL hoặc polling PNL thông thường
		if (pnlInterval) clearInterval(pnlInterval);

		isLoading.value = true;
		// Sử dụng danh sách vị thế được truyền vào, hoặc danh sách mặc định nếu không có
		const targetPositions = positionsToClose || successfulPositions.value;
		try {
			// Gọi API mới để đóng lệnh mà không cần kiểm tra PNL
			const { data } = await axios.post('/api/order/force-close', {
				symbol: symbol.value,
				positions: targetPositions, // Cần gửi thông tin các sàn để đóng
			});
			isPnlHunting.value = false; // Tắt chế độ săn khi buộc hủy
			if (shouldReset) {
				addToast(data.message, 'success');
				addLog(data.message, 'success');
				localStorage.removeItem(STORAGE_KEY); // Xóa state khi đã đóng lệnh thành công
				reset(); // Chỉ reset state, không xóa log
			}
		} catch (err) {
			console.error('Lỗi buộc hủy lệnh:', err);
			addToast(err.response?.data?.message || 'Buộc hủy lệnh thất bại.', 'error');
			addLog(err.response?.data?.message || 'Buộc hủy lệnh thất bại.', 'error');
		} finally {
			isLoading.value = false;
		}
	}

	const startPnlTracking = () => {
		if (pnlInterval) clearInterval(pnlInterval)

		// Dừng theo dõi giá trị ước tính khi bắt đầu theo dõi PNL
		longPoller.stopPolling();
		shortPoller.stopPolling();
		addLog('Đã dừng theo dõi giá trị ước tính.', 'info');

		const fetchPnl = async () => {
			// Chỉ fetch PNL cho các vị thế chưa bị đóng/thanh lý
			const activePositions = successfulPositions.value.filter(p => {
				const pnlEntry = pnlData.value.find(pd => pd.exchange === p.exchange);
				return !pnlEntry || !pnlEntry.isLiquidated;
			});

			if (activePositions.length === 0) return; // Dừng nếu không còn vị thế nào

			try {
				const { data } = await axios.post('/api/order/pnl', {
					symbol: symbol.value,
					positions: activePositions,
				})

				lastPnlDataBeforeUpdate = [...pnlData.value];

				const newPnlData = data.results.map(r => {
					if (r.success) {
						return r.data;
					}
					// Nếu API getPNL thất bại cho một sàn, tìm PNL cũ và đánh dấu là thanh lý
					// Giả sử lỗi trả về { message: '...', exchange: '...' }
					const failedExchange = r.error?.exchange;
					const oldPos = lastPnlDataBeforeUpdate.find(p => p.exchange === failedExchange);
					if (oldPos) {
						return { ...oldPos, isLiquidated: true, size: 0 };
					}
					return null;
				}).filter(Boolean);

				// Cập nhật pnlData: giữ lại các lệnh đã đóng, cập nhật các lệnh đang hoạt động
				pnlData.value = pnlData.value.map(oldPos => {
					if (oldPos.isLiquidated) return oldPos; // Giữ nguyên lệnh đã đóng
					const newPos = newPnlData.find(p => p.exchange === oldPos.exchange);
					return newPos || oldPos; // Cập nhật nếu có dữ liệu mới, nếu không giữ lại
				});

				// Tính tổng PNL từ dữ liệu đã cập nhật (bao gồm cả PNL đã đóng băng)
				const currentTotalPnl = pnlData.value.reduce((sum, pos) => sum + (pos.pnl || 0), 0);

				// KIỂM TRA AN TOÀN: Nếu một vị thế bị đóng/thanh lý bất ngờ
				// Tìm các vị thế vừa bị đóng trong lần fetch này
				const justClosedPositions = newPnlData.filter(p => p.size === 0);
				for (const closedPos of justClosedPositions) {
					const pnlEntry = pnlData.value.find(p => p.exchange === closedPos.exchange);
					// Chỉ xử lý nếu nó chưa được đánh dấu là đã đóng
					if (pnlEntry && !pnlEntry.isLiquidated) {
						const lastKnownPnl = lastPnlDataBeforeUpdate.find(p => p.exchange === closedPos.exchange)?.pnl || 0;
						const exchangeName = exchangeNameMap.value[closedPos.exchange] || closedPos.exchange;

						addToast(`Phát hiện vị thế [${exchangeName}] đã bị đóng. PNL được ghi nhận: ${lastKnownPnl.toFixed(2)} USDT.`, 'warning');
						addLog(`Phát hiện vị thế [${exchangeName}] đã bị đóng. PNL được ghi nhận: ${lastKnownPnl.toFixed(2)} USDT.`, 'warning');

						// Đóng băng PNL và đánh dấu là đã đóng
						pnlData.value = pnlData.value.map(p => {
							if (p.exchange === closedPos.exchange) {
								return { ...p, pnl: lastKnownPnl, isLiquidated: true, size: 0 };
							}
							return p;
						});
					}
				}

				// KIỂM TRA SĂN PNL (ĐIỀU CHỈNH THEO YÊU CẦU)
				if (isPnlHunting.value && totalOrderValueForPnlHunt > 0) {
					const pnlHuntThreshold = totalOrderValueForPnlHunt * 0.0025; // 0.25%
					if (totalPnl.value >= pnlHuntThreshold) {
						const successMsg = `Tổng PNL đạt ${totalPnl.value.toFixed(4)} USDT (>= ngưỡng ${pnlHuntThreshold.toFixed(4)} USDT). Tự động đóng lệnh!`;
						addToast(successMsg, 'success');
						addLog(successMsg, 'success');
						isPnlHunting.value = false; // Tắt chế độ săn
						await closeHedgedPositions();
					}
				}
			} catch (error) {
				console.error('Lỗi fetch PNL:', error)
				addToast('Lỗi khi cập nhật PNL.', 'error')
				addLog('Lỗi khi cập nhật PNL.', 'error')
				clearInterval(pnlInterval)
			}
		}
		const intervalTime = 500; // Luôn poll nhanh khi đang theo dõi
		if (!pnlInterval) fetchPnl() // Fetch immediately on first run
		pnlInterval = setInterval(fetchPnl, intervalTime)
	}

	const startOrderFillTracking = () => {
		if (orderFillInterval) clearInterval(orderFillInterval);

		// Tạm dừng theo dõi giá trị ước tính trong khi chờ khớp lệnh
		longPoller.stopPolling();
		shortPoller.stopPolling();
		addLog('Tạm dừng theo dõi giá trị ước tính trong khi chờ khớp lệnh.', 'info');

		const checkFills = async () => {
			// Lấy các lệnh chưa được xác nhận đã khớp
			const unconfirmedOrders = pendingOrders.value.filter(o => o.status !== 'filled');

			if (unconfirmedOrders.length === 0) {
				clearInterval(orderFillInterval);
				// Trường hợp này thường được xử lý bên dưới, nhưng đây là một biện pháp bảo vệ
				if (isWaitingForFills.value) {
					addToast('Tất cả lệnh đã được khớp!', 'success');
					addLog('Tất cả lệnh đã được khớp! Bắt đầu theo dõi PNL.', 'success');
					isWaitingForFills.value = false;
					successfulPositions.value = [...pendingOrders.value];
					pendingOrders.value = [];
					totalOrderValueForPnlHunt = longOrderValue.value + shortOrderValue.value;
					addLog(`Tổng giá trị 2 lệnh: ${totalOrderValueForPnlHunt.toFixed(2)} USDT.`, 'info');
					isTrackingPnl.value = true;
					startPnlTracking();
				}
				return;
			}

			addLog(`Đang kiểm tra ${unconfirmedOrders.length} lệnh chờ khớp...`, 'info');

			try {
				const exchangesToCheck = [...new Set(unconfirmedOrders.map(o => o.exchange))];
				const positionsToCheck = unconfirmedOrders.map(o => ({ exchange: o.exchange, side: o.side }));

				// Gọi API song song để kiểm tra lệnh mở và PNL
				const [openOrdersResponse, pnlResponse] = await Promise.all([
					axios.post('/api/order/open-orders', { symbol: symbol.value, exchanges: exchangesToCheck }),
					axios.post('/api/order/pnl', { symbol: symbol.value, positions: positionsToCheck })
				]);

				const openOrdersResults = openOrdersResponse.data.results.reduce((acc, r) => {
					if (r.success) acc[r.data.exchange] = r.data.orders;
					return acc;
				}, {});

				const pnlResults = pnlResponse.data.results.reduce((acc, r) => {
					if (r.success) acc[r.data.exchange] = r.data;
					return acc;
				}, {});

				let hasFailedOrder = false;

				// Cập nhật trạng thái cho từng lệnh đang chờ
				pendingOrders.value.forEach(order => {
					if (order.status === 'filled') return;

					const pnlInfo = pnlResults[order.exchange];
					const openOrders = openOrdersResults[order.exchange];

					// Điều kiện 1: Đã khớp (có vị thế)
					if (pnlInfo && pnlInfo.size !== 0) {
						if (order.status !== 'filled') {
							order.status = 'filled';
							addLog(`[${exchangeNameMap.value[order.exchange]}] Lệnh ${order.side} đã khớp.`, 'success');
						}
					}
					// Điều kiện 2: Vẫn đang chờ (lệnh vẫn còn trong danh sách mở)
					else if (openOrders && openOrders.length > 0) {
						// Trạng thái vẫn là 'pending', không làm gì
					}
					// Điều kiện 3: Thất bại (không có trong danh sách mở VÀ không có vị thế)
					else {
						order.status = 'failed';
						hasFailedOrder = true;
						addLog(`[${exchangeNameMap.value[order.exchange]}] Lệnh ${order.side} đã thất bại (không khớp và không có trong danh sách chờ).`, 'error');
					}
				});

				const filledCount = pendingOrders.value.filter(o => o.status === 'filled').length;

				if (hasFailedOrder) {
					clearInterval(orderFillInterval);
					addToast('Một hoặc nhiều lệnh không thể khớp. Hủy các lệnh đã khớp (nếu có).', 'error');
					const filledOrdersToCancel = pendingOrders.value.filter(o => o.status === 'filled');
					if (filledOrdersToCancel.length > 0) {
						await forceClosePositions(filledOrdersToCancel, false);
					}
					reset();
					return;
				}

				if (filledCount === pendingOrders.value.length) {
					addToast('Tất cả lệnh đã được khớp!', 'success');
					addLog('Tất cả lệnh đã được khớp! Bắt đầu theo dõi PNL.', 'success');

					clearInterval(orderFillInterval);
					isWaitingForFills.value = false;
					successfulPositions.value = [...pendingOrders.value];

					// KHỞI TẠO pnlData để UI hiển thị ngay lập tức với trạng thái "Đang tải..."
					pnlData.value = successfulPositions.value.map(pos => ({
						...pos,
						pnl: null,
						isLiquidated: false,
					}));

					pendingOrders.value = [];
					totalOrderValueForPnlHunt = longOrderValue.value + shortOrderValue.value;
					addLog(`Tổng giá trị 2 lệnh: ${totalOrderValueForPnlHunt.toFixed(2)} USDT.`, 'info');
					isTrackingPnl.value = true;
					startPnlTracking();
					return;
				}
			} catch (error) {
				addLog('Lỗi khi kiểm tra trạng thái khớp lệnh.', 'error');
				console.error('Lỗi checkFills:', error);
			}
		};
		checkFills(); // Kiểm tra ngay lập tức
		orderFillInterval = setInterval(checkFills, 5000); // Kiểm tra mỗi 5 giây
	};

	const handlePartialOrderFailure = async (failedOrderInfo, successfulOrderInfo) => {
		const MAX_RETRIES = 2;
		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			addToast(`Lệnh [${failedOrderInfo.exchange}] thất bại. Thử lại lần ${attempt}/${MAX_RETRIES}...`, 'warning');
			addLog(`Lệnh [${failedOrderInfo.exchange}] thất bại. Thử lại lần ${attempt}/${MAX_RETRIES} sau 1 giây...`, 'warning');
			await new Promise(resolve => setTimeout(resolve, 2000)); // Đợi 1 giây

			try {
				const retryPayload = {
					symbol: symbol.value,
					orders: [failedOrderInfo],
				};
				const { data } = await axios.post('/api/order/multi', retryPayload);
				const retryResult = data.results[0];

				if (retryResult.success) {
					const successMsg = `[${retryResult.exchange}] Đặt lại lệnh ${retryResult.side} thành công!`;
					addToast(successMsg, 'success');
					addLog(successMsg, 'success');

					pendingOrders.value = [
						{ ...successfulOrderInfo, status: 'pending' },
						{ exchange: retryResult.exchange, side: retryResult.side, orderId: retryResult.data.orderId, price: retryResult.data.price, quantity: retryResult.data.quantity, status: 'pending' }
					];
					isWaitingForFills.value = true;
					startOrderFillTracking();
					return; // Thoát khỏi hàm nếu thành công
				}
				// Nếu thất bại, vòng lặp sẽ tiếp tục cho lần thử tiếp theo
			} catch (retryErr) {
				console.error(`Lỗi khi thử đặt lại lệnh (lần ${attempt}):`, retryErr);
				// Nếu có lỗi mạng, vòng lặp cũng sẽ tiếp tục
			}
		}

		// Nếu tất cả các lần thử lại đều thất bại
		addToast(`Đặt lại lệnh thất bại. Hủy lệnh đã thành công...`, 'error');
		addLog(`[${failedOrderInfo.exchange}] Đặt lại lệnh thất bại sau ${MAX_RETRIES} lần. Hủy lệnh đã thành công...`, 'error');
		if (successfulOrderInfo) {
			await forceClosePositions([successfulOrderInfo], false);
			addLog(`Đã hủy lệnh trên sàn [${exchangeNameMap.value[successfulOrderInfo.exchange] || successfulOrderInfo.exchange}].`, 'info');
		}
		reset();
	}

	const placeOrders = async () => {
		if (!symbol.value || !longOrder.value || !shortOrder.value) {
			addToast('Vui lòng nhập đủ thông tin cho cả hai lệnh!', 'warning')
			addLog('Vui lòng nhập đủ thông tin cho cả hai lệnh!', 'warning')
			return
		}

		addLog('Tạm dừng theo dõi giá trị ước tính để đặt lệnh.', 'info');
		longPoller.stopPolling();
		shortPoller.stopPolling();

		try {
			const payload = {
				symbol: symbol.value,
				orders: [
					{ ...longOrder.value, side: 'BUY' },
					{ ...shortOrder.value, side: 'SELL' },
				],
			}

			isLoading.value = true
			const { data } = await axios.post('/api/order/multi', payload)
			const results = data.results || []

			const successfullyPlaced = results.filter(r => r.success).map(r => ({ exchange: r.exchange, side: r.side, orderId: r.data.orderId, price: r.data.price, quantity: r.data.quantity }));
			const failedOrders = payload.orders.filter(o => !successfullyPlaced.some(s => s.exchange === o.exchange));

			successfullyPlaced.forEach(r => {
				const successMsg = `[${r.exchange}] Lệnh Limit ${r.side} đã được đặt thành công!`;
				addToast(successMsg, 'success');
				addLog(successMsg, 'success');
			});
			failedOrders.forEach(o => {
				const errorResult = results.find(r => r.exchange === o.exchange);
				const errorMsg = errorResult ? errorResult.error : 'Unknown error';
				addToast(`[${o.exchange}] Lệnh ${o.side} thất bại: ${errorMsg}`, 'error');
				addLog(`[${o.exchange}] Lệnh ${o.side} thất bại: ${errorMsg}`, 'error');
			});

			if (successfullyPlaced.length === 2) {
				pendingOrders.value = successfullyPlaced.map(o => ({ ...o, status: 'pending' }));
				isWaitingForFills.value = true;
				startOrderFillTracking();
			} else if (successfullyPlaced.length === 1) {
				await handlePartialOrderFailure(failedOrders[0], successfullyPlaced[0]);
			} else {
				reset();
			}

		} catch (err) {
			console.error('❌ Lỗi đặt lệnh:', err)
			reset();
			addToast(err.response?.data?.message || 'Đặt lệnh thất bại!', 'error')
			addLog(err.response?.data?.message || 'Đặt lệnh thất bại!', 'error')
		} finally {
			isLoading.value = false
		}
	}

	const swapOrders = () => {
		if (isTrackingPnl.value || isWaitingForFills.value) return;

		// Hoán đổi giá trị của hai order
		const temp = longOrder.value;
		longOrder.value = shortOrder.value;
		shortOrder.value = temp;

		addToast('Đã đảo ngược thông tin lệnh Long và Short.', 'info');
		addLog('Đã đảo ngược thông tin lệnh Long và Short.', 'info');
	}

	const closeHedgedPositions = async () => {
		// Dừng polling để tránh gọi API nhiều lần trong khi đang đóng lệnh
		if (pnlInterval) clearInterval(pnlInterval);

		isLoading.value = true
		try {
			const { data } = await axios.post('/api/order/close-hedged', {
				symbol: symbol.value,
				positions: successfulPositions.value,
			})

			// Tạo thông báo tổng kết PNL
			const pnlSummary = successfulPositions.value.map((pos, index) => {
				const pnlValue = data.closedPnl[index];
				return `[${exchangeNameMap.value[pos.exchange] || pos.exchange}]: ${pnlValue.toFixed(4)} USDT`;
			}).join(' | ');
			const finalMessage = `Đóng lệnh thành công! Tổng lời: ${data.totalPnl.toFixed(4)} USDT. Chi tiết: ${pnlSummary}`;

			addToast(finalMessage, 'success');
			addLog(finalMessage, 'success');
			localStorage.removeItem(STORAGE_KEY); // Xóa state khi đã đóng lệnh thành công
			// Không gọi reset() ngay để người dùng thấy log cuối cùng
			isPnlHunting.value = false; // Đảm bảo tắt chế độ săn
			reset(false); // Chỉ reset state, không xóa log
		} catch (err) {
			console.error('Lỗi đóng lệnh:', err)
			addToast(err.response?.data?.message || 'Không thể đóng lệnh.', 'error')
			addLog(err.response?.data?.message || 'Không thể đóng lệnh.', 'error')
		} finally {
			isLoading.value = false
		}
	}

	const togglePnlHunting = () => {
		isPnlHunting.value = !isPnlHunting.value;
		const status = isPnlHunting.value ? 'Bật' : 'Tắt';
		const type = isPnlHunting.value ? 'success' : 'info';
		addToast(`Chế độ "Săn PNL" đã được ${status}.`, type);
		addLog(`Chế độ "Săn PNL" đã được ${status}.`, type);
		if (isPnlHunting.value && totalOrderValueForPnlHunt > 0) {
			const pnlHuntThreshold = totalOrderValueForPnlHunt * 0.0025;
			addToast(`Mục tiêu PNL: >= ${pnlHuntThreshold.toFixed(4)} USDT (0.25% của ${totalOrderValueForPnlHunt.toFixed(2)} USDT).`, 'info');
			addLog(`Mục tiêu PNL: >= ${pnlHuntThreshold.toFixed(4)} USDT (0.25% của ${totalOrderValueForPnlHunt.toFixed(2)} USDT).`, 'info');
		}
	}

	const toggleOrderHunting = () => {
		isOrderHunting.value = !isOrderHunting.value;
		const status = isOrderHunting.value ? 'Bật' : 'Tắt';
		const type = isOrderHunting.value ? 'success' : 'info';
		addToast(`Chế độ "Săn Lệnh" đã được ${status}.`, type);
		addLog(`Chế độ "Săn Lệnh" đã được ${status}.`, type);

		if (isOrderHunting.value) {
			addLog(`Đang theo dõi tỷ lệ L/S. Sẽ tự động đặt lệnh khi L/S < 0.995.`, 'info');
		}
	}

	// --- Price Polling Logic ---
	const createPricePoller = (orderRef, valueRef) => {
		let pollingInterval = null;
		let isFetching = false;

		const fetchPrice = async () => {
			if (isFetching) return;

			if (isWaitingForFills.value || isTrackingPnl.value) {
				stopPolling();
				return;
			}

			const newOrder = orderRef.value;
			const newSymbol = symbol.value;

			if (!newOrder || !newOrder.exchange || !(newOrder.amount > 0) || !newSymbol) {
				valueRef.value = 0;
				return;
			}

			isFetching = true;
			try {
				const { data } = await axios.get('/api/exchange/price', {
					params: {
						exchange: newOrder.exchange,
						symbol: newSymbol,
					}
				});
				const calculatedValue = data.price ? data.price * newOrder.amount : 0;
				valueRef.value = Number(calculatedValue.toFixed(4));
			} catch (error) {
				console.error(`[Price Poller] Lỗi lấy giá cho ${newSymbol} trên ${newOrder.exchange}:`, error.response?.data?.error || error.message);
				valueRef.value = 0;
				stopPolling();
			} finally {
				isFetching = false;
			}
		};

		const startPolling = () => {
			stopPolling();
			fetchPrice();
			pollingInterval = setInterval(fetchPrice, 1000);
		};

		const stopPolling = () => {
			if (pollingInterval) {
				clearInterval(pollingInterval);
				pollingInterval = null;
			}
		};

		let debounceTimeout = null;

		watch([symbol, orderRef], ([newSymbol, newOrder]) => {
			if (debounceTimeout) clearTimeout(debounceTimeout);
			debounceTimeout = setTimeout(() => {
				if (newOrder && newOrder.exchange && newOrder.amount > 0 && newSymbol) {
					startPolling();
				} else {
					stopPolling();
					valueRef.value = 0;
				}
			}, 1000);
		}, { deep: true });

		return { startPolling, stopPolling };
	};

	// --- State Persistence ---
	const saveState = () => {
		const state = {
			symbol: symbol.value,
			longOrder: longOrder.value,
			shortOrder: shortOrder.value,
			isTrackingPnl: isTrackingPnl.value,
			isWaitingForFills: isWaitingForFills.value,
			pendingOrders: pendingOrders.value,
			successfulPositions: successfulPositions.value,
			logs: logs.value,
			isPnlHunting: isPnlHunting.value,
			isOrderHunting: isOrderHunting.value,
			totalOrderValueForPnlHunt: totalOrderValueForPnlHunt,
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	};

	const loadState = () => {
		const savedState = localStorage.getItem(STORAGE_KEY);
		if (savedState) {
			try {
				const state = JSON.parse(savedState);
				symbol.value = state.symbol || 'BTCUSDT';
				longOrder.value = state.longOrder || null;
				shortOrder.value = state.shortOrder || null;
				logs.value = state.logs || [];
				totalOrderValueForPnlHunt = state.totalOrderValueForPnlHunt || 0;

				isWaitingForFills.value = state.isWaitingForFills || false;
				pendingOrders.value = state.pendingOrders || [];
				isTrackingPnl.value = state.isTrackingPnl || false;
				successfulPositions.value = state.successfulPositions || [];
				isPnlHunting.value = state.isPnlHunting || false;
				isOrderHunting.value = state.isOrderHunting || false;

				if (isWaitingForFills.value && pendingOrders.value.length > 0) {
					addLog('Đã khôi phục trạng thái chờ khớp lệnh.', 'info');
					startOrderFillTracking();
				}

				if (isTrackingPnl.value && successfulPositions.value.length > 0) {
					addLog('Đã khôi phục phiên giao dịch trước đó.', 'info');
					pnlData.value = successfulPositions.value.map(pos => ({
						...pos,
						pnl: null,
						isLiquidated: false,
					}));

					if (isPnlHunting.value) {
						addLog('Chế độ săn PNL đang hoạt động từ phiên trước.', 'info');
						const pnlHuntThreshold = totalOrderValueForPnlHunt * 0.0025;
						addLog(`Mục tiêu PNL đã khôi phục: >= ${pnlHuntThreshold.toFixed(4)} USDT.`, 'info');
					}

					if (isOrderHunting.value) {
						addLog('Chế độ "Săn Lệnh" đang hoạt động từ phiên trước.', 'info');
					}

					startPnlTracking();
				}
			} catch (e) {
				console.error("Lỗi khi parse state từ localStorage:", e);
				localStorage.removeItem(STORAGE_KEY);
			}
		}
	};

	// --- Watchers ---
	watch(orderRatio, (newRatio) => {
		if (isOrderHunting.value && newRatio !== 'N/A' && newRatio <= 0.995) {
			addToast(`Tỷ lệ L/S đạt ${newRatio.toFixed(5)} (< 0.995). Tự động đặt lệnh!`, 'success');
			addLog(`Tỷ lệ L/S đạt ${newRatio.toFixed(5)} (< 0.995). Tự động đặt lệnh!`, 'success');
			isOrderHunting.value = false;
			placeOrders();
		}
	});

	watch([symbol, longOrder, shortOrder, isTrackingPnl, isWaitingForFills, pendingOrders, successfulPositions, logs, isPnlHunting, isOrderHunting], saveState, { deep: true });

	// --- Lifecycle Hooks ---
	onMounted(async () => {
		try {
			const { data } = await axios.get('/api/exchange')
			exchanges.value = data
		} catch (err) {
			console.error('❌ Lỗi tải danh sách sàn:', err)
			addToast('Không thể tải danh sách sàn giao dịch.', 'error')
			addLog('Không thể tải danh sách sàn giao dịch.', 'error')
		}
		longPoller = createPricePoller(longOrder, longOrderValue);
		shortPoller = createPricePoller(shortOrder, shortOrderValue);
		loadState();
	})

	onUnmounted(() => {
		if (pnlInterval) clearInterval(pnlInterval);
		if (orderFillInterval) clearInterval(orderFillInterval);
		longPoller?.stopPolling();
		shortPoller?.stopPolling();
	});

	// --- Return values to be used in component ---
	return {
		symbol,
		longOrder,
		shortOrder,
		exchanges,
		isLoading,
		logs,
		toasts,
		isOrderHunting,
		isTrackingPnl,
		isWaitingForFills,
		pnlData,
		pendingOrders,
		isPnlHunting,
		longOrderValue,
		shortOrderValue,
		exchangeNameMap,
		totalPnl,
		orderRatio,
		entryPriceRatio,
		longOrderPrice,
		shortOrderPrice,
		placeOrders,
		swapOrders,
		toggleOrderHunting,
		togglePnlHunting,
		forceClosePositions,
		getPendingStatusText,
		getPendingStatusClass,
		getPnlClass,
		formatPnl,
	};
}