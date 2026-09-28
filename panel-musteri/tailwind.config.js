/**
 * Renkler CSS değişkenlerinden gelir (bkz. src/index.css). Koyu tema
 * varsayılandır; açık tema Ayarlar'dan seçilir ve yalnızca değişkenleri
 * değiştirir — bileşenlerde tema koşulu yazılmaz.
 *
 * Durum renkleri (saglikli / uyari / kritik) yalnızca durum bildirir;
 * süsleme için kullanılmaz.
 */
const v = (ad) => `rgb(var(--${ad}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        koyu:     v("zemin"),
        zemin:    v("zemin"),
        panel:    v("panel"),
        panel2:   v("panel2"),
        cizgi:    v("cizgi"),

        metin:    v("metin"),
        soluk:    v("soluk"),
        sonuk:    v("sonuk"),

        vurgu:    v("vurgu"),
        lacivert: v("metin"),

        saglikli: v("saglikli"),
        uyari:    v("uyari"),
        kritik:   v("kritik"),
        bilgi:    v("bilgi"),
        notr:     v("sonuk"),
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      fontSize: { "2xs": ["0.6875rem", "1rem"] },
      transitionDuration: { DEFAULT: "150ms" },
      borderRadius: {
        DEFAULT: "6px", sm: "4px", md: "6px", lg: "8px",
        xl: "10px", "2xl": "12px", full: "9999px",
      },
      boxShadow: {
        yuzen: "0 8px 30px rgb(0 0 0 / 0.35)",
      },
      keyframes: {
        "belir": { from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "none" } },
        "kay-sag": { from: { transform: "translateX(100%)" }, to: { transform: "none" } },
      },
      animation: {
        belir: "belir 160ms ease-out",
        "kay-sag": "kay-sag 200ms cubic-bezier(.16,1,.3,1)",
      },
    },
  },
  plugins: [],
};
