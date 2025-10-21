<template>
  <div class="fixed top-5 right-5 z-50 space-y-3 w-80">
    <transition-group name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="toastClasses[toast.type]"
        class="rounded-lg shadow-lg p-4 flex items-start"
      >
        <div class="flex-shrink-0 text-xl mr-3">{{ icon[toast.type] }}</div>
        <div class="flex-grow text-sm">{{ toast.message }}</div>
      </div>
    </transition-group>
  </div>
</template>

<script setup>
defineProps({
  toasts: Array,
})

const toastClasses = {
  info: 'bg-blue-500 text-white',
  success: 'bg-green-500 text-white',
  warning: 'bg-yellow-500 text-black',
  error: 'bg-red-500 text-white',
}

const icon = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌'
}
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.5s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
