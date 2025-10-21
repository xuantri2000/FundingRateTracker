<template>
  <div class="p-6">
    <div class="max-w-7xl mx-auto space-y-6">
      <!-- Header -->
      <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-lg p-6 border border-slate-700">
        <h1 class="text-3xl font-bold text-white mb-2">Trader Dashboard</h1>
        <p class="text-slate-400">Đặt lệnh Long / Short đồng thời</p>
      </div>

      <!-- Symbol chung -->
      <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <label class="block text-slate-400 text-sm mb-2">Cặp giao dịch</label>
        <input
          v-model="symbol"
          placeholder="BTCUSDT"
          class="w-full bg-slate-700 text-white rounded-lg p-2 border border-slate-600 placeholder-slate-500"
        />
      </div>

      <!-- Dual Panel -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Long Panel -->
        <div class="bg-slate-800 rounded-xl p-5 shadow-md border border-slate-700">
          <h2 class="text-xl text-green-400 font-semibold mb-4">Lệnh Long (BUY)</h2>
          <TradingPanel v-model="longOrder" side="LONG" :exchanges="exchanges" />
        </div>

        <!-- Short Panel -->
        <div class="bg-slate-800 rounded-xl p-5 shadow-md border border-slate-700">
          <h2 class="text-xl text-red-400 font-semibold mb-4">Lệnh Short (SELL)</h2>
          <TradingPanel v-model="shortOrder" side="SHORT" :exchanges="exchanges" />
        </div>
      </div>

      <!-- Submit -->
      <div class="flex justify-center">
        <button
          @click="placeOrders"
          class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-lg shadow-blue-500/30 font-semibold transition-all"
        >
          🚀 Đặt lệnh đồng thời
        </button>
      </div>

      <!-- Kết quả -->
      <div v-if="results.length" class="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 class="text-white text-lg font-semibold mb-3">Kết quả đặt lệnh</h3>
        <ul class="text-slate-300 space-y-2">
          <li v-for="(r, i) in results" :key="i">
            <span class="text-blue-400 font-medium">{{ r.exchange }}</span>:
            {{ r.success ? '✅ Thành công' : '❌ Thất bại' }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import TradingPanel from '@/components/TradingPanel.vue'

const symbol = ref('BTCUSDT')
const longOrder = ref(null)
const shortOrder = ref(null)
const results = ref([])
const exchanges = ref([])

onMounted(async () => {
  try {
    const { data } = await axios.get('/api/exchange')
    exchanges.value = data
  } catch (err) {
    console.error('❌ Lỗi tải danh sách sàn:', err)
  }
})

async function placeOrders() {
  if (!symbol.value || !longOrder.value || !shortOrder.value) {
    alert('⚠️ Vui lòng nhập đủ thông tin cho cả hai lệnh!')
    return
  }

  try {
    const payload = {
      symbol: symbol.value,
      orders: [
        { ...longOrder.value, side: 'BUY' },
        { ...shortOrder.value, side: 'SELL' },
      ],
    }

    const res = await axios.post('/api/order/multi', payload)
    results.value = res.data.results || []
  } catch (err) {
    console.error('❌ Lỗi đặt lệnh:', err)
    alert('Đặt lệnh thất bại!')
  }
}
</script>
