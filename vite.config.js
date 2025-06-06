import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH, // <--- Add a comma here!
  define: {
    // Vite does not expose process.env directly to the client.
    // This makes process.env.API_KEY available in the client code.
    // If API_KEY is set in the environment where Vite runs, it will be embedded.
    // Otherwise, it will be undefined, and the app's existing checks will handle it.
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
  },
  // Optional: If you need to serve from a subdirectory on a static host
  // base: '/your-subdirectory/',
  server: {
    port: 3000, // You can specify a port for the dev server
    open: true, // Automatically open the app in the browser on server start
  },
  build: {
    outDir: 'dist', // The output directory for the build
    sourcemap: true, // Generate source maps for debugging
  },
});
