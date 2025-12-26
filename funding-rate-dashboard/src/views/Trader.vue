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
							:disabled="isTrackingPnl || isWaitingForFills" />
					</div>

					<!-- Dual Panel -->
					<div class="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
						<!-- Long Panel -->
						<div class="bg-slate-800 rounded-xl p-5 shadow-md border border-slate-700">
							<h2 class="text-xl text-green-400 font-semibold mb-4">Lệnh Long (BUY)</h2>
							<TradingPanel v-model="longOrder" side="LONG" :exchanges="exchanges"
								:disabled="isTrackingPnl || isWaitingForFills" :estimated-value="longOrderValue" :current-price="longOrderPrice" />
						</div>

						<!-- Nút hoán đổi -->
						<div class="flex justify-center md:flex-col gap-2 items-center">
							<button @click="swapOrders" :disabled="isTrackingPnl || isWaitingForFills"
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
								:disabled="isTrackingPnl || isWaitingForFills" :estimated-value="shortOrderValue" :current-price="shortOrderPrice" />
						</div>
					</div>

					<!-- Submit -->
					<div class="grid grid-cols-2 gap-3 sm:flex sm:justify-center sm:gap-4">
						<!-- Nút Săn Lệnh Mới -->
						<button @click="toggleOrderHunting" :disabled="isLoading || isTrackingPnl || isWaitingForFills"
							class="px-3 py-2 sm:px-6 sm:py-3 text-sm sm:text-base rounded-lg sm:rounded-xl shadow-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
							:class="isOrderHunting ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-500/30' : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/30'">
							<span v-if="isOrderHunting" class="hidden sm:inline">🎯 Đang săn lệnh (Dừng)</span>
							<span v-else-if="isOrderHunting" class="sm:hidden">🎯 Dừng săn</span>
							<span v-else>🔫 Săn lệnh</span>
						</button>

						<button @click="placeOrders" :disabled="isLoading || isTrackingPnl || isOrderHunting || isWaitingForFills"
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

			<!-- Giao diện chờ khớp lệnh (chỉ hiển thị khi isWaitingForFills là true) -->
			<WaitingForFillsPanel 
				v-if="isWaitingForFills"
				:symbol="symbol"
				:pending-orders="pendingOrders"
				:is-loading="isLoading"
				:exchange-name-map="exchangeNameMap"
				:get-pending-status-text="getPendingStatusText"
				:get-pending-status-class="getPendingStatusClass"
				@force-close="forceClosePositions"
			/>

			<!-- Giao diện theo dõi PNL (chỉ hiển thị khi isTrackingPnl là true) -->
			<PnlTrackingPanel 
				v-if="isTrackingPnl"
				:symbol="symbol"
				:pnl-data="pnlData"
				:total-pnl="totalPnl"
				:is-loading="isLoading"
				:is-pnl-hunting="isPnlHunting"
				:exchange-name-map="exchangeNameMap"
				:get-pnl-class="getPnlClass"
				:format-pnl="formatPnl"
				@toggle-pnl-hunting="togglePnlHunting"
				@force-close="() => forceClosePositions(null, true)"
			/>
		</div>
	</div>
</template>

<script setup>
import TradingPanel from '@/components/TradingPanel.vue'
import LogTable from '@/components/LogTable.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import WaitingForFillsPanel from '@/components/WaitingForFillsPanel.vue';
import PnlTrackingPanel from '@/components/PnlTrackingPanel.vue';
import { useTrader } from '@/composables/useTrader';

const {
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
} = useTrader();

</script>
