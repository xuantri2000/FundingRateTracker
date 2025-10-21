<template>
  <div class="flex flex-col gap-4">
    <!-- Sàn -->
    <div>
      <label class="block text-slate-400 text-sm mb-1">Chọn sàn</label>
      <select
        v-model="local.exchange"
        class="w-full bg-slate-700 text-white rounded-lg p-2 border border-slate-600"
      >
        <option v-for="s in exchanges" :key="s" :value="s">{{ s }}</option>
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
		<label class="block text-slate-400 text-sm mb-1">Số tiền (USDT)</label>
		<!-- Chỉ wrapper này là relative, chứa input + nút -->
		<div class="relative">
			<input
			v-model.number="local.amount"
			type="number"
			placeholder="100 USDT"
			class="w-full bg-slate-700 text-white rounded-lg p-2 pr-10 border border-slate-600 placeholder-slate-500 no-spinner"
			/>

			<!-- inset-y-0 căn dọc theo input (không tính label) -->
			<div class="absolute right-2 inset-y-0 flex flex-col items-center justify-center leading-none">
			<button @click="local.amount = Number((local.amount || 0) + 1)"
					class="text-slate-300 hover:text-white text-xs leading-none">▲</button>
			<button @click="local.amount = Math.max(0, Number((local.amount || 0) - 1))"
					class="text-slate-300 hover:text-white text-xs leading-none">▼</button>
			</div>
		</div>
	</div>

  </div>
</template>

<script setup>
import { ref, watch, defineEmits, defineProps } from 'vue'

const props = defineProps({
  modelValue: Object,
  side: String, // LONG hoặc SHORT
})

const emit = defineEmits(['update:modelValue'])

const exchanges = ['Binance', 'Bybit', 'KuCoin', 'Bitget', 'Gate.io', 'MEXC']

const local = ref({
  exchange: props.modelValue?.exchange || 'Binance',
  leverage: props.modelValue?.leverage || 20,
  amount: props.modelValue?.amount || 100,
  side: props.side || '', // bên trái hoặc phải
})

// Cập nhật khi local thay đổi
watch(local, (val) => emit('update:modelValue', val), { deep: true })
</script>
