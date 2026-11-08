import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        scene: resolve(__dirname, 'scene.html'),
        page: resolve(__dirname, 'page.html'),
        laptop: resolve(__dirname, 'laptop.html'),
      },
    },
  },
  server: { port: 5173, host: '127.0.0.1' },
})
