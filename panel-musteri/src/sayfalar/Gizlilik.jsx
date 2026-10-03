import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import Logo from "../bilesenler/Logo";
import { kvkkBolumleri, KVKK_SURUM, SIRKET } from "../veri/kvkk";
import { oturumOku } from "../api/oturum";

/**
 * Herkese açık gizlilik sayfası: Aydınlatma Metni, açık rıza metni ve hesap silme.
 * Oturum gerektirmez; mağaza "gizlilik politikası" ve "hesap silme" adresi olarak
 * da verilebilir (…/gizlilik, …/gizlilik#hesap-silme).
 */
export default function Gizlilik() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  const geri = oturumOku() ? "/hesap" : "/giris";

  return (
    <div className="min-h-screen bg-zemin px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link to={geri} className="inline-flex min-h-[44px] items-center gap-1 text-sm text-soluk hover:text-metin">
            <ChevronLeft size={16} /> {oturumOku() ? "Hesabım" : "Giriş"}
          </Link>
          <Logo boyut={32} zeminli={false} renk="rgb(var(--metin))" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Gizlilik ve kişisel veriler</h1>
        <p className="mt-1 text-xs text-sonuk">{SIRKET.unvan} · metin sürümü {KVKK_SURUM}</p>

        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Bölümler">
          {kvkkBolumleri().map((b) => (
            <a key={b.id} href={`#${b.id}`} className="cip-pasif rounded-full">{b.baslik.replace(/ \(.*\)$/, "")}</a>
          ))}
        </nav>

        {kvkkBolumleri().map((b) => (
          <section key={b.id} id={b.id} className="mt-6 scroll-mt-4 rounded-xl border border-cizgi bg-panel p-5">
            <h2 className="text-base font-semibold">{b.baslik}</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-soluk">
              {b.paragraflar.map((p, i) => typeof p === "string" ? (
                <p key={i}><Kalin metin={p} /></p>
              ) : (
                <ul key={i} className="list-disc space-y-1 pl-5 marker:text-sonuk">
                  {p.liste.map((s) => <li key={s}><Kalin metin={s} /></li>)}
                </ul>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Kalin({ metin }) {
  return metin.split(/\*\*([^*]+)\*\*/).map((p, i) =>
    i % 2 ? <strong key={i} className="font-medium text-metin">{p}</strong> : p);
}
