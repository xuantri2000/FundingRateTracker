<template>
	<div class="p-6">
		<ToastContainer :toasts="toasts" />
		<div class="max-w-7xl mx-auto space-y-6">

			<!-- Bố cục chính: Cột đặt lệnh và Cột Log -->
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<!-- Cột trái: Đặt lệnh -->
				<div class="lg:col-span-2 space-y-6">
					<!-- Header -->
					<div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-lg p-6 border border-slate-700">
						<h1 class="text-3xl font-bold text-white mb-2">Trader Dashboard</h1>
						<p class="text-slate-400">Đặt lệnh Long / Short đồng thời</p>
					</div>
					<!-- Symbol chung -->
					<div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
						<label class="block text-slate-400 text-sm mb-2">Cặp giao dịch</label>
						<input v-model="symbol" placeholder="BTCUSDT"
							class="w-full bg-slate-700 text-white rounded-lg p-2 border border-slate-600 placeholder-slate-500"
							:disabled="isTrackingPnl" />
					</div>

					<!-- Dual Panel -->
					<div class="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
						<!-- Long Panel -->
						<div class="bg-slate-800 rounded-xl p-5 shadow-md border border-slate-700">
							<h2 class="text-xl text-green-400 font-semibold mb-4">Lệnh Long (BUY)</h2>
							<TradingPanel v-model="longOrder" side="LONG" :exchanges="exchanges"
								:disabled="isTrackingPnl" :estimated-value="longOrderValue" :current-price="longOrderPrice" />
						</div>

						<!-- Nút hoán đổi -->
						<div class="flex justify-center md:flex-col gap-2 items-center">
							<button @click="swapOrders" :disabled="isTrackingPnl"
								class="p-3 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
								title="Đảo ngược lệnh Long và Short">
								<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
									stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
									<path stroke-linecap="round" stroke-linejoin="round"
										d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
								</svg>
							</button>
							<div v-if="orderRatio !== 'N/A'" class="text-center">
								<p class="text-xs text-slate-400">Tỷ lệ L/S</p>
								<p class="text-sm font-mono font-bold text-yellow-300">{{ orderRatio }}</p>
							</div>
							<div v-if="entryPriceRatio !== 'N/A'" class="text-center">
								<p class="text-xs text-slate-400">Entry L/S</p>
								<p class="text-sm font-mono font-bold text-yellow-300">{{ entryPriceRatio }}</p>
							</div>
						</div>

						<!-- Short Panel -->
						<div class="bg-slate-800 rounded-xl p-5 shadow-md border border-slate-700">
							<h2 class="text-xl text-red-400 font-semibold mb-4">Lệnh Short (SELL)</h2>
							<TradingPanel v-model="shortOrder" side="SHORT" :exchanges="exchanges"
								:disabled="isTrackingPnl" :estimated-value="shortOrderValue" :current-price="shortOrderPrice" />
						</div>
					</div>

					<!-- Submit -->
					<div class="grid grid-cols-2 gap-3 sm:flex sm:justify-center sm:gap-4">
						<!-- Nút Săn Lệnh Mới -->
						<button @click="toggleOrderHunting" :disabled="isLoading || isTrackingPnl"
							class="px-3 py-2 sm:px-6 sm:py-3 text-sm sm:text-base rounded-lg sm:rounded-xl shadow-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
							:class="isOrderHunting ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-500/30' : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/30'">
							<span v-if="isOrderHunting" class="hidden sm:inline">🎯 Đang săn lệnh (Dừng)</span>
							<span v-else-if="isOrderHunting" class="sm:hidden">🎯 Dừng săn</span>
							<span v-else>🔫 Săn lệnh</span>
						</button>

						<button @click="placeOrders" :disabled="isLoading || isTrackingPnl || isOrderHunting"
							class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 sm:px-6 sm:py-3 text-sm sm:text-base rounded-lg sm:rounded-xl shadow-lg shadow-blue-500/30 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
							<span v-if="isLoading">Đang xử lý...</span>
							<template v-else>
								<span class="hidden sm:inline">🚀 Đặt lệnh đồng thời</span>
								<span class="sm:hidden">🚀 Đặt lệnh</span>
							</template>
						</button>

					</div>
				</div>

				<!-- Cột phải: Nhật ký hoạt động -->
				<div class="lg:col-span-1">
					<LogTable :logs="logs" @clear-logs="logs = []" />
				</div>
			</div>

			<!-- Giao diện theo dõi PNL (chỉ hiển thị khi isTrackingPnl là true) -->
			<div v-if="isTrackingPnl" class="space-y-6">
				<div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-lg p-6 border border-slate-700">
					<h2 class="text-2xl font-bold text-white mb-4">
						Theo dõi PNL cho <span class="text-yellow-400">{{ symbol }}</span>
					</h2>
					<div class="overflow-x-auto">
						<table class="w-full text-left">
							<thead>
								<tr class="border-b border-slate-600">
									<th class="p-3 text-slate-400">Sàn</th>
									<th class="p-3 text-slate-400">Lệnh</th>
									<th class="p-3 text-slate-400 text-right">PNL (USDT)</th>
									<th class="p-3 text-slate-400 text-center">Trạng thái</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="pos in pnlData" :key="pos.exchange" class="border-b border-slate-700">
									<td class="p-3 font-medium text-white">{{ exchangeNameMap[pos.exchange] ||
										pos.exchange }}</td>
									<td class="p-3">
										<span :class="pos.side === 'BUY' ? 'text-green-400' : 'text-red-400'">
											{{ pos.side }}
										</span>
									</td>
									<td class="p-3 text-right font-mono" :class="getPnlClass(pos.pnl)">
										{{ formatPnl(pos.pnl) }}
									</td>
									<td class="p-3 text-center">
										<span v-if="pos.isLiquidated" class="text-orange-400 font-bold"
											title="Vị thế đã bị đóng/thanh lý">
											🔥 Đã đóng
										</span>
									</td>
								</tr>
							</tbody>
							<tfoot>
								<tr class="font-bold">
									<td colspan="2" class="p-3 text-white">Tổng PNL</td>
									<td class="p-3 text-right font-mono" :class="getPnlClass(totalPnl)">
										{{ formatPnl(totalPnl) }}
									</td>
								</tr>
							</tfoot>
						</table>
					</div>
				</div>

				<div class="flex justify-center gap-4">
					<!-- Nút Săn PNL -->
					<button @click="togglePnlHunting" :disabled="isLoading"
						class="px-6 py-3 rounded-xl shadow-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
						:class="isPnlHunting ? 'bg-yellow-600 hover:bg-yellow-700 text-white shadow-yellow-500/30' : 'bg-green-600 hover:bg-green-700 text-white shadow-green-500/30'">
						<span v-if="isLoading && isPnlHunting">Đang dừng...</span>
						<span v-else-if="isPnlHunting">🎯 Đang săn PNL (Dừng)</span>
						<span v-else>🔫 Săn PNL</span>
					</button>

					<!-- Nút Buộc hủy lệnh -->
					<button @click="() => forceClosePositions()" :disabled="isLoading"
						class="bg-red-800 hover:bg-red-900 text-white px-6 py-3 rounded-xl shadow-lg shadow-red-500/30 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
						<span v-if="isLoading">Đang xử lý...</span>
						<span v-else>🚨 Buộc hủy lệnh</span>
					</button>

					<!-- Nút Quay lại -->
					<!-- <button @click="reset" :disabled="isLoading"
						class="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-xl font-semibold transition-all">
						Quay lại
					</button> -->
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import axios from 'axios'
import TradingPanel from '@/components/TradingPanel.vue'
import LogTable from '@/components/LogTable.vue'
import ToastContainer from '@/components/ToastContainer.vue'

const symbol = ref('BTCUSDT')
const longOrder = ref(null)
const shortOrder = ref(null)
const exchanges = ref([])
const isLoading = ref(false)
const logs = ref([])

const toasts = ref([])
const isOrderHunting = ref(false); // BIẾN MỚI: Trạng thái săn lệnh

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

// --- PNL Tracking State ---
const isTrackingPnl = ref(false)
const pnlData = ref([])
const successfulPositions = ref([])
const isPnlHunting = ref(false); // BIẾN MỚI: Trạng thái săn PNL
let lastPnlDataBeforeUpdate = []; // BIẾN MỚI: Lưu trữ PNL của lần fetch trước
let totalOrderValueForPnlHunt = 0; // BIẾN MỚI: Lưu tổng giá trị lệnh để tính ngưỡng PNL
let pnlInterval = null;

// --- State mới cho giá trị USDT dự kiến ---
const longOrderValue = ref(0);
const shortOrderValue = ref(0);

const STORAGE_KEY = 'traderState';

onMounted(async () => {
	try {
		const { data } = await axios.get('/api/exchange')
		exchanges.value = data
	} catch (err) {
		console.error('❌ Lỗi tải danh sách sàn:', err)
		addToast('Không thể tải danh sách sàn giao dịch.', 'error')
		addLog('Không thể tải danh sách sàn giao dịch.', 'error')
	}
	loadState(); // Tải lại trạng thái khi component được mount
})

const exchangeNameMap = computed(() => {
	const map = {};
	exchanges.value.forEach(ex => { map[ex.key] = ex.name; });
	return map;
});

const totalPnl = computed(() => {
	return pnlData.value.reduce((sum, pos) => sum + (pos.pnl || 0), 0)
})

const formatPnl = (pnl) => {
	if (pnl === null || pnl === undefined) return 'Đang tải...'
	return pnl.toFixed(4)
}

const getPnlClass = (pnl) => {
	if (pnl === null || pnl === undefined) return 'text-slate-400'
	return pnl > 0 ? 'text-green-400' : pnl < 0 ? 'text-red-400' : 'text-slate-400'
}

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

async function placeOrders() {
	if (!symbol.value || !longOrder.value || !shortOrder.value) {
		addToast('Vui lòng nhập đủ thông tin cho cả hai lệnh!', 'warning')
		addLog('Vui lòng nhập đủ thông tin cho cả hai lệnh!', 'warning')
		return
	}

	// Dừng polling giá khi bắt đầu quá trình đặt lệnh
	addLog('Tạm dừng theo dõi giá trị ước tính để đặt lệnh.', 'info');
	longPoller.stopPolling();
	shortPoller.stopPolling();

	isLoading.value = true
	try {
		const payload = {
			symbol: symbol.value,
			orders: [
				{ ...longOrder.value, side: 'BUY' },
				{ ...shortOrder.value, side: 'SELL' },
			],
		}

		const { data } = await axios.post('/api/order/multi', payload)
		const results = data.results || []

		// Khởi tạo pnlData với các vị thế thành công
		pnlData.value = results
			.filter(r => r.success)
			.map(r => ({ exchange: r.exchange, side: r.side, pnl: 0, isLiquidated: false }));


		// Dọn dẹp mảng vị thế thành công trước khi xử lý kết quả mới
		successfulPositions.value = [];

		let successCount = 0;
		results.forEach(r => {
			if (r.success) {
				successCount++;
				const successMsg = `[${r.exchange}] Lệnh ${r.side} đã được đặt thành công!`;
				addToast(successMsg, 'success');
				addLog(successMsg, 'success')
				// Lưu lại thông tin cần thiết để đóng lệnh và lấy PNL
				successfulPositions.value.push({
					exchange: r.exchange,
					side: r.side,
					quantity: r.data.quantity,
				})
			} else {
				addToast(`[${r.exchange}] Lệnh ${r.side} thất bại: ${r.error}`, 'error')
				addLog(`[${r.exchange}] Lệnh ${r.side} thất bại: ${r.error}`, 'error')
			}
		})

		if (successCount === 2) {
			// Lưu lại tổng giá trị lệnh tại thời điểm đặt lệnh thành công
			totalOrderValueForPnlHunt = longOrderValue.value + shortOrderValue.value;
			addLog(`Tổng giá trị 2 lệnh: ${totalOrderValueForPnlHunt.toFixed(2)} USDT.`, 'info');

			isTrackingPnl.value = true
			startPnlTracking()
		} else if (successCount === 1) {
			const failedOrderInfo = payload.orders.find(o => !results.some(r => r.success && r.exchange === o.exchange));
			await handlePartialOrderFailure(failedOrderInfo);
		} else {
			// Nếu không thành công cả 2, reset lại
			successfulPositions.value = [];
			reset(); // Khởi động lại polling nếu cả 2 lệnh thất bại
		}

	} catch (err) {
		console.error('❌ Lỗi đặt lệnh:', err)
		// Nếu có lỗi, reset để khởi động lại polling
		reset();
		addToast(err.response?.data?.message || 'Đặt lệnh thất bại!', 'error')
		addLog(err.response?.data?.message || 'Đặt lệnh thất bại!', 'error')
	} finally {
		isLoading.value = false
	}
}

async function handlePartialOrderFailure(failedOrderInfo) {
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
				successfulPositions.value.push({
					exchange: retryResult.exchange,
					side: retryResult.side,
					quantity: retryResult.data.quantity,
				});
				// Lưu lại tổng giá trị lệnh tại thời điểm đặt lệnh thành công
				totalOrderValueForPnlHunt = longOrderValue.value + shortOrderValue.value;
				addLog(`Tổng giá trị 2 lệnh: ${totalOrderValueForPnlHunt.toFixed(2)} USDT.`, 'info');

				isTrackingPnl.value = true;
				startPnlTracking(); // Bắt đầu polling nhanh
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
	const successfulOrder = successfulPositions.value[0];
	if (successfulOrder) {
		await forceClosePositions([successfulOrder], false);
		addLog(`Đã hủy lệnh trên sàn [${exchangeNameMap.value[successfulOrder.exchange] || successfulOrder.exchange}].`, 'info');
	}
	reset();
}

function swapOrders() {
	if (isTrackingPnl.value) return;

	// Hoán đổi giá trị của hai order
	const temp = longOrder.value;
	longOrder.value = shortOrder.value;
	shortOrder.value = temp;

	addToast('Đã đảo ngược thông tin lệnh Long và Short.', 'info');
	addLog('Đã đảo ngược thông tin lệnh Long và Short.', 'info');
}

async function closeHedgedPositions() {
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

async function forceClosePositions(positionsToClose = null, shouldReset = true) {
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

function reset(shouldRestartPolling = true) {
	isTrackingPnl.value = false
	if (pnlInterval) clearInterval(pnlInterval)
	pnlData.value = []
	successfulPositions.value = []
	isPnlHunting.value = false; // Reset chế độ săn PNL
	localStorage.removeItem(STORAGE_KEY); // Xóa state khi reset

	if (shouldRestartPolling) {
		addLog('Khởi động lại theo dõi giá trị ước tính.', 'info');
		longPoller.startPolling();
		shortPoller.startPolling();
	}
}

function togglePnlHunting() {
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

function toggleOrderHunting() {
	isOrderHunting.value = !isOrderHunting.value;
	const status = isOrderHunting.value ? 'Bật' : 'Tắt';
	const type = isOrderHunting.value ? 'success' : 'info';
	addToast(`Chế độ "Săn Lệnh" đã được ${status}.`, type);
	addLog(`Chế độ "Săn Lệnh" đã được ${status}.`, type);

	if (isOrderHunting.value) {
		addLog(`Đang theo dõi tỷ lệ L/S. Sẽ tự động đặt lệnh khi L/S < 0.995.`, 'info');
	}
}

// Watcher cho chế độ "Săn Lệnh"
watch(orderRatio, (newRatio) => {
	if (isOrderHunting.value && newRatio !== 'N/A' && newRatio <= 0.995) {
		addToast(`Tỷ lệ L/S đạt ${newRatio.toFixed(5)} (< 0.995). Tự động đặt lệnh!`, 'success');
		addLog(`Tỷ lệ L/S đạt ${newRatio.toFixed(5)} (< 0.995). Tự động đặt lệnh!`, 'success');
		isOrderHunting.value = false; // Tắt chế độ săn sau khi kích hoạt
		placeOrders();
	}
});


// --- LOGIC MỚI: THEO DÕI GIÁ TRỊ USDT DỰ KIẾN ---

const createPricePoller = (orderRef, valueRef) => {
	let pollingInterval = null;
	let isFetching = false;

	const fetchPrice = async () => {
		if (isFetching) return;

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
			stopPolling(); // Dừng lại nếu có lỗi để tránh spam
		} finally {
			isFetching = false;
		}
	};

	const startPolling = () => {
		stopPolling(); // Dừng polling cũ nếu có
		fetchPrice(); // Fetch ngay lập tức
		pollingInterval = setInterval(fetchPrice, 1000); // Bắt đầu polling mỗi giây
	};

	const stopPolling = () => {
		if (pollingInterval) {
			clearInterval(pollingInterval);
			pollingInterval = null;
		}
	};

	let debounceTimeout = null;

	// Theo dõi sự thay đổi của symbol và order
	watch([symbol, orderRef], ([newSymbol, newOrder]) => {
		// Xóa timeout cũ để debounce
		if (debounceTimeout) clearTimeout(debounceTimeout);

		// Đặt timeout mới. Logic sẽ chỉ chạy sau 1s kể từ lần thay đổi cuối cùng.
		debounceTimeout = setTimeout(() => {
			// Kiểm tra xem có đủ thông tin để bắt đầu polling không
			if (newOrder && newOrder.exchange && newOrder.amount > 0 && newSymbol) {
				startPolling();
			} else {
				stopPolling();
				valueRef.value = 0;
			}
		}, 1000); // Chờ 1 giây
	}, { deep: true });

	return { startPolling, stopPolling };
};

// Sử dụng hàm mới
const longPoller = createPricePoller(longOrder, longOrderValue);
const shortPoller = createPricePoller(shortOrder, shortOrderValue);

// Cập nhật onUnmounted để dừng polling
onUnmounted(() => {
	if (pnlInterval) clearInterval(pnlInterval);
	longPoller.stopPolling();
	shortPoller.stopPolling();
});

// --- LOGIC MỚI: LƯU VÀ TẢI TRẠNG THÁI TỪ LOCALSTORAGE ---

const saveState = () => {
	const state = {
		symbol: symbol.value,
		longOrder: longOrder.value,
		shortOrder: shortOrder.value,
		isTrackingPnl: isTrackingPnl.value,
		successfulPositions: successfulPositions.value,
		logs: logs.value,
		isPnlHunting: isPnlHunting.value, // Lưu trạng thái săn PNL
		isOrderHunting: isOrderHunting.value, // Lưu trạng thái săn lệnh
		totalOrderValueForPnlHunt: totalOrderValueForPnlHunt, // Lưu tổng giá trị lệnh
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
			isTrackingPnl.value = state.isTrackingPnl || false;
			successfulPositions.value = state.successfulPositions || [];
			logs.value = state.logs || [];
			isPnlHunting.value = state.isPnlHunting || false; // Khôi phục trạng thái săn PNL
			isOrderHunting.value = state.isOrderHunting || false; // Khôi phục trạng thái săn lệnh
			totalOrderValueForPnlHunt = state.totalOrderValueForPnlHunt || 0; // Khôi phục tổng giá trị lệnh

			if (isTrackingPnl.value && successfulPositions.value.length > 0) {
				addLog('Đã khôi phục phiên giao dịch trước đó.', 'info');

				// KHỞI TẠO pnlData để UI hiển thị ngay lập tức
				pnlData.value = successfulPositions.value.map(pos => ({
					...pos,
					pnl: null, // PNL ban đầu là null (hiển thị 'Đang tải...')
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

				startPnlTracking(); // Bắt đầu theo dõi lại PNL
			}
		} catch (e) {
			console.error("Lỗi khi parse state từ localStorage:", e);
			localStorage.removeItem(STORAGE_KEY); // Xóa state bị lỗi
		}
	}
};

// Theo dõi các thay đổi và lưu vào localStorage
watch([symbol, longOrder, shortOrder, isTrackingPnl, successfulPositions, logs, isPnlHunting, isOrderHunting], saveState, { deep: true });

</script>
