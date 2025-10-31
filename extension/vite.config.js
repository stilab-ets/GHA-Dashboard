import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'build',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: 'dashboard.html',
        popup: 'popup.html'
      }
    }
  },
  plugins: [react()],
  publicDir: false,
});
