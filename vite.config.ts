import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/ — Konfiguration kompatibel mit Tauri.
export default defineConfig({
  plugins: [react()],
  // Tauri erwartet einen festen Port und vermeidet Verschiebungen.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST || false,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'oxc',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
