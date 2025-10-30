<script setup>
import { ref, watch, onMounted } from 'vue'
import axios from 'axios'

const props = defineProps({
  modelValue: Object,
  side: String,
  exchanges: Array,
  estimatedValue: Number, // ✅ Prop mới để nhận giá trị ước tính
})

const emit = defineEmits(['update:modelValue'])

const local = ref({
  exchange: props.modelValue?.exchange || '',
  leverage: props.modelValue?.leverage || 20,
  amount: props.modelValue?.amount || 100,
  side: props.side || '',
})

// Đồng bộ dữ liệu với cha
watch(local, (newVal) => emit('update:modelValue', newVal), { deep: true })

// Đồng bộ dữ liệu từ cha xuống con khi prop thay đổi (ví dụ: khi loadState)
watch(() => props.modelValue, (newVal) => {
  // Chỉ cập nhật nếu giá trị thực sự khác nhau để tránh vòng lặp vô hạn
  if (JSON.stringify(newVal) !== JSON.stringify(local.value)) {
    local.value = { ...local.value, ...newVal };
  }
}, { deep: true });
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Sàn -->
    <div>
      <label class="block text-slate-400 text-sm mb-1">Chọn sàn</label>
      <select
        v-model="local.exchange"
        class="w-full bg-slate-700 text-white rounded-lg p-2 border border-slate-600"
      >
        <option
          v-for="s in exchanges"
          :key="s.id"
          :value="s.id"
        >
          {{ s.name }}
        </option>
      </select>
    </div>

    <!-- Đòn bẩy -->
    <div>
      <label class="block text-slate-400 text-sm mb-1">Đòn bẩy (x)</label>
      <div class="relative">
        <input
          v-model.number="local.leverage"
          type="number"
          step="1"
          min="1"
          placeholder="Ví dụ: 20"
          class="w-full bg-slate-700 text-white rounded-lg p-2 pr-10 border border-slate-600 placeholder-slate-500 no-spinner"
        />
        <div class="absolute right-2 inset-y-0 flex flex-col items-center justify-center leading-none">
          <button
            @click="local.leverage = Math.min(125, Number((local.leverage || 1) + 1))"
            class="text-slate-300 hover:text-white text-xs leading-none"
          >
            ▲
          </button>
          <button
            @click="local.leverage = Math.max(1, Number((local.leverage || 1) - 1))"
            class="text-slate-300 hover:text-white text-xs leading-none"
          >
            ▼
          </button>
        </div>
      </div>
    </div>

    <!-- Số tiền -->
    <div>
      <div class="flex justify-between items-baseline mb-1">
        <label class="text-slate-400 text-sm">Số lượng (2 chữ số thập phân)</label>
        <div v-if="estimatedValue > 0" class="text-sm text-slate-400">
          ≈ {{ estimatedValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) }}
        </div>
      </div>
      <div class="relative">
        <input
          v-model.number="local.amount"
          type="number"
          placeholder="100"
          class="w-full bg-slate-700 text-white rounded-lg p-2 pr-10 border border-slate-600 placeholder-slate-500 no-spinner"
        />
        <div class="absolute right-2 inset-y-0 flex flex-col items-center justify-center leading-none">
          <button
            @click="local.amount = Number((local.amount || 0) + 1)"
            class="text-slate-300 hover:text-white text-xs leading-none"
          >
            ▲
          </button>
          <button
            @click="local.amount = Math.max(0, Number((local.amount || 0) - 1))"
            class="text-slate-300 hover:text-white text-xs leading-none"
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
