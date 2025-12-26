<template>
    <div class="space-y-6">
        <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-lg p-6 border border-slate-700">
            <h2 class="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <svg class="w-6 h-6 animate-spin text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang chờ khớp lệnh cho <span class="text-yellow-400">{{ symbol }}</span>
            </h2>
            <p class="text-slate-400 mb-4">Hệ thống đang kiểm tra trạng thái các lệnh Limit đã đặt. Giao diện sẽ tự động chuyển sang theo dõi PNL khi cả hai lệnh được khớp.</p>
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead>
                        <tr class="border-b border-slate-600">
                            <th class="p-3 text-slate-400">Sàn</th>
                            <th class="p-3 text-slate-400">Lệnh</th>
                            <th class="p-3 text-slate-400 text-right">Giá đặt</th>
                            <th class="p-3 text-slate-400 text-right">Số lượng</th>
                            <th class="p-3 text-slate-400 text-center">Trạng thái</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="order in pendingOrders" :key="order.exchange" class="border-b border-slate-700">
                            <td class="p-3 font-medium text-white">{{ exchangeNameMap[order.exchange] || order.exchange }}</td>
                            <td class="p-3"><span :class="order.side === 'BUY' ? 'text-green-400' : 'text-red-400'">{{ order.side }}</span></td>
                            <td class="p-3 text-right font-mono text-slate-300">{{ order.price }}</td>
                            <td class="p-3 text-right font-mono text-slate-300">{{ order.quantity }}</td>
                            <td class="p-3 text-center font-semibold" :class="getPendingStatusClass(order.status)">
                                {{ getPendingStatusText(order.status) }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="flex justify-center gap-4 mt-6">
                <button @click="$emit('force-close', pendingOrders)" :disabled="isLoading" class="bg-red-800 hover:bg-red-900 text-white px-6 py-3 rounded-xl shadow-lg shadow-red-500/30 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"><span v-if="isLoading">Đang xử lý...</span><span v-else>🚨 Hủy tất cả lệnh chờ</span></button>
            </div>
        </div>
    </div>
</template>

<script setup>
defineProps({
    symbol: String,
    pendingOrders: Array,
    isLoading: Boolean,
    exchangeNameMap: Object,
    getPendingStatusText: Function,
    getPendingStatusClass: Function,
});

defineEmits(['force-close']);
</script>