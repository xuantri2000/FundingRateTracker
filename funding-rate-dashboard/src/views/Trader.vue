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
                  <th class="p-3 text-slate-400 text-center">Trạng thái</th>
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
                  <td class="p-3 text-center">
                    <span v-if="pos.isLiquidated" class="text-orange-400 font-bold" title="Vị thế đã bị đóng/thanh lý">
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
            :disabled="isLoading"
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
let pnlInterval = null;

// --- State mới cho giá trị USDT dự kiến ---
const longOrderValue = ref(0);
const shortOrderValue = ref(0);
let longPriceInterval = null;
let shortPriceInterval = null;

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

const startPnlTracking = () => {
  if (pnlInterval) clearInterval(pnlInterval)
  
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
          
          // Đóng băng PNL và đánh dấu là đã đóng
          pnlData.value = pnlData.value.map(p => {
            if (p.exchange === closedPos.exchange) {
              return { ...p, pnl: lastKnownPnl, isLiquidated: true, size: 0 };
            }
            return p;
          });
        }
      }
    } catch (error) {
      console.error('Lỗi fetch PNL:', error)
      addToast('Lỗi khi cập nhật PNL.', 'error')
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
      const failedOrderInfo = payload.orders.find(o => !results.some(r => r.success && r.exchange === o.exchange));
      await handlePartialOrderFailure(failedOrderInfo);
    } else {
      // Nếu không thành công cả 2, reset lại
      successfulPositions.value = []
    }
    isLoading.value = false; // Di chuyển vào trong try block

  } catch (err) {
    console.error('❌ Lỗi đặt lệnh:', err)
    addToast(err.response?.data?.message || 'Đặt lệnh thất bại!', 'error')
  } finally {
    isLoading.value = false
  }
}

async function handlePartialOrderFailure(failedOrderInfo) {
  const MAX_RETRIES = 2;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    addToast(`Lệnh [${failedOrderInfo.exchange}] thất bại. Thử lại lần ${attempt}/${MAX_RETRIES} sau 1 giây...`, 'warning');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Đợi 1 giây

    try {
      const retryPayload = {
        symbol: symbol.value,
        orders: [failedOrderInfo],
      };
      const { data } = await axios.post('/api/order/multi', retryPayload);
      const retryResult = data.results[0];

      if (retryResult.success) {
        addToast(`[${retryResult.exchange}] Đặt lại lệnh ${retryResult.side} thành công!`, 'success');
        successfulPositions.value.push({
          exchange: retryResult.exchange,
          side: retryResult.side,
          quantity: retryResult.data.quantity,
        });
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
  addToast(`[${failedOrderInfo.exchange}] Đặt lại lệnh thất bại sau ${MAX_RETRIES} lần. Hủy lệnh đã thành công...`, 'error');
  const successfulOrder = successfulPositions.value[0];
  if (successfulOrder) {
    await forceClosePositions([successfulOrder], false);
    addToast(`Đã hủy lệnh trên sàn [${exchangeNameMap.value[successfulOrder.exchange] || successfulOrder.exchange}].`, 'info');
  }
  reset();
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
  if (pnlInterval) clearInterval(pnlInterval)
  pnlData.value = []
  successfulPositions.value = []
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

      if (isTrackingPnl.value && successfulPositions.value.length > 0) {
        addToast('Đã khôi phục phiên giao dịch trước đó.', 'info');

        // KHỞI TẠO pnlData để UI hiển thị ngay lập tức
        pnlData.value = successfulPositions.value.map(pos => ({
          ...pos,
          pnl: null, // PNL ban đầu là null (hiển thị 'Đang tải...')
          isLiquidated: false,
        }));

        startPnlTracking(); // Bắt đầu theo dõi lại PNL
      }
    } catch (e) {
      console.error("Lỗi khi parse state từ localStorage:", e);
      localStorage.removeItem(STORAGE_KEY); // Xóa state bị lỗi
    }
  }
};

// Theo dõi các thay đổi và lưu vào localStorage
watch([symbol, longOrder, shortOrder, isTrackingPnl, successfulPositions], saveState, { deep: true });

</script>
