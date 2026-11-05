import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'SonicPay - Offline Sound Payments',
        short_name: 'SonicPay',
        description: 'Offline Crypto Payments Over Sound',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm}']
      }
    })
  ],
  optimizeDeps: {
    include: ['ggwave']
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true
  }
});
