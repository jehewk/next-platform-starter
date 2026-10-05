import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, Copy, Check, Sparkles, ImagePlus, X } from "lucide-react";
import { useSohbet } from "../api/sohbetler";
import { ORNEK_SORULAR } from "../api/asistan";
import { fotografHazirla } from "../api/gorsel";
import { useRiza } from "../api/riza";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip, ResponsiveContainer } from "recharts";
import { useGrafikRenkleri, Ipucu } from "./Grafik";

/**
 * Mesaj akışı + yazma alanı. Sohbet sayfasında ve sağ çekmecede kullanılır.
 * Enter gönderir, Shift+Enter yeni satır açar.
 */
export default function SohbetPaneli({ kompakt = false, baslangicSoru = "" }) {
  const { aktif, bekliyor, gonder } = useSohbet();
  const [giris, setGiris] = useState("");
  const [ek, setEk] = useState(null);           // {tur, veri, onizleme}
  const [riza, rizaVer] = useRiza();
  const [ekHata, setEkHata] = useState("");
  const dosya = useRef(null);
  const alan = useRef(null);
  const son = useRef(null);
  const tohumlandi = useRef(false);

  // Cihaz sayfasından "bu arızayı açıkla" ile gelindiğinde soruyu bir kez otomatik yolla.
  useEffect(() => {
    if (baslangicSoru && !tohumlandi.current) {
      tohumlandi.current = true;
      gonder(baslangicSoru);
    }
  }, [baslangicSoru, gonder]);

  useEffect(() => { son.current?.scrollIntoView({ block: "end" }); }, [aktif.mesajlar.length, bekliyor, aktif.id]);

  useEffect(() => {
    const t = alan.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(160, t.scrollHeight)}px`;
  }, [giris]);

  function yolla(metin = giris) {
    if ((!metin.trim() && !ek) || bekliyor) return;
    gonder(metin, ek);
    setGiris("");
    setEk(null);
  }

  async function fotografSec(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setEkHata("");
    try { setEk(await fotografHazirla(f)); } catch (h) { setEk(null); setEkHata(h.message); }
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
            <h3 className="mt-3 text-sm font-medium">Sisteminiz hakkında sorun</h3>
            <p className="mt-1 text-xs leading-relaxed text-sonuk">
              Akünüzün ve inverterinizin durumunu, üretiminizi ve garantinizi sorabilirsiniz.
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

      <div className={`border-t border-cizgi ${kompakt ? "p-3" : "px-4 py-3 sm:px-8"} pb-[max(0.75rem,env(safe-area-inset-bottom))]`}>
        {!riza && (
          <div className={`mx-auto mb-2 rounded-lg border border-cizgi bg-panel2/60 px-3 py-2.5 text-xs leading-relaxed text-soluk ${kompakt ? "" : "max-w-3xl"}`}>
            Sisteminizle ilgili soruları burada, verileriniz dışarı çıkmadan yanıtlarım. Genel sorular ve fotoğraflar
            için yanıtın Google'dan (ABD) alınmasına izin verin.{" "}
            <a href="/gizlilik#acik-riza" className="text-metin underline underline-offset-2">Ayrıntılar</a>
            <button onClick={() => rizaVer(true)} className="dugme-ikincil ml-0 mt-2 flex min-h-[40px] w-full sm:ml-2 sm:mt-0 sm:inline-flex sm:w-auto">
              İzin veriyorum
            </button>
          </div>
        )}
        {(ek || ekHata) && (
          <div className={`mx-auto mb-2 flex items-center gap-2.5 ${kompakt ? "" : "max-w-3xl"}`}>
            {ek && (
              <div className="relative shrink-0">
                <img src={ek.onizleme} alt="Eklenen fotoğraf" className="h-14 w-14 rounded-md object-cover ring-1 ring-cizgi" />
                <button onClick={() => setEk(null)} aria-label="Fotoğrafı kaldır"
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-panel text-soluk ring-1 ring-cizgi hover:text-metin">
                  <X size={13} />
                </button>
              </div>
            )}
            <p className={`text-2xs leading-snug ${ekHata ? "text-kritik" : "text-sonuk"}`}>
              {ekHata || "Fotoğraf incelenmek üzere yapay zekâ hizmetine (Google Gemini) gönderilir; uygulamada saklanmaz."}
            </p>
          </div>
        )}
        <div className={`mx-auto flex items-end gap-2 rounded-lg border border-cizgi bg-zemin p-2
                         focus-within:border-soluk/60 ${kompakt ? "" : "max-w-3xl"}`}>
          <input ref={dosya} type="file" accept="image/*" className="hidden" onChange={fotografSec} />
          <button onClick={() => dosya.current?.click()} disabled={bekliyor || !riza} aria-label="Fotoğraf ekle"
            title={riza ? "Fotoğraf ekle" : "Fotoğraf incelemesi için önce izin verin"}
            className="dugme-hayalet h-8 w-8 shrink-0 rounded-md p-0">
            <ImagePlus size={17} />
          </button>
          <textarea
            ref={alan} rows={1} value={giris}
            onChange={(e) => setGiris(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); yolla(); } }}
            placeholder={ek ? "Fotoğraf hakkında ne sormak istersiniz? (boş bırakabilirsiniz)" : "Bir soru yazın…"}
            className="max-h-40 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-sonuk"
          />
          <button onClick={() => yolla()} disabled={bekliyor || (!giris.trim() && !ek)} aria-label="Gönder"
            className="dugme-ana h-8 w-8 shrink-0 rounded-md p-0">
            <ArrowUp size={16} />
          </button>
        </div>
        {!kompakt && (
          <p className="mx-auto mt-2 max-w-3xl text-center text-2xs text-sonuk">
            Yanıtlar cihazlarınızın son ölçümlerinden üretilir. Acil durumda Destek sekmesinden bize ulaşın.
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
      <div className="flex flex-col items-end gap-1.5">
        {m.gorsel && <img src={m.gorsel} alt="Gönderilen fotoğraf" className="max-h-48 max-w-[60%] rounded-xl object-cover ring-1 ring-cizgi" />}
        {m.metin && (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-panel2 px-3.5 py-2 text-sm ring-1 ring-cizgi">
            {m.metin}
          </div>
        )}
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
      {m.grafik?.noktalar?.length > 1 && <SohbetGrafigi g={m.grafik} />}
      {m.arama && <AramaOnerileri html={m.arama} />}
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

/** Yerel yanıtın küçük çizgi grafiği (ör. akü hücre farkı gidişatı, api/saglikGecmisi.js). */
function SohbetGrafigi({ g }) {
  const r = useGrafikRenkleri();
  const tarih = (x) => String(x).slice(5).split("-").reverse().join(".");
  const birim = g.birim ? ` ${g.birim}` : "";
  return (
    <figure className="mt-2 rounded-lg bg-panel2/60 px-2 pb-1 pt-2 ring-1 ring-cizgi" aria-label={g.baslik}>
      <figcaption className="px-1 text-2xs text-sonuk">{g.baslik}{g.birim ? ` (${g.birim})` : ""}</figcaption>
      <div className="h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={g.noktalar} margin={{ top: 8, right: 8, bottom: 0, left: g.sayisiz ? -36 : -18 }}>
            <CartesianGrid stroke={r.izgara} vertical={false} />
            <XAxis dataKey="x" tickFormatter={tarih} tick={{ fill: r.eksen, fontSize: 10 }}
              axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={g.sayisiz ? false : { fill: r.eksen, fontSize: 10 }} axisLine={false} tickLine={false}
              width={44} allowDecimals={false}
              domain={[0, (en) => Math.ceil((Math.max(en, g.esik ?? 0) * 1.1) / 20) * 20]} />
            {g.esik != null && (
              <ReferenceLine y={g.esik} stroke={r.uyari} strokeDasharray="4 4" strokeOpacity={0.7}
                label={{ value: g.sayisiz ? "sınır" : `sınır ${g.esik}${birim}`, position: "insideTopLeft", fill: r.soluk, fontSize: 10 }} />
            )}
            {!g.sayisiz && (
              <Tooltip cursor={{ stroke: r.eksen, strokeDasharray: "3 3" }}
                content={<Ipucu bicim={(v) => `${v}${birim}`} etiket={tarih} />} />
            )}
            <Line type="monotone" dataKey="y" name="Değer" stroke={r.seri} strokeWidth={2}
              dot={false} activeDot={{ r: 3.5, strokeWidth: 2, stroke: r.yuzey }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/**
 * Google arama önerileri (Gemini web araması kullanım şartı: yanıtla birlikte gösterilir).
 * Google'ın hazır HTML'i yalıtılmış çerçevede açılır; betik çalışmaz, bağlantılar yeni sekmede açılır.
 */
function AramaOnerileri({ html }) {
  const belge = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<meta name="color-scheme" content="light dark"><style>body{margin:0;background:transparent}</style></head><body>${html}</body></html>`;
  return (
    <iframe title="Google arama önerileri" srcDoc={belge} sandbox="allow-popups allow-popups-to-escape-sandbox"
      className="mt-2 h-[58px] w-full rounded-md border-0" loading="lazy" />
  );
}

// Web adresleri (asistanın kaynakları) yeni sekmede açılır; sondaki noktalama bağlantıya dahil edilmez.
const ADRES = /(https?:\/\/[^\s<>"'()]*[^\s<>"'().,;:!?])/;
const KALIN = /\*\*([^*\n]+)\*\*/;

// [başlık](adres) biçimindeki kaynaklar başlığıyla gösterilir (Google yönlendirme adresleri uzun)
const MD_BAGLANTI = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/;

function Baglantili({ metin }) {
  const p = metin.split(MD_BAGLANTI);
  if (p.length === 1) return <DuzBaglantili metin={metin} />;
  const sonuc = [];
  for (let i = 0; i < p.length; i += 3) {
    if (p[i]) sonuc.push(<DuzBaglantili key={i} metin={p[i]} />);
    if (i + 2 < p.length) {
      sonuc.push(
        <a key={`b${i}`} href={p[i + 2]} target="_blank" rel="noopener noreferrer"
          className="text-bilgi underline decoration-bilgi/40 underline-offset-2 hover:decoration-bilgi">
          {p[i + 1]}
        </a>
      );
    }
  }
  return sonuc;
}

function DuzBaglantili({ metin }) {
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
      <Link key={i} to={`/cihaz/${p}`}
        className="rounded bg-panel2 px-1 font-mono text-xs text-metin ring-1 ring-cizgi hover:ring-soluk/50">
        {p}
      </Link>
    ) : <span key={i}>{p}</span>
  );
}
