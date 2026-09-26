import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, Search, Bell, MessageSquare, AlertTriangle, UserPlus, ShieldCheck } from "lucide-react";
import { GRUPLAR } from "./Kenar";
import { useVeri } from "../api/useVeri";
import { mudahaleKuyrugu, basvuruListesi, garantiListesi } from "../api/servis";
import { useAyarlar } from "../api/ayarlar";
import { oturumOku } from "../api/oturum";
import { ESIK } from "../veri/yardimci";

const DETAY_ADI = { aku: "Akü", inverter: "İnverter", musteri: "Müşteri" };

function sayfaAdi(yol) {
  for (const g of GRUPLAR) {
    for (const b of g.baglar) {
      if (b.yol === "/" ? yol === "/" : yol.startsWith(b.yol)) return { grup: g.ad, ad: b.ad };
    }
  }
  const kok = yol.split("/")[1];
  return DETAY_ADI[kok] ? { grup: "Detay", ad: DETAY_ADI[kok] } : { grup: "", ad: "" };
}

export default function UstCubuk({ menuAc, paletAc, sohbetAc }) {
  const { pathname } = useLocation();
  const { grup, ad } = sayfaAdi(pathname);
  const demo = oturumOku()?.demo;

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-cizgi bg-zemin/80 px-4 backdrop-blur lg:px-6">
      <button onClick={menuAc} aria-label="Menüyü aç" className="dugme-hayalet -ml-2 p-2 lg:hidden">
        <Menu size={18} />
      </button>

      <nav aria-label="Konum" className="flex min-w-0 items-center gap-2 text-sm">
        {grup && <span className="hidden text-sonuk sm:inline">{grup}</span>}
        {grup && <span className="hidden text-cizgi sm:inline">/</span>}
        <span className="truncate font-medium">{ad}</span>
        {demo && (
          <span className="ml-1 rounded-full bg-uyari/10 px-2 py-0.5 text-2xs font-medium text-uyari ring-1 ring-inset ring-uyari/25">
            Demo verisi
          </span>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <button onClick={paletAc}
          className="hidden h-8 w-60 items-center gap-2 rounded-md border border-cizgi bg-panel px-2.5 text-sm text-sonuk
                     transition-colors hover:border-soluk/40 hover:text-soluk md:flex">
          <Search size={14} />
          <span className="flex-1 text-left">Ara…</span>
          <kbd className="rounded border border-cizgi bg-panel2 px-1.5 font-mono text-2xs">⌘K</kbd>
        </button>
        <button onClick={paletAc} aria-label="Ara" className="dugme-hayalet p-2 md:hidden">
          <Search size={17} />
        </button>
        <Bildirimler />
        <button onClick={sohbetAc} aria-label="Sohbeti aç" title="Sohbet (⌘J)" className="dugme-hayalet p-2">
          <MessageSquare size={17} />
        </button>
      </div>
    </header>
  );
}

function Bildirimler() {
  const { ayarlar } = useAyarlar();
  const [acik, setAcik] = useState(false);
  const ref = useRef(null);
  const { veri: isler } = useVeri(mudahaleKuyrugu);
  const { veri: basvurular } = useVeri(basvuruListesi);
  const { veri: talepler } = useVeri(garantiListesi);

  useEffect(() => {
    if (!acik) return;
    const f = (e) => !ref.current?.contains(e.target) && setAcik(false);
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [acik]);

  const liste = [
    ...(ayarlar.bildirimKritik ? (isler || []).filter((i) => i.saglik < ESIK.kritik).map((i) => ({
      anahtar: `k-${i.id}`, ikon: AlertTriangle, renk: "text-kritik",
      baslik: `${i.id} kritik`, alt: `${i.bilesen} · ${i.musteriAd}`,
      yol: i.tip === "aku" ? `/aku/${i.id}` : `/inverter/${i.id}`,
    })) : []),
    ...(ayarlar.bildirimBasvuru ? (basvurular || []).map((b) => ({
      anahtar: `b-${b.id}`, ikon: UserPlus, renk: "text-bilgi",
      baslik: "Yeni kayıt başvurusu", alt: `${b.ad} · ${b.il}`, yol: "/basvurular",
    })) : []),
    ...(ayarlar.bildirimGaranti ? (talepler || []).filter((t) => t.durum === "inceleniyor").map((t) => ({
      anahtar: `g-${t.id}`, ikon: ShieldCheck, renk: "text-uyari",
      baslik: `Garanti talebi ${t.id}`, alt: `${t.cihazId} · ${t.aciklama}`, yol: "/garanti",
    })) : []),
  ];

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAcik((a) => !a)} aria-label="Bildirimler" className="dugme-hayalet relative p-2">
        <Bell size={17} />
        {liste.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-kritik ring-2 ring-zemin" />}
      </button>
      {acik && (
        <div className="absolute right-0 top-full mt-2 w-[min(360px,calc(100vw-2rem))] animate-belir overflow-hidden rounded-lg border border-cizgi bg-panel shadow-yuzen">
          <div className="flex items-center justify-between border-b border-cizgi px-4 py-2.5">
            <span className="text-sm font-medium">Bildirimler</span>
            <span className="text-xs text-sonuk">{liste.length}</span>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {liste.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-sonuk">Yeni bildirim yok.</p>
            ) : liste.map((b) => (
              <Link key={b.anahtar} to={b.yol} onClick={() => setAcik(false)}
                className="flex gap-3 border-b border-cizgi px-4 py-3 last:border-b-0 hover:bg-panel2">
                <b.ikon size={15} className={`mt-0.5 shrink-0 ${b.renk}`} />
                <span className="min-w-0">
                  <span className="block text-sm">{b.baslik}</span>
                  <span className="block truncate text-xs text-sonuk">{b.alt}</span>
                </span>
              </Link>
            ))}
          </div>
          <Link to="/ayarlar" onClick={() => setAcik(false)}
            className="block border-t border-cizgi px-4 py-2 text-center text-xs text-soluk hover:text-metin">
            Bildirim tercihleri
          </Link>
        </div>
      )}
    </div>
  );
}
