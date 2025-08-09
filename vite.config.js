import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'

export default defineConfig({
  plugins: [vue()],
  base: '/vue-md/',
  server: {
    port: 3000,
    open: true
  }
})