import { useNavigate } from "react-router-dom";
import { LogOut, Moon, Sun, Monitor, MapPin, Phone, Mail } from "lucide-react";
import { Iskelet } from "../bilesenler/VeriDurumu";
import { useVeri } from "../api/useVeri";
import { musteriListesi } from "../api/servis";
import { oturumOku, oturumSil } from "../api/oturum";
import { useAyarlar } from "../api/ayarlar";

const SURUM = import.meta.env.VITE_SURUM || "1.0.0";
// App Store kuralı 5.1.1(v): hesap açılabilen uygulamada hesap silme yolu olmalı.
const HESAP_SILME = import.meta.env.VITE_HESAP_SILME_URL;

export default function Hesap() {
  const git = useNavigate();
  const oturum = oturumOku();
  const { ayarlar, guncelle } = useAyarlar();
  const { veri: musteriler, yukleniyor } = useVeri(musteriListesi);
  const p = musteriler?.[0];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Hesabım</h1>

      {yukleniyor ? <Iskelet satir={1} yukseklik="h-32" /> : (
        <section className="rounded-xl border border-cizgi bg-panel p-5">
          <p className="text-base font-semibold">{p?.ad || oturum?.eposta}</p>
          <div className="mt-3 space-y-2 text-sm text-soluk">
            {p?.adres && <p className="flex gap-2"><MapPin size={15} className="mt-0.5 shrink-0" />{p.adres}, {p.ilce}/{p.il}</p>}
            {p?.telefon && <p className="flex gap-2"><Phone size={15} className="mt-0.5 shrink-0" />{p.telefon}</p>}
            <p className="flex gap-2"><Mail size={15} className="mt-0.5 shrink-0" />{p?.email || oturum?.eposta}</p>
          </div>
          <p className="mt-3 text-xs text-sonuk">Bilgileriniz değiştiyse Destek sekmesinden bize bildirin.</p>
        </section>
      )}

      <section className="rounded-xl border border-cizgi bg-panel p-5">
        <p className="text-sm font-medium">Görünüm</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[{ id: "koyu", ad: "Koyu", ikon: Moon }, { id: "acik", ad: "Açık", ikon: Sun }, { id: "sistem", ad: "Sistem", ikon: Monitor }].map((t) => (
            <button key={t.id} onClick={() => guncelle({ tema: t.id })} aria-pressed={ayarlar.tema === t.id}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border text-sm ${
                ayarlar.tema === t.id ? "border-metin/40 bg-panel2 text-metin" : "border-cizgi text-soluk"}`}>
              <t.ikon size={15} /> {t.ad}
            </button>
          ))}
        </div>
      </section>

      <button onClick={() => { oturumSil(); git("/giris", { replace: true }); }} className="dugme-tehlike min-h-[48px] w-full">
        <LogOut size={16} /> Çıkış yap
      </button>
      {HESAP_SILME && (
        <a href={HESAP_SILME} target="_blank" rel="noreferrer" className="block text-center text-sm text-sonuk underline underline-offset-4">
          Hesabımı ve verilerimi sil
        </a>
      )}
      <p className="text-center text-xs text-sonuk">Dennis Energy · sürüm {SURUM}</p>
    </div>
  );
}
