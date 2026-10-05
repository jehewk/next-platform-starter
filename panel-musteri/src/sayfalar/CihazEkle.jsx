import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ChevronLeft, Bluetooth, Wifi, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useVeri } from "../api/useVeri";
import { musteriListesi, kurulumBaslat } from "../api/servis";
import { cihazaBaglan, durumDinle, bilgiGonder, baglantiyiKapat, bleDestekli } from "../api/ble";
import { Iskelet } from "../bilesenler/VeriDurumu";

// Firmware'in bildirdiği durum -> kullanıcıya gösterilecek metin
const DURUM_METNI = {
  baglaniyor: "Cihaz bilgileri aldı…",
  wifi: "Cihaz Wi-Fi'ye bağlanıyor…",
  kayit: "Cihaz sisteme kaydediliyor…",
  tamam: "Kurulum tamamlandı!",
  hata: "Bir sorun oluştu.",
};

export default function CihazEkle() {
  const git = useNavigate();
  const { veri: musteriler, yukleniyor } = useVeri(musteriListesi);
  const musteriId = musteriler?.[0]?.id;

  const [ssid, setSsid] = useState("");
  const [sifre, setSifre] = useState("");
  const [asama, setAsama] = useState("form");   // form | calisiyor | tamam | hata
  const [durum, setDurum] = useState("");
  const [hata, setHata] = useState("");

  const destekli = bleDestekli();

  async function kur(e) {
    e.preventDefault();
    if (!ssid.trim()) { setHata("Wi-Fi adını girin."); return; }
    if (!musteriId) { setHata("Hesap bilgisi yüklenemedi; tekrar deneyin."); return; }
    setHata("");
    setAsama("calisiyor");
    setDurum("Cihaz aranıyor…");
    let id = null;
    try {
      // 1) BLE: cihazı seç ve bağlan (OS seçicisi açılır)
      id = await cihazaBaglan(() => { /* koparsa akış zaten biter */ });
      setDurum("Cihaza bağlanıldı, hazırlanıyor…");

      // 2) Cihazın durum bildirimlerini dinle
      let bitti = false;
      await durumDinle(id, (m) => {
        if (m?.durum && DURUM_METNI[m.durum]) setDurum(DURUM_METNI[m.durum]);
        if (m?.durum === "tamam" && !bitti) { bitti = true; setAsama("tamam"); baglantiyiKapat(id); }
        if (m?.durum === "hata" && !bitti) {
          bitti = true; setHata(m.mesaj || "Cihaz kurulumu tamamlayamadı."); setAsama("hata"); baglantiyiKapat(id);
        }
      });

      // 3) Eşleşme kodunu al ve Wi-Fi + kodu cihaza gönder
      const { kod } = await kurulumBaslat(musteriId);
      setDurum("Cihaza Wi-Fi bilgisi gönderiliyor…");
      await bilgiGonder(id, ssid.trim(), sifre, kod);

      // 4) Güvenlik ağı: cihaz 60 sn içinde "tamam" demezse uyar
      setTimeout(() => {
        setAsama((a) => {
          if (a === "calisiyor") {
            setHata("Cihazdan yanıt gelmedi. Wi-Fi şifresini ve cihazın menzilde olduğunu kontrol edip tekrar deneyin.");
            baglantiyiKapat(id);
            return "hata";
          }
          return a;
        });
      }, 60000);
    } catch (err) {
      if (id) baglantiyiKapat(id);
      setHata(err?.message || "Bağlantı kurulamadı. Bluetooth'un açık olduğundan emin olun.");
      setAsama("hata");
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <Link to="/cihazlar" className="inline-flex items-center gap-1 text-sm text-soluk hover:text-metin">
        <ChevronLeft size={16} /> Cihazlarım
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Bluetooth size={20} /> Cihaz ekle
        </h1>
        <p className="mt-1 text-sm text-soluk">
          Cihazınızı Bluetooth ile bulup Wi-Fi'nize bağlayalım. Cihazın açık ve yakında olduğundan emin olun.
        </p>
      </div>

      {yukleniyor ? <Iskelet satir={1} yukseklik="h-40" /> : !destekli ? (
        <div className="rounded-xl border border-uyari/30 bg-uyari/10 p-4 text-sm">
          Bu cihaz/ tarayıcı Bluetooth kurulumunu desteklemiyor. Lütfen Dennis Energy
          <b> uygulamasını</b> (App Store / Google Play) kullanın ya da Android'de Chrome ile açın.
        </div>
      ) : asama === "tamam" ? (
        <div className="rounded-xl border border-cizgi bg-panel p-6 text-center">
          <CheckCircle2 size={36} className="mx-auto text-saglikli" />
          <h2 className="mt-4 text-lg font-semibold">Cihazınız eklendi</h2>
          <p className="mt-2 text-sm text-soluk">Birkaç dakika içinde ölçümler gelmeye başlayacak.</p>
          <button onClick={() => git("/cihazlar")} className="dugme-ana mt-6 w-full">Cihazlarıma dön</button>
        </div>
      ) : (
        <form onSubmit={kur} className="space-y-4 rounded-xl border border-cizgi bg-panel p-5">
          <label className="block">
            <span className="etiket flex items-center gap-1.5"><Wifi size={14} /> Wi-Fi adı (SSID)</span>
            <input value={ssid} onChange={(e) => setSsid(e.target.value)} disabled={asama === "calisiyor"}
              autoComplete="off" className="girdi" placeholder="EvWifi" />
          </label>
          <label className="block">
            <span className="etiket">Wi-Fi şifresi</span>
            <input type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} disabled={asama === "calisiyor"}
              autoComplete="off" className="girdi" placeholder="••••••••" />
          </label>
          <p className="text-xs text-sonuk">
            Cihaz yalnızca 2.4 GHz Wi-Fi'ye bağlanır (çoğu ev Wi-Fi'si uyumludur).
          </p>

          {asama === "calisiyor" && (
            <div className="flex items-center gap-2 rounded-md border border-cizgi bg-panel2 px-3 py-2.5 text-sm">
              <Loader2 size={15} className="animate-spin shrink-0" /> {durum || "İşleniyor…"}
            </div>
          )}
          {hata && (
            <p className="flex items-start gap-2 rounded-md border border-kritik/30 bg-kritik/10 px-3 py-2 text-xs text-kritik">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {hata}
            </p>
          )}

          <button type="submit" disabled={asama === "calisiyor"} className="dugme-ana min-h-[44px] w-full">
            {asama === "calisiyor" ? <Loader2 size={15} className="animate-spin" /> : <Bluetooth size={15} />}
            {asama === "hata" ? "Tekrar dene" : "Bluetooth ile bağlan ve kur"}
          </button>
        </form>
      )}
    </div>
  );
}
