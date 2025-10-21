<template>
  <div class="p-6">
    <ToastContainer :toasts="toasts" />
    <div class="max-w-7xl mx-auto space-y-6">
      <!-- Header -->
      <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-lg p-6 border border-slate-700">
        <h1 class="text-3xl font-bold text-white mb-2">Trader Dashboard</h1>
        <p class="text-slate-400">Đặt lệnh Long / Short đồng thời</p>
      </div>

      <!-- Giao diện đặt lệnh -->
      <div v-if="!isTrackingPnl" class="space-y-6">
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
            :disabled="isLoading"
            class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-lg shadow-blue-500/30 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading">Đang xử lý...</span>
            <span v-else>🚀 Đặt lệnh đồng thời</span>
          </button>
        </div>
      </div>

      <!-- Giao diện theo dõi PNL -->
      <div v-else class="space-y-6">
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
                </tr>
              </thead>
              <tbody>
                <tr v-for="pos in pnlData" :key="pos.exchange" class="border-b border-slate-700">
                  <td class="p-3 font-medium text-white">{{ pos.exchange }}</td>
                  <td class="p-3">
                    <span :class="pos.side === 'BUY' ? 'text-green-400' : 'text-red-400'">
                      {{ pos.side }}
                    </span>
                  </td>
                  <td class="p-3 text-right font-mono" :class="getPnlClass(pos.pnl)">
                    {{ formatPnl(pos.pnl) }}
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
           <button
            @click="closeHedgedPositions"
            :disabled="isLoading"
            class="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl shadow-lg shadow-red-500/30 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading">Đang xử lý...</span>
            <span v-else>💰 Đóng Lệnh (Khi PNL > 0)</span>
          </button>
          <button
            @click="reset"
            class="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-xl font-semibold transition-all"
          >
            Quay lại
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import axios from 'axios'
import TradingPanel from '@/components/TradingPanel.vue'
import ToastContainer from '@/components/ToastContainer.vue'

const symbol = ref('BTCUSDT')
const longOrder = ref(null)
const shortOrder = ref(null)
const exchanges = ref([])
const isLoading = ref(false)

// --- Toast ---
const toasts = ref([])
const addToast = (message, type = 'info') => {
  const id = Date.now()
  toasts.value.push({ id, message, type })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 4000)
}

// --- PNL Tracking State ---
const isTrackingPnl = ref(false)
const pnlData = ref([])
const successfulPositions = ref([])
let pnlInterval = null

onMounted(async () => {
  try {
    const { data } = await axios.get('/api/exchange')
    exchanges.value = data
  } catch (err) {
    console.error('❌ Lỗi tải danh sách sàn:', err)
    addToast('Không thể tải danh sách sàn giao dịch.', 'error')
  }
})

onUnmounted(() => {
  if (pnlInterval) clearInterval(pnlInterval)
})

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

const startPnlTracking = () => {
  if (pnlInterval) clearInterval(pnlInterval)
  
  const fetchPnl = async () => {
    try {
      const { data } = await axios.post('/api/order/pnl', {
        symbol: symbol.value,
        positions: successfulPositions.value,
      })
      pnlData.value = data.results.map(r => r.data)
    } catch (error) {
      console.error('Lỗi fetch PNL:', error)
      addToast('Lỗi khi cập nhật PNL.', 'error')
      clearInterval(pnlInterval)
    }
  }

  fetchPnl() // Fetch immediately
  pnlInterval = setInterval(fetchPnl, 5000) // Then every 5 seconds
}

async function placeOrders() {
  if (!symbol.value || !longOrder.value || !shortOrder.value) {
    addToast('Vui lòng nhập đủ thông tin cho cả hai lệnh!', 'warning')
    return
  }

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

    let successCount = 0;
    results.forEach(r => {
      if (r.success) {
        successCount++;
        addToast(`[${r.exchange}] Lệnh ${r.side} đã được đặt thành công!`, 'success')
        // Lưu lại thông tin cần thiết để đóng lệnh và lấy PNL
        successfulPositions.value.push({
          exchange: r.exchange,
          side: r.side,
          quantity: r.data.quantity,
        })
      } else {
        addToast(`[${r.exchange}] Lệnh ${r.side} thất bại: ${r.error}`, 'error')
      }
    })

    if (successCount === 2) {
      isTrackingPnl.value = true
      startPnlTracking()
    } else {
      // Nếu không thành công cả 2, reset lại
      successfulPositions.value = []
    }

  } catch (err) {
    console.error('❌ Lỗi đặt lệnh:', err)
    addToast(err.response?.data?.message || 'Đặt lệnh thất bại!', 'error')
  } finally {
    isLoading.value = false
  }
}

async function closeHedgedPositions() {
  isLoading.value = true
  try {
    const { data } = await axios.post('/api/order/close-hedged', {
      symbol: symbol.value,
      positions: successfulPositions.value
    })
    addToast(data.message, 'success')
    reset()
  } catch (err) {
    console.error('Lỗi đóng lệnh:', err)
    addToast(err.response?.data?.message || 'Không thể đóng lệnh.', 'error')
  } finally {
    isLoading.value = false
  }
}

function reset() {
  isTrackingPnl.value = false
  if (pnlInterval) clearInterval(pnlInterval)
  pnlData.value = []
  successfulPositions.value = []
}
</script>
