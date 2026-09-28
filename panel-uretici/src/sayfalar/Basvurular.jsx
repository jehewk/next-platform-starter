import { useState } from "react";
import { useToast } from "../bilesenler/Toast";
import { Kart, SayfaBasligi, Bos } from "../bilesenler/Kart";
import { SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useVeri } from "../api/useVeri";
import { basvuruListesi, basvuruKarar } from "../api/servis";
import { tarihTR } from "../veri/yardimci";

const URUN_ADI = { aku: "Akü", inverter: "İnverter", ikisi: "Akü + İnverter" };

/**
 * Kayıt başvuruları.
 *
 * Müşteri kendi kaydını oluşturur ama hesabı onaylanana kadar giriş
 * yapamaz. Burada başvuru bilgileri görülür ve onaylanır/reddedilir.
 * Onaylanınca kişi kendi belirlediği şifreyle girebilir; reddedilince
 * hem başvuru hem açılan hesap tamamen silinir.
 */
export default function Basvurular() {
  const { veri: liste, yukleniyor, hata, yenile } = useVeri(basvuruListesi);
  const [islemde, setIslemde] = useState(null);
  const bildir = useToast();

  async function karar(id, ad, secim) {
    if (secim === "ret" && !confirm(`${ad} başvurusu reddedilecek ve kaydı silinecek. Emin misiniz?`)) return;
    setIslemde(id);
    try {
      await basvuruKarar(id, secim);
      bildir(secim === "onay" ? `${ad} onaylandı; artık giriş yapabilir.` : `${ad} başvurusu reddedildi.`);
      yenile();
    } catch (e) {
      bildir(e.message, "kotu");
    } finally {
      setIslemde(null);
    }
  }

  return (
    <div className="space-y-5">
      <SayfaBasligi baslik="Kayıt başvuruları"
        aciklama="Kayıtlar otomatik onaylanır; burada yalnızca otomatik onayı tamamlanamayanlar bekler. Onaylanana kadar giriş yapamazlar." />


      {yukleniyor ? (
        <SatirIskelet satir={3} />
      ) : hata ? (
        <HataKutusu hata={hata} yenile={yenile} />
      ) : liste.length === 0 ? (
        <Kart cocuk={
          <Bos metin="Bekleyen başvuru yok." alt="Yeni müşteriler otomatik onaylanıp doğrudan Müşteriler listesine düşer." />
        } />
      ) : (
        <Kart
          baslik="Bekleyen başvurular"
          ustBilgi={<span className="text-xs text-soluk">{liste.length} kayıt</span>}
          cocuk={
            <div className="divide-y divide-cizgi">
              {liste.map((b) => (
                <div key={b.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2.5">
                        <span className="text-sm font-medium">{b.ad}</span>
                        <span className="text-xs text-sonuk">{tarihTR(b.tarih)}</span>
                      </div>
                      <div className="mt-1.5 grid gap-x-6 gap-y-1 text-xs text-soluk sm:grid-cols-2">
                        <span>{b.eposta}</span>
                        <span>{b.telefon}</span>
                        <span>{b.ilce}, {b.il} {b.postaKodu}</span>
                        <span>{URUN_ADI[b.urun] || b.urun}</span>
                      </div>
                      <p className="mt-1 text-xs text-sonuk">{b.adres}</p>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => karar(b.id, b.ad, "onay")}
                        disabled={islemde === b.id}
                        className="dugme-ana text-xs">
                        {islemde === b.id ? "…" : "Onayla"}
                      </button>
                      <button
                        onClick={() => karar(b.id, b.ad, "ret")}
                        disabled={islemde === b.id}
                        className="dugme-ikincil text-xs hover:text-kritik">
                        Reddet
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          }
        />
      )}
    </div>
  );
}
