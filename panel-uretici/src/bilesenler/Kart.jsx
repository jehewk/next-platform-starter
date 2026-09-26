export function Kart({ baslik, ustBilgi, cocuk, className = "" }) {
  return (
    <section className={`min-w-0 border border-cizgi bg-panel ${className}`}>
      {(baslik || ustBilgi) && (
        <header className="flex items-center justify-between border-b border-cizgi px-4 py-2.5">
          <h2 className="text-xs font-medium text-soluk">{baslik}</h2>
          {ustBilgi}
        </header>
      )}
      {cocuk}
    </section>
  );
}

export function Olcum({ etiket, deger, birim, vurgu }) {
  return (
    <div className="border-r border-cizgi px-4 py-3 last:border-r-0">
      <div className="text-xs font-medium text-sonuk">{etiket}</div>
      <div className={`mt-1 font-mono text-lg ${vurgu || "text-metin"}`}>
        {deger}
        {birim && <span className="ml-0.5 text-xs text-soluk">{birim}</span>}
      </div>
    </div>
  );
}
