import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown, Download, MoreHorizontal } from "lucide-react";

/**
 * Tablo yardımcıları: sütuna göre sıralama, CSV dışa aktarma ve satır
 * eylem menüsü. Sıralama değerleri `sutunlar[anahtar](satir)` ile okunur.
 */
export function useSiralama(liste, sutunlar, varsayilan = null) {
  const [sira, setSira] = useState(varsayilan); // {anahtar, yon: 1 | -1}

  const sirali = useMemo(() => {
    if (!sira || !sutunlar[sira.anahtar]) return liste;
    const al = sutunlar[sira.anahtar];
    return [...liste].sort((a, b) => {
      const x = al(a), y = al(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;          // boş değerler her iki yönde de sonda
      if (y == null) return -1;
      const k = typeof x === "number" && typeof y === "number"
        ? x - y : String(x).localeCompare(String(y), "tr");
      return k * sira.yon;
    });
  }, [liste, sutunlar, sira]);

  const sirala = (anahtar) => setSira((s) =>
    s?.anahtar === anahtar ? (s.yon === 1 ? { anahtar, yon: -1 } : null) : { anahtar, yon: 1 });

  return { sirali, sira, sirala };
}

/** Tıklanınca sıralayan tablo başlığı. */
export function SiraBaslik({ anahtar, sira, sirala, children, sag = false }) {
  const aktif = sira?.anahtar === anahtar;
  const Ikon = !aktif ? ChevronsUpDown : sira.yon === 1 ? ArrowUp : ArrowDown;
  return (
    <th className={sag ? "!text-right" : ""} aria-sort={aktif ? (sira.yon === 1 ? "ascending" : "descending") : "none"}>
      <button onClick={() => sirala(anahtar)}
        className={`inline-flex items-center gap-1 hover:text-metin ${aktif ? "text-metin" : ""} ${sag ? "flex-row-reverse" : ""}`}>
        {children}
        <Ikon size={12} className={aktif ? "" : "opacity-40"} />
      </button>
    </th>
  );
}

/** Satırları CSV olarak indirir (Excel'de Türkçe karakterler için BOM eklenir). */
export function csvIndir(dosyaAdi, satirlar, sutunlar) {
  const kacir = (v) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const metin = [
    sutunlar.map((s) => kacir(s.ad)).join(";"),
    ...satirlar.map((r) => sutunlar.map((s) => kacir(s.deger(r))).join(";")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + metin], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${dosyaAdi}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CsvDugmesi({ onClick }) {
  return (
    <button onClick={onClick} className="dugme-ikincil" title="CSV olarak indir">
      <Download size={14} /> <span className="hidden sm:inline">Dışa aktar</span>
    </button>
  );
}

/**
 * Satır sonundaki "…" menüsü. eylemler: [{ad, ikon?, tehlike?, gizli?, yap}]
 * Tıklama satırın kendi tıklamasına (detaya gitme) yayılmaz.
 */
export function EylemMenusu({ eylemler }) {
  const [konum, setKonum] = useState(null); // açıkken menünün ekran konumu
  const ref = useRef(null);
  const dugme = useRef(null);
  const gorunen = eylemler.filter((e) => !e.gizli);
  const acik = konum != null;

  // Menü, tablo kaydırma kabının dışına taşabilsin diye "fixed" konumlanır.
  function ac() {
    if (acik) return setKonum(null);
    const r = dugme.current.getBoundingClientRect();
    const yukseklik = gorunen.length * 34 + 10;
    const asagi = r.bottom + yukseklik + 8 < window.innerHeight;
    setKonum({
      right: Math.max(8, window.innerWidth - r.right),
      ...(asagi ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
    });
  }

  useEffect(() => {
    if (!acik) return;
    const kapat = () => setKonum(null);
    const f = (e) => !ref.current?.contains(e.target) && kapat();
    const t = (e) => e.key === "Escape" && kapat();
    document.addEventListener("mousedown", f);
    document.addEventListener("keydown", t);
    window.addEventListener("scroll", kapat, true);
    window.addEventListener("resize", kapat);
    return () => {
      document.removeEventListener("mousedown", f);
      document.removeEventListener("keydown", t);
      window.removeEventListener("scroll", kapat, true);
      window.removeEventListener("resize", kapat);
    };
  }, [acik]);

  if (!gorunen.length) return null;
  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button ref={dugme} onClick={ac} aria-label="İşlemler" aria-expanded={acik}
        className="dugme-hayalet p-1.5">
        <MoreHorizontal size={16} />
      </button>
      {acik && (
        <div role="menu" style={konum}
          className="fixed z-[55] min-w-[200px] animate-belir rounded-lg border border-cizgi bg-panel p-1 shadow-yuzen">
          {gorunen.map((e) => (
            <button key={e.ad} role="menuitem" onClick={() => { setKonum(null); e.yap(); }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-panel2 ${
                e.tehlike ? "text-kritik" : "text-soluk hover:text-metin"}`}>
              {e.ikon && <e.ikon size={14} />}
              {e.ad}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
