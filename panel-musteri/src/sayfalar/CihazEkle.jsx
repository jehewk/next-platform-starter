import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ChevronLeft, Bluetooth, Wifi, WifiOff, Loader2, CheckCircle2, AlertTriangle, RefreshCw, Lock } from "lucide-react";
import { useVeri } from "../api/useVeri";
import { musteriListesi, kurulumBaslat } from "../api/servis";
import { cihazaBaglan, durumDinle, bilgiGonder, aglariTara, baglantiyiKapat, bleDestekli } from "../api/ble";
import { Iskelet } from "../bilesenler/VeriDurumu";

// Firmware'in bildirdiği durum -> kullanıcıya gösterilecek metin
const DURUM_METNI = {
  baglaniyor: "Cihaz bilgileri aldı…",
  wifi: "Cihaz Wi-Fi'ye bağlanıyor…",
  kayit: "Cihaz sisteme kaydediliyor…",
  tamam: "Kurulum tamamlandı!",
};

// Sinyal gücü (dBm) -> 0..3 çubuk
function cubuk(guc) {
  if (guc >= -55) return 3;
  if (guc >= -70) return 2;
  if (guc >= -82) return 1;
  return 0;
}

export default function CihazEkle() {
  const git = useNavigate();
  const { veri: musteriler, yukleniyor } = useVeri(musteriListesi);
  const musteriId = musteriler?.[0]?.id;

  const [asama, setAsama] = useState("baslangic"); // baslangic | tarama | secim | calisiyor | tamam | hata
  const [aglar, setAglar] = useState([]);           // [{ad, guc}]
  const [ssid, setSsid] = useState("");
  const [sifre, setSifre] = useState("");
  const [durum, setDurum] = useState("");
  const [hata, setHata] = useState("");

  const idRef = useRef(null);
  const bittiRef = useRef(false);

  const destekli = bleDestekli();

  // Cihazdan gelen tüm bildirimleri işleyen tek nokta
  function bildirimIsle(m) {
    if (!m?.durum) return;
    if (m.durum === "ag" && m.ad) {
      setAglar((onceki) => {
        const v = onceki.filter((x) => x.ad !== m.ad);
        v.push({ ad: m.ad, guc: m.guc ?? -100 });
        return v.sort((a, b) => b.guc - a.guc);
      });
      return;
    }
    if (m.durum === "aglar_son") { setAsama("secim"); return; }
    if (DURUM_METNI[m.durum]) setDurum(DURUM_METNI[m.durum]);
    if (m.durum === "tamam" && !bittiRef.current) {
      bittiRef.current = true; setAsama("tamam"); baglantiyiKapat(idRef.current);
    }
    if (m.durum === "hata" && !bittiRef.current) {
      bittiRef.current = true;
      setHata(m.mesaj || "Cihaz kurulumu tamamlayamadı.");
      setAsama("hata"); baglantiyiKapat(idRef.current);
    }
  }

  // 1) Cihazı bul, bağlan, ağları tara
  async function cihaziBul() {
    setHata(""); setAglar([]); setAsama("tarama"); setDurum("Cihaz aranıyor…");
    bittiRef.current = false;
    try {
      const id = await cihazaBaglan(() => { /* koparsa akış biter */ });
      idRef.current = id;
      setDurum("Bağlanıldı, Wi-Fi ağları taranıyor…");
      await durumDinle(id, bildirimIsle);
      await aglariTara(id);
      // Güvenlik ağı: 15 sn içinde liste gelmezse yine de seçime geç (elle giriş)
      setTimeout(() => setAsama((a) => (a === "tarama" ? "secim" : a)), 15000);
    } catch (err) {
      if (idRef.current) baglantiyiKapat(idRef.current);
      setHata(err?.message || "Bağlantı kurulamadı. Bluetooth'un açık olduğundan emin olun.");
      setAsama("hata");
    }
  }

  // 2) Seçilen ağ + şifre + eşleşme kodunu cihaza gönder
  async function kur(e) {
    e.preventDefault();
    if (!ssid.trim()) { setHata("Bir Wi-Fi ağı seçin veya adını girin."); return; }
    if (!musteriId) { setHata("Hesap bilgisi yüklenemedi; tekrar deneyin."); return; }
    setHata(""); setAsama("calisiyor"); setDurum("Eşleşme kodu alınıyor…");
    try {
      const { kod } = await kurulumBaslat(musteriId);
      setDurum("Cihaza Wi-Fi bilgisi gönderiliyor…");
      await bilgiGonder(idRef.current, ssid.trim(), sifre, kod);
      setTimeout(() => {
        setAsama((a) => {
          if (a === "calisiyor") {
            setHata("Cihazdan yanıt gelmedi. Wi-Fi şifresini kontrol edip tekrar deneyin.");
            baglantiyiKapat(idRef.current);
            return "hata";
          }
          return a;
        });
      }, 45000);
    } catch (err) {
      setHata(err?.message || "Gönderilemedi; tekrar deneyin.");
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
      ) : asama === "baslangic" || asama === "tarama" ? (
        <div className="space-y-4 rounded-xl border border-cizgi bg-panel p-5">
          <p className="text-sm text-soluk">
            Önce cihazı bulup bağlanacağız, sonra cihazın gördüğü Wi-Fi ağlarını listeleyeceğiz.
          </p>
          {asama === "tarama" && (
            <div className="flex items-center gap-2 rounded-md border border-cizgi bg-panel2 px-3 py-2.5 text-sm">
              <Loader2 size={15} className="animate-spin shrink-0" /> {durum || "İşleniyor…"}
            </div>
          )}
          {hata && (
            <p className="flex items-start gap-2 rounded-md border border-kritik/30 bg-kritik/10 px-3 py-2 text-xs text-kritik">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {hata}
            </p>
          )}
          <button onClick={cihaziBul} disabled={asama === "tarama"} className="dugme-ana min-h-[44px] w-full">
            {asama === "tarama" ? <Loader2 size={15} className="animate-spin" /> : <Bluetooth size={15} />}
            Cihazı bul
          </button>
        </div>
      ) : (
        // secim | calisiyor | hata
        <form onSubmit={kur} className="space-y-4 rounded-xl border border-cizgi bg-panel p-5">
          <div className="flex items-center justify-between">
            <span className="etiket flex items-center gap-1.5"><Wifi size={14} /> Wi-Fi ağınızı seçin</span>
            <button type="button" onClick={cihaziBul} disabled={asama === "calisiyor"}
              className="inline-flex items-center gap-1 text-xs text-soluk hover:text-metin">
              <RefreshCw size={13} /> Yenile
            </button>
          </div>

          {aglar.length > 0 ? (
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {aglar.map((a) => (
                <button type="button" key={a.ad} onClick={() => setSsid(a.ad)} disabled={asama === "calisiyor"}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-sm ${
                    ssid === a.ad ? "border-vurgu bg-vurgu/10 text-metin" : "border-cizgi bg-panel2 text-metin active:bg-panel"}`}>
                  <span className="flex items-center gap-2 truncate">
                    <Wifi size={15} className={cubuk(a.guc) === 0 ? "text-sonuk" : "text-soluk"} /> {a.ad}
                  </span>
                  {ssid === a.ad && <CheckCircle2 size={16} className="shrink-0 text-vurgu" />}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-uyari/30 bg-uyari/10 px-3 py-3 text-xs">
              <p className="flex items-center gap-1.5 font-medium"><WifiOff size={14} /> Cihaz hiç 2.4 GHz ağ görmedi.</p>
              <p className="mt-1 text-soluk">
                Cihaz yalnızca <b>2.4 GHz</b> Wi-Fi'ye bağlanır (5 GHz'i görmez). Modeminizde 2.4 GHz'i açıp
                "Yenile"ye basın ya da ağ adını elle girin.
              </p>
            </div>
          )}

          <label className="block">
            <span className="etiket">Wi-Fi adı (seçilen / elle)</span>
            <input value={ssid} onChange={(e) => setSsid(e.target.value)} disabled={asama === "calisiyor"}
              autoComplete="off" className="girdi" placeholder="Ağ seçin ya da yazın" />
          </label>
          <label className="block">
            <span className="etiket flex items-center gap-1.5"><Lock size={13} /> Wi-Fi şifresi</span>
            <input type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} disabled={asama === "calisiyor"}
              autoComplete="off" className="girdi" placeholder="••••••••" />
          </label>

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
            {asama === "calisiyor" ? <Loader2 size={15} className="animate-spin" /> : <Wifi size={15} />}
            {asama === "calisiyor" ? "Kuruluyor…" : "Bağlan ve kur"}
          </button>
        </form>
      )}
    </div>
  );
}
