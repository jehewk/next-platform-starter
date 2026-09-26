import { useState } from "react";
import { Kart, Olcum, OlcumSeridi, SayfaBasligi } from "../bilesenler/Kart";
import { Rozet } from "../bilesenler/Rozet";
import { SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import { useVeri } from "../api/useVeri";
import { partiListesi, cihazListesi } from "../api/servis";
import { DURUM_ADI, durumRengi, tarihTR, sayi } from "../veri/yardimci";

export default function Uretim() {
  const [secili, setSecili] = useState(null);
  const { veri: partiler, yukleniyor, hata, yenile } = useVeri(partiListesi);
  const { veri: cihazlar } = useVeri(cihazListesi);

  if (yukleniyor) return <SatirIskelet satir={5} />;
  if (hata) return <HataKutusu hata={hata} yenile={yenile} />;

  const PARTILER = partiler;
  const CIHAZLAR = cihazlar || [];
  const toplam  = PARTILER.reduce((t, p) => t + p.adet, 0);
  const sevk    = PARTILER.reduce((t, p) => t + p.sevk, 0);
  const kurulu  = PARTILER.reduce((t, p) => t + p.kurulu, 0);
  const depoda  = toplam - sevk;
  const arizali = PARTILER.reduce((t, p) => t + p.arizali, 0);

  return (
    <div className="space-y-5">
      <SayfaBasligi baslik="Üretim"
        aciklama={<>Üretilen, sevk edilen, depoda bekleyen ve sahada çalışan ürünler — parti bazında.</>} />

      <OlcumSeridi sutun={5}>
        <Olcum etiket="Üretilen" deger={sayi(toplam)} />
        <Olcum etiket="Sevk edilen" deger={sayi(sevk)} />
        <Olcum etiket="Depoda" deger={sayi(depoda)} />
        <Olcum etiket="Sahada kurulu" deger={sayi(kurulu)} />
        <Olcum etiket="Arızalı" deger={arizali} vurgu={arizali ? "text-kritik" : "text-metin"} />
      </OlcumSeridi>

      {/* parti tablosu */}
      <Kart
        baslik="Üretim Partileri"
        ustBilgi={<span className="text-xs text-soluk">{PARTILER.length} parti</span>}
        cocuk={
          <div className="overflow-x-auto">
            <table className="tablo w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  <th>Parti</th>
                  <th>Tip</th>
                  <th>Tarih</th>
                  <th className="!text-right">Üretilen</th>
                  <th className="!text-right">Sevk</th>
                  <th className="!text-right">Depoda</th>
                  <th className="!text-right">Kurulu</th>
                  <th className="!text-right">Arıza oranı</th>
                </tr>
              </thead>
              <tbody>
                {PARTILER.map((p) => {
                  const oran = p.kurulu ? (p.arizali / p.kurulu) * 100 : 0;
                  const yuksek = oran > 8;
                  return (
                    <tr key={p.kod}
                      onClick={() => setSecili(secili === p.kod ? null : p.kod)}
                      className="cursor-pointer">
                      <td className="px-4 py-3 font-mono text-xs">{p.kod}</td>
                      <td className="px-4 py-3 text-xs text-soluk">
                        {p.tip === "aku" ? "Akü" : "İnverter"}
                      </td>
                      <td className="px-4 py-3 text-xs text-sonuk">{tarihTR(p.tarih)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{p.adet}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{p.sevk}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{p.adet - p.sevk}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{p.kurulu}</td>
                      <td className={`px-4 py-3 text-right font-mono text-xs ${
                        yuksek ? "text-kritik" : oran > 0 ? "text-uyari" : "text-sonuk"}`}>
                        {p.kurulu ? `%${oran.toFixed(1)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        }
      />

      {/* seçili parti detayı */}
      {secili && (
        <Kart
          baslik={`Parti ${secili} — Cihazlar`}
          ustBilgi={
            <button onClick={() => setSecili(null)} className="text-xs text-soluk hover:text-metin">
              kapat ×
            </button>
          }
          cocuk={
            <ParticCihazlar parti={secili} hepsi={CIHAZLAR} />
          }
        />
      )}

      {/* kurulum akisi — BLE ile eslestirme */}
      <Kart
        baslik="Kurulum Akışı"
        cocuk={
          <div className="grid gap-px bg-cizgi md:grid-cols-3">
            <div className="bg-panel p-5">
              <div className="mb-2.5 font-mono text-xs text-sonuk">01</div>
              <h3 className="text-sm font-medium">Üretimde kayıt</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-soluk">
                Her cihaz hatta benzersiz seri numarası ve cihaz anahtarı alır.
                Bu değerler karta yazılır, panelde "üretildi" durumunda görünür.
              </p>
            </div>
            <div className="bg-panel p-5">
              <div className="mb-2.5 font-mono text-xs text-sonuk">02</div>
              <h3 className="text-sm font-medium">Depo ve sevkiyat</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-soluk">
                Seri numarası okutularak depo giriş-çıkışı kaydedilir. Hangi
                partinin nereye sevk edildiği kayıt altında tutulur.
              </p>
            </div>
            <div className="bg-panel p-5">
              <div className="mb-2.5 font-mono text-xs text-sonuk">03</div>
              <h3 className="text-sm font-medium">Sahada eşleştirme</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-soluk">
                Cihaz açılınca Bluetooth yayını yapar (Dennis_XXXX). Kurulumcu
                uygulamadan bağlanır, Wi-Fi bilgisi ve eşleşme kodunu gönderir;
                cihaz buluta bağlanıp müşteriye tanımlanır.
              </p>
            </div>
          </div>
        }
      />
    </div>
  );
}

function ParticCihazlar({ parti, hepsi }) {
  const liste = hepsi.filter((c) => c.parti === parti);
  if (liste.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-sm text-soluk">Bu partiye ait cihaz kaydı bulunamadı.</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-cizgi">
      {liste.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs">{c.id}</span>
            <span className="text-xs text-sonuk">{c.model}</span>
          </div>
          <Rozet durum={durumRengi(c.durum)} cocuk={DURUM_ADI[c.durum]} />
        </div>
      ))}
    </div>
  );
}
