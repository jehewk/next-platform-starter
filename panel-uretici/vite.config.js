import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// amazon-cognito-identity-js Node.js icin yazilmis; tarayicida
// tanimsiz olan "global" nesnesini bekler. globalThis'e esleriz.
//
// __BUILD_ZAMANI__: her `npm run dev` / `npm run build` calistiginda
// o anin gercek saatine esitlenir. Ekranda sabit bir seritte gosterilir
// — kullanici hangi derlemeye baktigini saniye hassasiyetinde gorur,
// eski bir sekme/onbellek/surecle karistirilamaz.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  define: {
    global: 'globalThis',
    __BUILD_ZAMANI__: JSON.stringify(new Date().toLocaleString('tr-TR')),
  },
})
