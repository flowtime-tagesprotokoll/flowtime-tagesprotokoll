import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = process.env.PUBLIC_BASE_PATH ?? '/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'icon-128.png', 'icon-256.png', 'icon-512.png'],
      manifest: {
        name: 'Flowtime Tagesprotokoll',
        short_name: 'Flowtime',
        description: 'Kassen-Tagesprotokoll für Flowtime GmbH',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'any',
        scope: BASE,
        start_url: BASE,
        lang: 'de',
        icons: [
          { src: `${BASE}icon-128.png`.replace('//', '/'), sizes: '128x128', type: 'image/png' },
          { src: `${BASE}icon-256.png`.replace('//', '/'), sizes: '256x256', type: 'image/png' },
          { src: `${BASE}icon-512.png`.replace('//', '/'), sizes: '512x512', type: 'image/png' },
          { src: `${BASE}icon-512.png`.replace('//', '/'), sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api/, /supabase/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_'],
  build: {
    target: 'es2020',
    minify: 'oxc',
    sourcemap: false,
  },
});
