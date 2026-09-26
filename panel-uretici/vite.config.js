import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// amazon-cognito-identity-js Node.js için yazılmış; tarayıcıda
// tanımsız olan "global" nesnesini bekler. globalThis'e eşlenir.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  define: {
    global: 'globalThis',
  },
})
