<template>
  <div class="p-6">
    <ToastContainer :toasts="toasts" />
    <div class="max-w-7xl mx-auto space-y-6">
      <!-- Header -->
      <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-lg p-6 border border-slate-700">
        <h1 class="text-3xl font-bold text-white mb-2">Trader Dashboard</h1>
        <p class="text-slate-400">Đặt lệnh Long / Short đồng thời</p>
      </div>

      <!-- Giao diện đặt lệnh (luôn hiển thị, nhưng có thể bị disable) -->
      <div class="space-y-6">
        <!-- Symbol chung -->
        <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <label class="block text-slate-400 text-sm mb-2">Cặp giao dịch</label>
          <input
            v-model="symbol"
            placeholder="BTCUSDT"
            class="w-full bg-slate-700 text-white rounded-lg p-2 border border-slate-600 placeholder-slate-500"
            :disabled="isTrackingPnl"
          />
        </div>

        <!-- Dual Panel -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Long Panel -->
          <div class="bg-slate-800 rounded-xl p-5 shadow-md border border-slate-700">
            <h2 class="text-xl text-green-400 font-semibold mb-4">Lệnh Long (BUY)</h2>
            <TradingPanel v-model="longOrder" side="LONG" :exchanges="exchanges" :disabled="isTrackingPnl" />
          </div>

          <!-- Short Panel -->
          <div class="bg-slate-800 rounded-xl p-5 shadow-md border border-slate-700">
            <h2 class="text-xl text-red-400 font-semibold mb-4">Lệnh Short (SELL)</h2>
            <TradingPanel v-model="shortOrder" side="SHORT" :exchanges="exchanges" :disabled="isTrackingPnl" />
          </div>
        </div>

        <!-- Submit -->
        <div class="flex justify-center">
          <button
            @click="placeOrders"
            :disabled="isLoading || isTrackingPnl"
            class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-lg shadow-blue-500/30 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading">Đang xử lý...</span>
            <span v-else>🚀 Đặt lệnh đồng thời</span>
          </button>
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
                </tr>
              </thead>
              <tbody>
                <tr v-for="pos in pnlData" :key="pos.exchange" class="border-b border-slate-700">
                  <td class="p-3 font-medium text-white">{{ exchangeNameMap[pos.exchange] || pos.exchange }}</td>
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
          <!-- Nút bắt đầu/dừng hủy lệnh -->
          <button v-if="!isAttemptingToClose"
                  @click="startCloseAttempt"
                  :disabled="isLoading"
                  class="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl shadow-lg shadow-orange-500/30 font-semibold transition-all disabled:opacity-50">
            <span v-if="isLoading">Đang xử lý...</span>
            <span v-else>Bắt đầu hủy lệnh</span>
          </button>

          <button v-else
                  @click="stopCloseAttempt"
                  :disabled="isLoading"
                  class="bg-yellow-500 hover:bg-yellow-600 text-black px-6 py-3 rounded-xl shadow-lg shadow-yellow-500/30 font-semibold transition-all disabled:opacity-50 flex items-center gap-2">
            <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>Đang săn PNL... (Dừng)</span>
          </button>

          <!-- Nút Buộc hủy lệnh -->
          <button
            @click="() => forceClosePositions()"
            :disabled="isLoading"
            class="bg-red-800 hover:bg-red-900 text-white px-6 py-3 rounded-xl shadow-lg shadow-red-500/30 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading">Đang xử lý...</span>
            <span v-else>🚨 Buộc hủy lệnh</span>
          </button>

          <!-- Nút Quay lại -->
          <button
            @click="reset"
            :disabled="isAttemptingToClose"
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
const isAttemptingToClose = ref(false)

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

const startPnlTracking = (isHighFrequency = false) => {
  if (pnlInterval) clearInterval(pnlInterval)
  
  const fetchPnl = async () => {
    if (successfulPositions.value.length < 2) return;

    try {
      const { data } = await axios.post('/api/order/pnl', {
        symbol: symbol.value,
        positions: successfulPositions.value,
      })
      const newPnlData = data.results.map(r => r.data)
      pnlData.value = newPnlData

      // KIỂM TRA AN TOÀN: Nếu một vị thế bị đóng/thanh lý
      if (newPnlData.length < 2 || newPnlData.some(p => p.size === 0)) {
        addToast('Phát hiện một vị thế đã bị đóng! Đang buộc hủy lệnh còn lại...', 'error');
        console.error('🚨 Fail-safe triggered: Một vị thế đã biến mất. Đóng lệnh còn lại.');
        // Dừng tất cả các vòng lặp
        isAttemptingToClose.value = false;
        if (pnlInterval) clearInterval(pnlInterval);
        // Tìm vị thế còn lại và đóng nó
        const remainingPositions = newPnlData.filter(p => p.size > 0).map(p => ({ exchange: p.exchange }));
        if (remainingPositions.length > 0) {
          // Gọi force-close cho các vị thế còn lại
          await forceClosePositions(remainingPositions);
        } else {
          reset(); // Nếu không còn gì, chỉ reset UI
        }
        return; // Dừng xử lý tiếp
      }

      // Nếu đang trong chế độ săn PNL, kiểm tra điều kiện đóng
      // CẬP NHẬT LOGIC: Kiểm tra tổng PNL > 0
      if (isAttemptingToClose.value) {
        // Tính tổng PNL từ dữ liệu mới nhận được
        const currentTotalPnl = newPnlData.reduce((sum, pos) => sum + (pos.pnl || 0), 0);

        // Kiểm tra điều kiện: Tổng PNL > 0
        if (currentTotalPnl > 0) {
          console.log(`✅ Điều kiện tổng PNL > 0 đã đạt (${currentTotalPnl.toFixed(4)})! Tự động đóng lệnh.`);
          // Không hiển thị toast ở đây nữa.
          // Chỉ gọi hàm đóng lệnh, hàm này sẽ tự xử lý toast thành công/thất bại.
          closeHedgedPositions();
        }
      }
    } catch (error) {
      console.error('Lỗi fetch PNL:', error)
      addToast('Lỗi khi cập nhật PNL.', 'error')
      clearInterval(pnlInterval)
    }
  }
  const intervalTime = isHighFrequency ? 500 : 5000; // 500ms khi săn, 5s khi theo dõi
  fetchPnl() // Fetch immediately
  pnlInterval = setInterval(fetchPnl, intervalTime)
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

    // Dọn dẹp mảng vị thế thành công trước khi xử lý kết quả mới
    successfulPositions.value = [];

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
    } else if (successCount === 1) {
      await handlePartialOrderFailure();
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

async function handlePartialOrderFailure() {
  addToast('Một lệnh thất bại, đang tự động hủy lệnh còn lại...', 'warning');
  
  // Lấy thông tin từ mảng successfulPositions vừa được thêm vào
  const successfulOrder = successfulPositions.value[0];
  if (!successfulOrder) return;

  const exchangeName = exchangeNameMap.value[successfulOrder.exchange] || successfulOrder.exchange;

  try {
    // Gọi API force-close mà không reset UI bên trong nó
    await forceClosePositions([{ exchange: successfulOrder.exchange }], false);
    addToast(`Lệnh trên sàn [${exchangeName}] đã được hủy thành công.`, 'success');
  } catch (cancelErr) {
    console.error('Lỗi nghiêm trọng: Không thể tự động hủy lệnh!', cancelErr);
    addToast(`LỖI NGHIÊM TRỌNG: Không thể tự động hủy lệnh trên sàn [${exchangeName}]. Vui lòng kiểm tra thủ công!`, 'error');
  }
  reset(); // Reset UI sau khi tất cả các hành động đã hoàn tất
}

function startCloseAttempt() {
  isAttemptingToClose.value = true;
  addToast('Bắt đầu săn PNL. Lệnh sẽ tự đóng khi cả 2 PNL > 0.', 'info');
  startPnlTracking(true); // Bắt đầu polling tần suất cao
}

function stopCloseAttempt() {
  isAttemptingToClose.value = false;
  addToast('Đã dừng săn PNL.', 'warning');
  startPnlTracking(false); // Quay lại polling tần suất thấp
}

async function closeHedgedPositions() {
  // Dừng việc săn PNL để tránh gọi API nhiều lần
  isAttemptingToClose.value = false;
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
    reset();
  } catch (err) {
    console.error('Lỗi đóng lệnh:', err)
    addToast(err.response?.data?.message || 'Không thể đóng lệnh.', 'error')
  } finally {
    isLoading.value = false
  }
}

async function forceClosePositions(positionsToClose = null, shouldReset = true) {
  // Dừng mọi hoạt động săn PNL hoặc polling PNL thông thường
  isAttemptingToClose.value = false;
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
    addToast(data.message, 'success');
    if (shouldReset) {
      reset(); // Chỉ reset UI nếu được yêu cầu
    }
  } catch (err) {
    console.error('Lỗi buộc hủy lệnh:', err);
    addToast(err.response?.data?.message || 'Buộc hủy lệnh thất bại.', 'error');
  } finally {
    isLoading.value = false;
  }
}

function reset() {
  isTrackingPnl.value = false
  isAttemptingToClose.value = false
  if (pnlInterval) clearInterval(pnlInterval)
  pnlData.value = []
  successfulPositions.value = []
}
</script>
