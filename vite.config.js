import { defineConfig } from 'vite';

const pagesBase = '/calamari-damacy-discord/';

export default defineConfig(({ command }) => ({
  root: '.',
  publicDir: 'public',
  envDir: '.',
  base:
    process.env.VITE_BASE_PATH ??
    (command === 'serve' ? '/' : pagesBase),
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
    hmr: {
      clientPort: 443,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
