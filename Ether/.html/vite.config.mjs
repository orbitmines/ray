import {defineConfig} from 'vite';

export default defineConfig({
  base: '/',
  appType: 'spa',
  build: {
    outDir: './dist'
  },
});