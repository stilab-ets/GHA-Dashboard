import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'build',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: 'src/dashboard/dashboard.html',
        popup: 'src/popup/popup.html'
      }
    }
  },
  plugins: [react()],
  publicDir: false,
});
