import { defineConfig } from "vitest/config";

// Yalnız tarayıcı-bağımlı modüllerin birim testi için (ble, oturum, istemci,
// servis dönüştürücüleri). jsdom: sessionStorage/navigator; VITE_API_URL sahte.
export default defineConfig({
  test: {
    environment: "jsdom",
    env: { VITE_API_URL: "http://test.local" },
    include: ["src/__tests__/**/*.test.{js,jsx}"],
  },
});
