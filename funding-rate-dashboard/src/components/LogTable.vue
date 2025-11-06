<template>
  <div class="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-slate-700 h-full flex flex-col" ref="logContainer">
    <div class="flex justify-between items-center mb-3 flex-shrink-0">
      <h3 class="text-lg font-semibold text-white">Nhật ký hoạt động</h3>
      <button @click="emit('clear-logs')" title="Xóa nhật ký" class="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-full">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
      </button>
    </div>
    <!-- This wrapper is crucial for overflow to work correctly in a flex container -->
    <div class="relative flex-1 overflow-y-auto custom-scrollbar" style="max-height: 600px;">
      <table class="w-full text-sm text-left table-fixed">
        <thead class="sticky top-0 bg-slate-800/80 backdrop-blur-sm z-10">
          <tr class="border-b border-slate-600">
            <th class="p-2 text-slate-400 w-24 whitespace-nowrap">Thời gian</th>
            <th class="p-2 text-slate-400 w-20 whitespace-nowrap">Loại</th>
            <th class="p-2 text-slate-400 whitespace-nowrap">Nội dung</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="logs.length === 0">
            <td colspan="3" class="p-4 text-center text-slate-500">Chưa có hoạt động nào.</td>
          </tr>
          <tr v-for="log in reversedLogs" :key="log.id" class="border-b border-slate-700/50" :class="getFlashAnimationClass(log.type)">
            <td class="p-2 text-slate-500 font-mono">{{ log.timestamp }}</td>
            <td class="p-2 font-semibold" :class="getLogTypeClass(log.type)">
              {{ log.type.toUpperCase() }}
            </td>
            <td class="p-2 text-slate-300 break-words">{{ log.message }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, watch, ref, nextTick } from 'vue';

const props = defineProps({
  logs: {
    type: Array,
    required: true,
  },
});

const emit = defineEmits(['clear-logs']);

const logContainer = ref(null);

// Đảo ngược log để hiển thị log mới nhất lên đầu
const reversedLogs = computed(() => [...props.logs].reverse());

// Tự động cuộn xuống khi có log mới
watch(() => props.logs.length, async () => {
  await nextTick();
  const scrollableDiv = logContainer.value?.querySelector('[style*="max-height"]');
  if (scrollableDiv) scrollableDiv.scrollTop = 0; // Cuộn lên đầu vì list đã đảo ngược
});

const getLogTypeClass = (type) => {
  switch (type) {
    case 'success':
      return 'text-green-400';
    case 'error':
      return 'text-red-400';
    case 'warning':
      return 'text-yellow-400';
    case 'info':
    default:
      return 'text-blue-400';
  }
};

const getFlashAnimationClass = (type) => {
  switch (type) {
    case 'success':
      return 'animate-flash-success';
    case 'error':
      return 'animate-flash-error';
    case 'warning':
      return 'animate-flash-warning';
    case 'info':
    default:
      return 'animate-flash-info';
  }
};
</script>

<style>
/* Base animation properties */
.animate-flash-success, .animate-flash-error, .animate-flash-warning, .animate-flash-info {
  animation-duration: 0.8s;
  animation-timing-function: ease-out;
}

/* Green for Success */
@keyframes flash-success-animation {
  0% {
    background-color: rgba(74, 222, 128, 0.2); /* bg-green-400/20 */
  }
  100% {
    background-color: transparent;
  }
}
.animate-flash-success { animation-name: flash-success-animation; }

/* Red for Error */
@keyframes flash-error-animation {
  0% {
    background-color: rgba(248, 113, 113, 0.2); /* bg-red-400/20 */
  }
  100% { background-color: transparent; }
}
.animate-flash-error { animation-name: flash-error-animation; }

/* Yellow for Warning */
@keyframes flash-warning-animation {
  0% {
    background-color: rgba(250, 204, 21, 0.2); /* bg-yellow-400/20 */
  }
  100% { background-color: transparent; }
}
.animate-flash-warning { animation-name: flash-warning-animation; }

/* Blue for Info */
@keyframes flash-info-animation {
  0% {
    background-color: rgba(96, 165, 250, 0.2); /* bg-blue-400/20 */
  }
  100% { background-color: transparent; }
}
.animate-flash-info { animation-name: flash-info-animation; }

/* Custom Scrollbar Styling */
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background-color: rgba(30, 41, 59, 0.5); /* slate-800/50 */
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #475569; /* slate-600 */
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: #64748b; /* slate-500 */
}
</style>