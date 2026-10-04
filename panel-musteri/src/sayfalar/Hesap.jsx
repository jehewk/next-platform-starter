import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LogOut, Moon, Sun, Monitor, MapPin, Phone, Mail, Bell, Sparkles, ShieldCheck, Trash2, Loader2, ChevronRight } from "lucide-react";
import Modal from "../bilesenler/Modal";
import { api } from "../api/istemci";
import { useBildirim } from "../api/bildirim";
import { useRiza } from "../api/riza";
import { Iskelet } from "../bilesenler/VeriDurumu";
import { useVeri } from "../api/useVeri";
import { musteriListesi, profilGuncelle } from "../api/servis";
import KonumSecici from "../bilesenler/KonumSecici";
import { oturumOku, oturumSil } from "../api/oturum";
import { useAyarlar } from "../api/ayarlar";

const SURUM = import.meta.env.VITE_SURUM || "1.0.0";

export default function Hesap() {
  const git = useNavigate();
  const oturum = oturumOku();
  const { ayarlar, guncelle } = useAyarlar();
  const { veri: musteriler, yukleniyor, yenile } = useVeri(musteriListesi);
  const p = musteriler?.[0];
  const [silAcik, setSilAcik] = useState(false);

  // Konum: kayıtlı değer haritaya seed edilir; kullanıcı iğneyi taşıyıp kaydeder.
  const [konum, setKonum] = useState(null);
  const [konumKaydediyor, setKonumKaydediyor] = useState(false);
  const [konumMesaj, setKonumMesaj] = useState("");
  useEffect(() => {
    if (p && p.lat != null && p.lng != null && konum == null) {
      setKonum({ lat: Number(p.lat), lng: Number(p.lng) });
    }
  }, [p, konum]);

  async function konumKaydet() {
    if (!konum) return;
    setKonumKaydediyor(true);
    setKonumMesaj("");
    try {
      await profilGuncelle({ lat: konum.lat, lng: konum.lng });
      setKonumMesaj("Konumunuz kaydedildi; cihazlarınız saha haritasında görünecek.");
      yenile?.();
    } catch (e) {
      setKonumMesaj(e.message || "Konum kaydedilemedi; tekrar deneyin.");
    } finally {
      setKonumKaydediyor(false);
    }
  }

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
          <p className="mt-3 text-xs text-sonuk">Ad, telefon ve e-posta değişikliği için Destek sekmesinden bize bildirin.</p>
        </section>
      )}

      <section className="rounded-xl border border-cizgi bg-panel p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><MapPin size={16} /> Konumum</h2>
        <p className="mt-1 text-xs text-soluk">
          Cihazlarınız üretici ekibinin saha haritasında bu konumda görünür. Haritada evinize
          dokunun ya da “Konumumu bul” ile otomatik seçin.
        </p>
        <div className="mt-3">
          <KonumSecici value={konum} onChange={setKonum} />
        </div>
        <button onClick={konumKaydet} disabled={!konum || konumKaydediyor}
          className="dugme-ana mt-3 min-h-[44px] w-full">
          {konumKaydediyor && <Loader2 size={15} className="animate-spin" />} Konumu kaydet
        </button>
        {konumMesaj && <p className="mt-2 text-xs text-soluk">{konumMesaj}</p>}
      </section>

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

      <Bildirimler />
      <AsistanIzni />

      <Link to="/gizlilik" className="flex min-h-[52px] items-center gap-3 rounded-xl border border-cizgi bg-panel px-5 text-sm">
        <ShieldCheck size={17} className="text-soluk" />
        <span className="flex-1">Gizlilik ve kişisel veriler</span>
        <ChevronRight size={16} className="text-sonuk" />
      </Link>

      <button onClick={() => { oturumSil(); git("/giris", { replace: true }); }} className="dugme-tehlike min-h-[48px] w-full">
        <LogOut size={16} /> Çıkış yap
      </button>
      {/* App Store 5.1.1(v) / KVKK: hesap uygulama içinden silinebilmeli */}
      <button onClick={() => setSilAcik(true)} className="mx-auto flex min-h-[44px] items-center gap-1.5 text-sm text-sonuk underline underline-offset-4 hover:text-kritik">
        <Trash2 size={14} /> Hesabımı ve verilerimi sil
      </button>
      <HesapSil acik={silAcik} kapat={() => setSilAcik(false)} silindi={() => { oturumSil(); git("/giris", { replace: true, state: { mesaj: "Hesabınız ve kişisel verileriniz silindi." } }); }} />
      <p className="text-center text-xs text-sonuk">Dennis Energy · sürüm {SURUM}</p>
    </div>
  );
}

function Satir({ ikon: Ikon, baslik, aciklama, children }) {
  return (
    <section className="rounded-xl border border-cizgi bg-panel p-5">
      <div className="flex items-start gap-3">
        <Ikon size={17} className="mt-0.5 shrink-0 text-soluk" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{baslik}</p>
          {aciklama && <p className="mt-1 text-xs leading-relaxed text-sonuk">{aciklama}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function Anahtar({ acik, degistir, mesgul, etiket }) {
  return (
    <button role="switch" aria-checked={acik} aria-label={etiket} onClick={degistir} disabled={mesgul}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${acik ? "bg-saglikli" : "bg-cizgi"} disabled:opacity-60`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${acik ? "left-[22px]" : "left-0.5"}`} />
      {mesgul && <Loader2 size={12} className="absolute inset-0 m-auto animate-spin text-zemin" />}
    </button>
  );
}

function Bildirimler() {
  const { durum, mesgul, hata, degistir } = useBildirim();
  if (!durum || durum === "yok") return null;
  const aciklama = {
    acik: "Cihazınız veri göndermeyi bırakırsa, ısınırsa ya da kontrol gerektirirse bu cihaza bildirim gelir.",
    kapali: "Cihazınızda önemli bir durum olduğunda bu telefona/bilgisayara bildirim gönderelim.",
    engelli: "Bildirimler tarayıcı ayarlarında engellenmiş. Bu site için bildirimlere izin verip sayfayı yenileyin.",
    "ana-ekran": "iPhone'da bildirim için uygulamayı ana ekrana ekleyin: Safari'de Paylaş → Ana Ekrana Ekle, sonra oradan açın.",
  }[durum];
  return (
    <Satir ikon={Bell} baslik="Bildirimler" aciklama={hata || aciklama}>
      {(durum === "acik" || durum === "kapali") && (
        <Anahtar acik={durum === "acik"} degistir={degistir} mesgul={mesgul} etiket="Bildirimler" />
      )}
    </Satir>
  );
}

function AsistanIzni() {
  const [riza, ayarla] = useRiza();
  return (
    <Satir ikon={Sparkles} baslik="Sohbet asistanı: genel sorular"
      aciklama={riza
        ? "Genel sorularınız ve fotoğraflarınız yanıtlanmak üzere Google'a (ABD) iletilir. İzni dilediğiniz zaman kapatabilirsiniz."
        : "Kapalı: asistan yalnızca sisteminizle ilgili soruları yanıtlar; verileriniz dışarı çıkmaz."}>
      <Anahtar acik={riza} degistir={() => ayarla(!riza)} etiket="Sohbet asistanı genel soru izni" />
    </Satir>
  );
}

function HesapSil({ acik, kapat, silindi }) {
  const [sifre, setSifre] = useState("");
  const [onay, setOnay] = useState(false);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState("");
  const kapatVeSifirla = () => { if (mesgul) return; setSifre(""); setOnay(false); setHata(""); kapat(); };

  async function sil(e) {
    e.preventDefault();
    setMesgul(true); setHata("");
    try {
      await api.post("/de/hesap/sil", { sifre });
      try { localStorage.clear(); sessionStorage.clear(); } catch { /* gizli sekme */ }
      silindi();
    } catch (h) {
      setHata(h.durum === 403 && /Sifre/i.test(h.message) ? "Şifre hatalı." : h.message);
      setMesgul(false);
    }
  }

  return (
    <Modal acik={acik} kapat={kapatVeSifirla} baslik="Hesabımı ve verilerimi sil"
      aciklama="Bu işlem geri alınamaz.">
      <form onSubmit={sil} className="space-y-4 text-sm">
        <ul className="list-disc space-y-1 pl-5 text-soluk marker:text-sonuk">
          <li>Giriş hesabınız, adınız, adresiniz, telefonunuz ve e-postanız silinir.</li>
          <li>Cihazlarınız hesabınızdan ayrılır; ölçümler en geç 180 gün içinde kendiliğinden silinir.</li>
          <li>Garanti ve fatura kayıtları yasal süre boyunca saklanır.</li>
        </ul>
        <div>
          <label htmlFor="sil-sifre" className="etiket">Onaylamak için şifreniz</label>
          <input id="sil-sifre" type="password" required autoComplete="current-password" value={sifre}
            onChange={(e) => setSifre(e.target.value)} className="girdi" />
        </div>
        <label className="flex cursor-pointer gap-3 text-xs text-soluk">
          <input type="checkbox" checked={onay} onChange={(e) => setOnay(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
          Hesabımın ve kişisel verilerimin kalıcı olarak silineceğini anladım.
        </label>
        {hata && <p role="alert" className="rounded-md border border-kritik/30 bg-kritik/10 px-3 py-2 text-xs text-kritik">{hata}</p>}
        <div className="flex gap-2 pb-[env(safe-area-inset-bottom)]">
          <button type="button" onClick={kapatVeSifirla} className="dugme-ikincil min-h-[44px] flex-1">Vazgeç</button>
          <button type="submit" disabled={!onay || !sifre || mesgul} className="dugme-tehlike min-h-[44px] flex-1">
            {mesgul && <Loader2 size={15} className="animate-spin" />} Kalıcı olarak sil
          </button>
        </div>
      </form>
    </Modal>
  );
}
