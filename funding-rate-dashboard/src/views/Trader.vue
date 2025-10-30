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
            <TradingPanel v-model="longOrder" side="LONG" :exchanges="exchanges" :disabled="isTrackingPnl" :estimated-value="longOrderValue" />
          </div>

          <!-- Short Panel -->
          <div class="bg-slate-800 rounded-xl p-5 shadow-md border border-slate-700">
            <h2 class="text-xl text-red-400 font-semibold mb-4">Lệnh Short (SELL)</h2>
            <TradingPanel v-model="shortOrder" side="SHORT" :exchanges="exchanges" :disabled="isTrackingPnl" :estimated-value="shortOrderValue" />
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
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
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
let lastPnlDataBeforeUpdate = []; // BIẾN MỚI: Lưu trữ PNL của lần fetch trước
let pnlInterval = null
const isAttemptingToClose = ref(false)

// --- State mới cho giá trị USDT dự kiến ---
const longOrderValue = ref(0);
const shortOrderValue = ref(0);
let longPriceInterval = null;
let shortPriceInterval = null;


// --- State mới cho logic gỡ lỗ ---
const isRecoveringLoss = ref(false); // Cờ báo hiệu đang trong chế độ gỡ lỗ
const recoveryTargetPnl = ref(0); // Mục tiêu PNL cần đạt để gỡ lỗ

const STORAGE_KEY = 'traderState';

onMounted(async () => {
  try {
    const { data } = await axios.get('/api/exchange')
    exchanges.value = data
  } catch (err) {
    console.error('❌ Lỗi tải danh sách sàn:', err)
    addToast('Không thể tải danh sách sàn giao dịch.', 'error')
  }
  loadState(); // Tải lại trạng thái khi component được mount
})

onUnmounted(() => {
  if (pnlInterval) clearInterval(pnlInterval)
  if (longPriceInterval) clearInterval(longPriceInterval);
  if (shortPriceInterval) clearInterval(shortPriceInterval);
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
    // Nếu đang trong chế độ gỡ lỗ, chỉ cần 1 vị thế
    if (isRecoveringLoss.value && successfulPositions.value.length < 1) return;
    // Nếu không trong chế độ gỡ lỗ, cần đủ 2 vị thế
    if (!isRecoveringLoss.value && successfulPositions.value.length < 2) return;

    try {
      const { data } = await axios.post('/api/order/pnl', {
        symbol: symbol.value,
        positions: successfulPositions.value,
      })
      // Lưu lại dữ liệu PNL hiện tại TRƯỚC KHI cập nhật pnlData.value
      lastPnlDataBeforeUpdate = [...pnlData.value];

      const newPnlData = data.results.map(r => r.data)
      pnlData.value = newPnlData

      const currentTotalPnl = newPnlData.reduce((sum, pos) => sum + (pos.pnl || 0), 0);

      // --- LOGIC GỠ LỖ KHI ĐANG Ở CHẾ ĐỘ GỠ LỖ ---
      if (isRecoveringLoss.value) {
        const remainingPosition = newPnlData[0];
        if (remainingPosition && remainingPosition.pnl >= recoveryTargetPnl.value) {
          addToast(`Gỡ lỗ thành công! PNL đạt ${remainingPosition.pnl.toFixed(2)} >= mục tiêu ${recoveryTargetPnl.value.toFixed(2)}. Đang đóng lệnh...`, 'success');
          await forceClosePositions(); // Đóng nốt lệnh còn lại và reset
        }
        return; // Không xử lý các logic khác nữa
      }

      // --- LOGIC DỪNG LỖ (STOP-LOSS) CHO TỪNG LỆNH ---
      // Kiểm tra từng vị thế xem có lỗ quá 95% isolatedMargin không
      for (const posData of newPnlData) {
        const initialMargin = posData.isolatedMargin || 0;
        if (initialMargin <= 0) continue; // Bỏ qua nếu không có thông tin margin
        
        const lossThreshold = -0.95 * initialMargin;
        
        if (posData.pnl <= lossThreshold) {
          const exchangeName = exchangeNameMap.value[posData.exchange] || posData.exchange;
          addToast(`Dừng lỗ tự động cho [${exchangeName}]! PNL (${posData.pnl.toFixed(2)}) đã chạm ngưỡng ${lossThreshold.toFixed(2)} USDT (-95% margin).`, 'error');
          
          // Đóng lệnh bị lỗ nặng này
          const positionToClose = successfulPositions.value.find(p => p.exchange === posData.exchange);
          if (positionToClose) {
            try {
              await forceClosePositions([positionToClose], false);
              addToast(`Đã đóng lệnh [${exchangeName}] do dừng lỗ.`, 'warning');
              
              // Chuyển sang chế độ gỡ lỗ cho lệnh còn lại
              const remainingPosition = newPnlData.find(p => p.exchange !== posData.exchange);
              if (remainingPosition) {
                isRecoveringLoss.value = true;
                recoveryTargetPnl.value = -posData.pnl; // Mục tiêu là số dương của khoản lỗ
                isAttemptingToClose.value = false;
                
                const remainingExchangeName = exchangeNameMap.value[remainingPosition.exchange] || remainingPosition.exchange;
                addToast(`Chuyển sang chế độ gỡ lỗ cho [${remainingExchangeName}].`, 'info');
                addToast(`Mục tiêu PNL mới: >= ${recoveryTargetPnl.value.toFixed(2)} USDT.`, 'info');
                
                // Cập nhật lại danh sách vị thế thành công
                successfulPositions.value = successfulPositions.value.filter(p => p.exchange !== posData.exchange);
                
                startPnlTracking(true); // Tiếp tục polling nhanh
              } else {
                // Không còn lệnh nào, reset
                reset();
              }
            } catch (error) {
              console.error('Lỗi khi đóng lệnh dừng lỗ:', error);
              addToast('Lỗi khi đóng lệnh dừng lỗ!', 'error');
            }
          }
          return; // Dừng xử lý các logic khác
        }
      }

      // KIỂM TRA AN TOÀN: Nếu một vị thế bị đóng/thanh lý bất ngờ
      if (newPnlData.length < 2 || newPnlData.some(p => p.size === 0)) {
        // Lấy dữ liệu PNL của lần gần nhất (khi còn đủ 2 vị thế)
        const closedPosition = lastPnlDataBeforeUpdate.find(p => !newPnlData.some(np => np.exchange === p.exchange));

        // Nếu tìm thấy vị thế đã đóng và nó đang lỗ
        if (closedPosition && closedPosition.pnl < 0) {
          isRecoveringLoss.value = true;
          recoveryTargetPnl.value = -closedPosition.pnl; // Mục tiêu là số dương của khoản lỗ
          isAttemptingToClose.value = false; // Tắt chế độ săn PNL thông thường
          
          // Cập nhật lại danh sách vị thế thành công
          successfulPositions.value = successfulPositions.value.filter(p => 
            newPnlData.some(np => np.exchange === p.exchange)
          );
          
          const remainingPos = newPnlData[0];
          const exchangeName = exchangeNameMap.value[remainingPos.exchange] || remainingPos.exchange;

          addToast(`Một vị thế đã đóng với lỗ ${closedPosition.pnl.toFixed(2)} USDT. Chuyển sang chế độ gỡ lỗ cho [${exchangeName}].`, 'warning');
          addToast(`Mục tiêu PNL mới: >= ${recoveryTargetPnl.value.toFixed(2)} USDT.`, 'info');
          
          startPnlTracking(true); // Duy trì polling nhanh
        } else {
          // Nếu vị thế đóng không lỗ, hoặc không tìm thấy, thì đóng lệnh còn lại như cũ
          addToast('Phát hiện một vị thế đã bị đóng! Đang buộc hủy lệnh còn lại...', 'error');
          console.error('🚨 Fail-safe triggered: Một vị thế đã biến mất. Đóng lệnh còn lại.');
          await forceClosePositions();
        }
        return; // Dừng xử lý các logic khác trong lần fetch này
      }

      // Nếu đang trong chế độ săn PNL, kiểm tra điều kiện đóng
      // CẬP NHẬT LOGIC: Kiểm tra tổng PNL > 0
      if (isAttemptingToClose.value) {
        // Kiểm tra điều kiện: Tổng PNL > 0
        if (currentTotalPnl > 0) {
          console.log(`✅ Điều kiện tổng PNL > 0 đã đạt (${currentTotalPnl.toFixed(4)})! Tự động đóng lệnh.`);
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
  if (!pnlInterval) fetchPnl() // Fetch immediately on first run
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
    
    localStorage.removeItem(STORAGE_KEY); // Xóa state khi đã đóng lệnh thành công
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
      localStorage.removeItem(STORAGE_KEY); // Xóa state khi đã đóng lệnh thành công
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
  isRecoveringLoss.value = false; // Reset cờ gỡ lỗ
  recoveryTargetPnl.value = 0;
  localStorage.removeItem(STORAGE_KEY); // Xóa state khi reset
}

// --- LOGIC MỚI: THEO DÕI GIÁ TRỊ USDT DỰ KIẾN ---

const createPriceWatcher = (orderRef, valueRef, debounceRef) => {
  // Theo dõi sự thay đổi của symbol và order object
  watch([symbol, orderRef], ([newSymbol, newOrder]) => {
    // Xóa timeout cũ để debounce
    if (debounceRef.value) {
      clearTimeout(debounceRef.value);
    }

    // Nếu không đủ thông tin, reset ngay lập tức
    if (!newOrder || !newOrder.exchange || !(newOrder.amount > 0) || !newSymbol) {
      valueRef.value = 0;
      return;
    }

    // Đặt timeout mới. API sẽ chỉ được gọi sau 500ms kể từ lần thay đổi cuối cùng.
    debounceRef.value = setTimeout(async () => {
      try {
        const { data } = await axios.get('/api/exchange/price', {
          params: {
            exchange: newOrder.exchange,
            symbol: newSymbol,
          }
        });
        if (data.price) {
          valueRef.value = data.price * newOrder.amount;
        }
      } catch (error) {
        console.error(`Lỗi lấy giá cho ${newOrder.exchange}:`, error.message);
        valueRef.value = 0; // Reset giá trị nếu có lỗi
      }
    }, 500); // Thời gian chờ debounce

  }, { deep: true });
};

createPriceWatcher(longOrder, longOrderValue, { value: longPriceInterval });
createPriceWatcher(shortOrder, shortOrderValue, { value: shortPriceInterval });

// --- LOGIC MỚI: LƯU VÀ TẢI TRẠNG THÁI TỪ LOCALSTORAGE ---

const saveState = () => {
  const state = {
    symbol: symbol.value,
    longOrder: longOrder.value,
    shortOrder: shortOrder.value,
    isTrackingPnl: isTrackingPnl.value,
    successfulPositions: successfulPositions.value,
    isRecoveringLoss: isRecoveringLoss.value,
    recoveryTargetPnl: recoveryTargetPnl.value,
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
      isRecoveringLoss.value = state.isRecoveringLoss || false;
      recoveryTargetPnl.value = state.recoveryTargetPnl || 0;

      if (isTrackingPnl.value && successfulPositions.value.length > 0) {
        addToast('Đã khôi phục phiên giao dịch trước đó.', 'info');
        startPnlTracking(); // Bắt đầu theo dõi lại PNL
      }
    } catch (e) {
      console.error("Lỗi khi parse state từ localStorage:", e);
      localStorage.removeItem(STORAGE_KEY); // Xóa state bị lỗi
    }
  }
};

// Theo dõi các thay đổi và lưu vào localStorage
watch([symbol, longOrder, shortOrder, isTrackingPnl, successfulPositions, isRecoveringLoss], saveState, { deep: true });

</script>
