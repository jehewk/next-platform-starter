/** Kenarlıklı yüzey. `baslik` ve `ustBilgi` verilirse üst şerit çizilir. */
export function Kart({ baslik, ustBilgi, cocuk, children, className = "" }) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-lg border border-cizgi bg-panel ${className}`}>
      {(baslik || ustBilgi) && (
        <header className="flex min-h-[44px] items-center justify-between gap-3 border-b border-cizgi px-4 py-2.5">
          <h2 className="text-sm font-medium text-metin">{baslik}</h2>
          {ustBilgi}
        </header>
      )}
      {cocuk ?? children}
    </section>
  );
}

/** Kart ızgarası içindeki tek ölçüm hücresi. */
export function Olcum({ etiket, deger, birim, vurgu }) {
  return (
    <div className="px-4 py-3.5">
      <div className="text-xs text-sonuk">{etiket}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums tracking-tight ${vurgu || "text-metin"}`}>
        {deger}
        {birim && <span className="ml-1 text-xs font-normal text-sonuk">{birim}</span>}
      </div>
    </div>
  );
}

/** Ölçüm hücrelerini tek kart içinde bölmelerle dizer. */
export function OlcumSeridi({ children, sutun = 4 }) {
  const s = { 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-5" }[sutun];
  return (
    <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-cizgi bg-cizgi ${s}
                     [&>*]:bg-panel`}>
      {children}
    </div>
  );
}

/** Sayfa başlığı: başlık, kısa açıklama ve sağda isteğe bağlı eylemler. */
export function SayfaBasligi({ baslik, aciklama, eylem, ust }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {ust}
        <h1 className="text-xl font-semibold tracking-tight">{baslik}</h1>
        {aciklama && <p className="mt-1 text-sm text-soluk">{aciklama}</p>}
      </div>
      {eylem && <div className="flex shrink-0 items-center gap-2">{eylem}</div>}
    </div>
  );
}

/** Boş durum mesajı. */
export function Bos({ metin, alt }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm text-soluk">{metin}</p>
      {alt && <p className="mt-1 text-xs text-sonuk">{alt}</p>}
    </div>
  );
}
