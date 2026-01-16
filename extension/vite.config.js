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
      },
      output: {
        // Use relative paths for Chrome extension compatibility
        assetFileNames: 'assets/[name].[ext]',
        chunkFileNames: 'assets/[name].js',
        entryFileNames: 'assets/[name].js'
      }
    },
    // Ensure assets are in the right place
    assetsDir: 'assets'
  },
  plugins: [react()],
  publicDir: false,
  base: './' // Use relative base for extension compatibility
});
