<template>
    <div class="space-y-6">
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
            <button @click="$emit('toggle-pnl-hunting')" :disabled="isLoading"
                class="px-6 py-3 rounded-xl shadow-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                :class="isPnlHunting ? 'bg-yellow-600 hover:bg-yellow-700 text-white shadow-yellow-500/30' : 'bg-green-600 hover:bg-green-700 text-white shadow-green-500/30'">
                <span v-if="isLoading && isPnlHunting">Đang dừng...</span>
                <span v-else-if="isPnlHunting">🎯 Đang săn PNL (Dừng)</span>
                <span v-else>🔫 Săn PNL</span>
            </button>

            <!-- Nút Buộc hủy lệnh -->
            <button @click="$emit('force-close')" :disabled="isLoading"
                class="bg-red-800 hover:bg-red-900 text-white px-6 py-3 rounded-xl shadow-lg shadow-red-500/30 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                <span v-if="isLoading">Đang xử lý...</span>
                <span v-else>🚨 Buộc hủy lệnh</span>
            </button>
        </div>
    </div>
</template>

<script setup>
defineProps({
    symbol: String,
    pnlData: Array,
    totalPnl: Number,
    isLoading: Boolean,
    isPnlHunting: Boolean,
    exchangeNameMap: Object,
    getPnlClass: Function,
    formatPnl: Function,
});

defineEmits(['toggle-pnl-hunting', 'force-close']);
</script>