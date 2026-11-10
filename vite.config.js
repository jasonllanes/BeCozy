import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves this repo at https://<user>.github.io/BeCozy/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/BeCozy/' : '/',
  plugins: [react()],
  server: { port: 5173, open: true },
}));
