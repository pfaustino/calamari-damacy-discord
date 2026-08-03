import { defineConfig } from 'vite';

const pagesBase = '/calamari-damacy-discord/';

export default defineConfig(({ command }) => ({
  root: '.',
  publicDir: 'public',
  envDir: '.',
  base:
    process.env.VITE_BASE_PATH ??
    (command === 'serve' ? '/' : pagesBase),
  plugins: [
    {
      name: 'strip-crossorigin',
      transformIndexHtml(html) {
        return html.replace(/\s+crossorigin/g, '');
      },
    },
  ],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/mp': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
    hmr: {
      clientPort: 443,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
  },
}));
