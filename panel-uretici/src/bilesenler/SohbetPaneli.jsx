import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, Copy, Check, Sparkles } from "lucide-react";
import { useSohbet } from "../api/sohbetler";
import { ORNEK_SORULAR } from "../api/asistan";

/**
 * Mesaj akışı + yazma alanı. Sohbet sayfasında ve sağ çekmecede kullanılır.
 * Enter gönderir, Shift+Enter yeni satır açar.
 */
export default function SohbetPaneli({ kompakt = false }) {
  const { aktif, bekliyor, gonder } = useSohbet();
  const [giris, setGiris] = useState("");
  const alan = useRef(null);
  const son = useRef(null);

  useEffect(() => { son.current?.scrollIntoView({ block: "end" }); }, [aktif.mesajlar.length, bekliyor, aktif.id]);

  useEffect(() => {
    const t = alan.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(160, t.scrollHeight)}px`;
  }, [giris]);

  function yolla(metin = giris) {
    if (!metin.trim() || bekliyor) return;
    gonder(metin);
    setGiris("");
  }

  const bos = aktif.mesajlar.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex-1 overflow-y-auto ${kompakt ? "px-4 py-4" : "px-4 py-6 sm:px-8"}`}>
        {bos ? (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-panel2 ring-1 ring-cizgi">
              <Sparkles size={18} className="text-soluk" />
            </span>
            <h3 className="mt-3 text-sm font-medium">Sistem verisine soru sorun</h3>
            <p className="mt-1 text-xs leading-relaxed text-sonuk">
              Cihaz durumları, arıza öngörüleri, partiler, garanti ve stok hakkında yanıt verir.
              Seri numarası yazarsanız o cihazı ayrıntılı anlatır.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {ORNEK_SORULAR.map((s) => (
                <button key={s} onClick={() => yolla(s)} className="cip-pasif rounded-full">{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className={`mx-auto space-y-5 ${kompakt ? "" : "max-w-3xl"}`}>
            {aktif.mesajlar.map((m, i) => <Mesaj key={i} m={m} />)}
            {bekliyor && (
              <div className="flex items-center gap-1.5 px-1 py-2" aria-label="Yanıt yazılıyor">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-sonuk"
                        style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            )}
            <div ref={son} />
          </div>
        )}
      </div>

      <div className={`border-t border-cizgi ${kompakt ? "p-3" : "px-4 py-4 sm:px-8"}`}>
        <div className={`mx-auto flex items-end gap-2 rounded-lg border border-cizgi bg-zemin p-2
                         focus-within:border-soluk/60 ${kompakt ? "" : "max-w-3xl"}`}>
          <textarea
            ref={alan} rows={1} value={giris}
            onChange={(e) => setGiris(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); yolla(); } }}
            placeholder="Bir soru yazın…"
            className="max-h-40 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-sonuk"
          />
          <button onClick={() => yolla()} disabled={bekliyor || !giris.trim()} aria-label="Gönder"
            className="dugme-ana h-8 w-8 shrink-0 rounded-md p-0">
            <ArrowUp size={16} />
          </button>
        </div>
        {!kompakt && (
          <p className="mx-auto mt-2 max-w-3xl text-center text-2xs text-sonuk">
            Yanıtlar panel verisinden üretilir. Kritik kararlar öncesinde cihaz sayfasını kontrol edin.
          </p>
        )}
      </div>
    </div>
  );
}

function Mesaj({ m }) {
  const [kopyalandi, setKopyalandi] = useState(false);

  if (m.rol === "kullanici") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-panel2 px-3.5 py-2 text-sm ring-1 ring-cizgi">
          {m.metin}
        </div>
      </div>
    );
  }

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(m.metin);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 1500);
    } catch { /* izin yok */ }
  }

  return (
    <div className="group">
      <div className="text-sm leading-relaxed text-metin"><Bicimli metin={m.metin} /></div>
      <button onClick={kopyala}
        className="mt-1 flex items-center gap-1 rounded px-1 py-0.5 text-2xs text-sonuk opacity-0 transition-opacity
                   hover:text-metin focus:opacity-100 group-hover:opacity-100">
        {kopyalandi ? <Check size={12} /> : <Copy size={12} />}
        {kopyalandi ? "Kopyalandı" : "Kopyala"}
      </button>
    </div>
  );
}

const SERI = /\b((?:AKU|INV)-D\d{2}-\d{4})\b/g;

/** Satır başı "· " / "- " / "* " listeye, ``` arası kod bloğuna dönüşür; seri numaraları cihaz sayfasına bağlanır. */
function Bicimli({ metin }) {
  const satirlar = metin.split("\n");
  const bloklar = [];
  let liste = null;
  let kod = null;
  satirlar.forEach((s, i) => {
    if (/^\s*```/.test(s)) {
      if (kod) kod = null;
      else { kod = []; liste = null; bloklar.push({ tur: "kod", satirlar: kod }); }
      return;
    }
    if (kod) { kod.push(s); return; }
    const madde = s.match(/^\s*[·\-•*]\s+(.*)$/);
    if (madde) {
      if (!liste) { liste = []; bloklar.push({ tur: "liste", ogeler: liste }); }
      liste.push(madde[1]);
    } else {
      liste = null;
      if (s.trim()) bloklar.push({ tur: "p", metin: s, i });
      else bloklar.push({ tur: "bosluk", i });
    }
  });

  return (
    <div className="space-y-1">
      {bloklar.map((b, i) =>
        b.tur === "liste" ? (
          <ul key={i} className="my-1 space-y-1 pl-4">
            {b.ogeler.map((o, j) => <li key={j} className="list-disc marker:text-sonuk"><Baglantili metin={o} /></li>)}
          </ul>
        ) : b.tur === "kod" ? (
          <KodBlogu key={i} metin={b.satirlar.join("\n")} />
        ) : b.tur === "p" ? (
          <p key={i}><Baglantili metin={b.metin} /></p>
        ) : <div key={i} className="h-1.5" />
      )}
    </div>
  );
}

function KodBlogu({ metin }) {
  const [kopyalandi, setKopyalandi] = useState(false);
  async function kopyala() {
    try {
      await navigator.clipboard.writeText(metin);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 1500);
    } catch { /* izin yok */ }
  }
  return (
    <div className="relative my-1.5 rounded-lg bg-panel2 ring-1 ring-cizgi">
      <button onClick={kopyala} aria-label="Kodu kopyala"
        className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded px-1.5 py-1 text-2xs text-sonuk hover:text-metin">
        {kopyalandi ? <Check size={12} /> : <Copy size={12} />}
        {kopyalandi ? "Kopyalandı" : "Kopyala"}
      </button>
      <pre className="overflow-x-auto px-3 pb-2.5 pt-7 font-mono text-xs leading-relaxed text-metin">{metin}</pre>
    </div>
  );
}

// Web adresleri (asistanın kaynakları) yeni sekmede açılır; sondaki noktalama bağlantıya dahil edilmez.
const ADRES = /(https?:\/\/[^\s<>"'()]*[^\s<>"'().,;:!?])/;
const KALIN = /\*\*([^*\n]+)\*\*/;

function Baglantili({ metin }) {
  return metin.split(ADRES).map((p, i) =>
    i % 2 === 1 ? (
      <a key={i} href={p} target="_blank" rel="noopener noreferrer"
        className="break-all text-bilgi underline decoration-bilgi/40 underline-offset-2 hover:decoration-bilgi">
        {p.replace(/^https?:\/\/(www\.)?/, "")}
      </a>
    ) : <Kalinli key={i} metin={p} />
  );
}

function Kalinli({ metin }) {
  return metin.split(KALIN).map((p, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold text-metin"><Serili metin={p} /></strong> : <Serili key={i} metin={p} />
  );
}

function Serili({ metin }) {
  const parcalar = metin.split(SERI);
  return parcalar.map((p, i) =>
    i % 2 === 1 ? (
      <Link key={i} to={`/${p.startsWith("AKU") ? "aku" : "inverter"}/${p}`}
        className="rounded bg-panel2 px-1 font-mono text-xs text-metin ring-1 ring-cizgi hover:ring-soluk/50">
        {p}
      </Link>
    ) : <span key={i}>{p}</span>
  );
}
