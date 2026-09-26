/**
 * Renk paleti — nötr, monokrom, tek vurgu.
 *
 * Yapay zekâ estetiği olan mor/mavi gradyanlar kullanılmaz. Slate
 * tonları, beyaz zemin, tek kurumsal vurgu (#0F172A — logonun laciverti).
 * Durum renkleri yalnızca anlam taşır, doygunlukları düşük tutulur.
 *
 * Font: Inter ana yazı tipidir — Linear, Vercel, Stripe, GitHub'ın da
 * kullandığı font; "AI panosu" klişesi olan "her yerde mono font" 
 * yaklaşımından kaçınmak için. Mono yalnızca cihaz/seri kimlikleri gibi
 * gerçekten sabit genişlik gerektiren yerlerde kullanılır.
 */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        koyu:   "#FFFFFF",
        panel:  "#FFFFFF",
        panel2: "#F8FAFC",
        cizgi:  "#E2E8F0",

        metin:  "#0F172A",
        soluk:  "#475569",
        sonuk:  "#94A3B8",

        vurgu:    "#0F172A",
        lacivert: "#0F172A",

        saglikli: "#15803D",
        uyari:    "#B45309",
        kritik:   "#B91C1C",
        bilgi:    "#334155",
        notr:     "#94A3B8",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      fontSize: { "2xs": "0.6875rem" },
      transitionDuration: { DEFAULT: "150ms" },
      borderRadius: {
        DEFAULT: "3px", sm: "2px", md: "3px", lg: "4px",
        xl: "5px", "2xl": "6px", full: "9999px",
      },
      boxShadow: { yuzen: "0 2px 12px rgba(15,23,42,.07)" },
    },
  },
  plugins: [],
}
