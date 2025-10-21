<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
    <!-- Navigation Bar -->
    <nav class="bg-slate-800/80 backdrop-blur-md border-b border-slate-700 sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4">
        <div class="flex items-center justify-between h-16">
          <!-- Logo/Brand -->
          <div class="flex items-center">
            <router-link to="/" class="text-xl font-bold text-white hover:text-blue-400 transition-colors">
              <span class="bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
                Cổng Trading
              </span>
            </router-link>
          </div>

          <!-- Navigation Links -->
          <div class="flex space-x-1">
            <router-link
              to="/trader"
              class="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
              :class="$route.path === '/trader' 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                : 'text-slate-300 hover:bg-slate-700/20 hover:text-white'"
            >
              <div class="flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Trader
              </div>
            </router-link>

            <router-link
              to="/funding-rates"
              class="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
              :class="$route.path === '/funding-rates' 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                : 'text-slate-300 hover:bg-slate-700/20 hover:text-white'"
            >
              <div class="flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Funding Rates
              </div>
            </router-link>
          </div>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <router-view />
  </div>
</template>

<script setup>
</script>