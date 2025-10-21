import { createRouter, createWebHistory } from 'vue-router'
import Trader from '../views/Trader.vue'
import FundingRates from '../views/FundingRateTable.vue'

const routes = [
  {
    path: '/',
    redirect: '/trader'
  },
  {
    path: '/trader',
    name: 'Trader',
    component: Trader
  },
  {
    path: '/funding-rates',
    name: 'FundingRates',
    component: FundingRates
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router