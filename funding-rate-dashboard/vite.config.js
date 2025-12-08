import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
	plugins: [vue()],
	server: {
		proxy: {
			'/binance-api': {
				target: 'https://fapi.binance.com',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/binance-api/, ''),
			},
			'/kucoin-api': {
				target: 'https://api.kucoin.com',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/kucoin-api/, ''),
			},
			'/bitget-api': {
				target: 'https://api.bitget.com',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/bitget-api/, ''),
			},
			'/gate-api': {
				target: 'https://api.gateio.ws',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/gate-api/, ''),
			},
			'/htx-api': {
				target: 'https://api.hbdm.com',
				changeOrigin: true,
				secure: false,
				rewrite: (path) => path.replace(/^\/htx-api/, ''),
			},
			'/mexc-api': {
				target: 'https://contract.mexc.com',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/mexc-api/, ''),
			},
			'/whitebit-api': {
				target: 'https://whitebit.com/api/v4/public',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/whitebit-api/, '')
			},
			'/api': {
				target: 'http://localhost:3000/api',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ''),
				configure: (proxy) => {
					proxy.on('error', () => {});
				}
			}
		},
	},
	preview: {
		host: '0.0.0.0',
		port: 4173,
		allowedHosts: [
			'nateriver.zapto.org',
			'localhost',
		]
	},
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url))
		}
	}
})
