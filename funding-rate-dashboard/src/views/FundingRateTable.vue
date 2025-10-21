<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-2xl p-6 mb-6 border border-slate-700">
        <div class="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 class="text-3xl font-bold text-white mb-2">Funding Rate Dashboard</h1>
          </div>
          <div class="flex justify-end text-right">
            <button
              @click="manualRefresh"
              :disabled="loading"
              class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <svg 
                :class="{'animate-spin': loading}" 
                class="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  stroke-linecap="round" 
                  stroke-linejoin="round" 
                  stroke-width="2" 
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </div>
        </div>
		<p v-if="lastUpdate" class="text-sm text-slate-400 mt-2">
              Cập nhật: {{ lastUpdate }}
        </p>
        <p v-if="countdown !== null" class="text-xs text-slate-500 mt-1">
              Lần đếm ngược tiếp theo: {{ countdown }}
        </p>
      </div>

      <!-- Loading State -->
      <div 
        v-if="loading" 
        class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-2xl p-12 border border-slate-700"
      >
        <div class="flex flex-col items-center justify-center">
          <svg 
            class="w-12 h-12 text-blue-500 animate-spin mb-4" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              stroke-linecap="round" 
              stroke-linejoin="round" 
              stroke-width="2" 
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <p class="text-slate-400">{{ loadingMessage }}</p>
        </div>
      </div>

      <!-- Main Table -->
      <div 
        v-else 
        class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden border border-slate-700"
      >
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="bg-slate-700/50">
                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider sticky left-0 bg-slate-700/50">
                  #
                </th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider sticky left-16 bg-slate-700/50">
                  Symbol
                </th>
                <th 
                  v-for="exchange in exchanges" 
                  :key="exchange.key" 
                  class="px-6 py-4 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider"
                >
                  {{ exchange.name }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-700">
              <tr 
                v-for="(coin, index) in coins" 
                :key="coin.symbol" 
                class="hover:bg-slate-700/30 transition-colors"
              >
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-300 sticky left-0 bg-slate-800/80">
                  {{ index + 1 }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-white sticky left-16 bg-slate-800/80">
                  {{ coin.symbol }}
                </td>
                <td 
                  v-for="exchange in exchanges" 
                  :key="exchange.key" 
                  class="px-6 py-4 whitespace-nowrap text-sm text-center"
                >
                  <span 
                    :class="[
                      getRateClass(fundingData[coin.symbol]?.[exchange.key]),
                      highlightedCells[`${coin.symbol}-${exchange.key}`] ? 'animate-highlight-cell' : ''
                    ]"
                    class="font-mono font-semibold inline-block px-2 py-1 rounded"
                  >
                    {{ formatRate(fundingData[coin.symbol]?.[exchange.key]) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Legend -->
      <div class="mt-6 bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-xl p-4 border border-slate-700">
        <div class="flex items-center justify-center gap-6 text-sm flex-wrap">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-green-500 rounded-full"></div>
            <span class="text-slate-300">Funding Rate Dương</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-red-500 rounded-full"></div>
            <span class="text-slate-300">Funding Rate Âm</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-gray-400 rounded-full"></div>
            <span class="text-slate-300">Không có dữ liệu</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { 
  fetchTop8Binance, 
  fetchFundingRatesAsync
} from '../services/exchangeService';

const coins = ref([]);
const fundingData = ref({});
const loading = ref(true);
const loadingMessage = ref('Đang tải dữ liệu...');
const lastUpdate = ref(null);
const countdown = ref(null);
const highlightedCells = ref({});
let intervalId = null;

const exchanges = [
  { name: 'Binance', key: 'binance' },
  { name: 'KuCoin', key: 'kucoin' },
  { name: 'Bitget', key: 'bitget' },
  { name: 'Gate.io', key: 'gateio' },
  { name: 'HTX', key: 'htx' },
  { name: 'MEXC', key: 'mexc' },
  { name: 'WhiteBIT', key: 'whitebit' },
];

/**
 * Làm nổi bật ô khi có dữ liệu mới
 */
const highlightCell = (symbol, exchangeKey) => {
  const cellKey = `${symbol}-${exchangeKey}`;
  highlightedCells.value[cellKey] = true;
  
  setTimeout(() => {
    highlightedCells.value[cellKey] = false;
  }, 2000);
};

/**
 * Load danh sách 8 coin mới từ Binance
 */
const loadTop8Coins = async () => {
  loading.value = true;
  loadingMessage.value = 'Đang tải danh sách 8 coin từ Binance...';
  
  try {
    console.log('🔄 Bắt đầu load danh sách 8 coin...');
    
    const top8 = await fetchTop8Binance();
    coins.value = top8;
    
    fundingData.value = {};
    top8.forEach(coin => {
      fundingData.value[coin.symbol] = {
        binance: null,
        kucoin: null,
        bitget: null,
        gateio: null,
        htx: null,
        mexc: null,
        whitebit: null
      };
    });
    
    lastUpdate.value = new Date().toLocaleTimeString('vi-VN');
    console.log('✅ Đã lấy top 8 coins:', top8.map(c => c.symbol));
  } catch (error) {
    console.error('❌ Lỗi khi load danh sách coin:', error);
  } finally {
    loading.value = false;
    calculateCountdown();
  }
};

/**
 * Cập nhật funding rates (từng coin bất đồng bộ)
 */
const updateFundingRates = async () => {
  if (coins.value.length === 0) {
    console.log('⚠️ Chưa có danh sách coin');
    return;
  }
  
  console.log('🔄 Bắt đầu cập nhật funding rates bất đồng bộ...');
  
  await fetchFundingRatesAsync(coins.value, (coinData) => {
    console.log(`✅ Hoàn thành ${coinData.symbol}`);
    
    // Cập nhật từng exchange và làm nổi bật ô tương ứng
    Object.keys(coinData.rates).forEach(exchangeKey => {
    //   if (exchangeKey !== 'binance') { // Binance đã có sẵn
      if (true) {
        fundingData.value[coinData.symbol][exchangeKey] = coinData.rates[exchangeKey];
        
        // Chỉ highlight nếu có dữ liệu mới
        if (coinData.rates[exchangeKey] !== null) {
          highlightCell(coinData.symbol, exchangeKey);
        }
      }
    });
    
    lastUpdate.value = new Date().toLocaleTimeString('vi-VN');
  });
  
  console.log('✅ Hoàn thành cập nhật tất cả funding rates');
  calculateCountdown();
};

/**
 * Refresh thủ công
 */
const manualRefresh = async () => {
  loading.value = true;
  loadingMessage.value = 'Đang tải dữ liệu...';
  
  try {
    await loadTop8Coins();
    if (coins.value.length > 0) {
      await updateFundingRates();
    }
  } catch (error) {
    console.error('❌ Lỗi khi refresh:', error);
  } finally {
    loading.value = false;
  }
};

/**
 * Cấu hình các mốc thời gian cập nhật
 */
const COIN_UPDATE_MINUTE = 47;
const FUNDING_UPDATE_START = 50; // bắt đầu hiển thị theo giây
const FUNDING_UPDATE_END = 59;

/**
 * Kiểm tra và thực hiện update theo lịch
 */
const checkScheduledUpdate = async () => {
  const now = new Date();
  const minute = now.getMinutes();
  const second = now.getSeconds();

  // Chỉ check đúng giây 0 để đỡ spam log
  if (second !== 0) return;

  console.log(`⏰ Kiểm tra lịch: ${now.toLocaleTimeString('vi-VN')}`);

  if (minute === COIN_UPDATE_MINUTE) {
    console.log('📋 Thời gian load danh sách coin mới!');
    await loadTop8Coins();
    await updateFundingRates();
  } else if (minute >= FUNDING_UPDATE_START && minute <= FUNDING_UPDATE_END) {
    console.log('💰 Thời gian cập nhật funding rates!');
    await updateFundingRates();
  }
};

/**
 * Tính thời gian đếm ngược đến lần cập nhật tiếp theo
 */
const calculateCountdown = () => {
  const now = new Date();
  const minute = now.getMinutes();
  const second = now.getSeconds();

  let targetMinute;
  let targetHour = now.getHours();

  if (minute < COIN_UPDATE_MINUTE) {
    targetMinute = COIN_UPDATE_MINUTE;
  } else if (minute < FUNDING_UPDATE_START) {
    targetMinute = FUNDING_UPDATE_START;
  } else if (minute <= FUNDING_UPDATE_END) {
    // Nếu đang trong giai đoạn 50–59, đếm ngược đến phút kế tiếp
    targetMinute = minute + 1;
  } else {
    // Sau 59 → sang giờ kế tiếp, quay lại mốc 45
    targetMinute = COIN_UPDATE_MINUTE;
    targetHour += 1;
  }

  // Thời điểm mục tiêu
  const targetTime = new Date(now);
  targetTime.setHours(targetHour);
  targetTime.setMinutes(targetMinute);
  targetTime.setSeconds(0);
  targetTime.setMilliseconds(0);

  const diffMs = targetTime - now;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const remainSec = diffSec % 60;

  // 🧠 Hiển thị:
  // - Bình thường: phút + giây
  // - Trong 50–59: chỉ giây
  if (minute >= FUNDING_UPDATE_START && minute <= FUNDING_UPDATE_END) {
    countdown.value = `Còn ${remainSec} giây cập nhật`;
  } else {
    countdown.value = `Còn ${diffMin > 0 ? diffMin + ' phút ' : ''}${remainSec} giây`;
  }
};


const formatRate = (rate) => {
  if (rate === null || rate === undefined) return '-';
  return `${(rate * 100).toFixed(4)}%`;
};

const getRateClass = (rate) => {
  if (rate === null || rate === undefined) return 'text-gray-400';
  return rate > 0 ? 'text-green-500' : rate < 0 ? 'text-red-500' : 'text-gray-400';
};

onMounted(async () => {
  await loadTop8Coins();
  
  if (coins.value.length > 0) {
    await updateFundingRates();
  }
  
  intervalId = setInterval(() => {
    checkScheduledUpdate();
    calculateCountdown();
  }, 1000);
});

onUnmounted(() => {
  if (intervalId) {
    clearInterval(intervalId);
  }
});
</script>

<style scoped>
@keyframes highlight-cell {
  0%, 100% {
    background-color: transparent;
  }
  50% {
    background-color: rgba(59, 130, 246, 0.5);
  }
}

.animate-highlight-cell {
  animation: highlight-cell 0.6s ease-in-out 1;
}
</style>