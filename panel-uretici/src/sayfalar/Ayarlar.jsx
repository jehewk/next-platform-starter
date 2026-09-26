import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Moon, Sun, Monitor, Check } from "lucide-react";
import { SayfaBasligi } from "../bilesenler/Kart";
import { useAyarlar, VARSAYILAN } from "../api/ayarlar";
import { oturumOku, oturumSil } from "../api/oturum";

export default function Ayarlar() {
  const { ayarlar, guncelle, sifirla } = useAyarlar();
  const oturum = oturumOku();
  const git = useNavigate();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SayfaBasligi baslik="Ayarlar" aciklama="Hesap, görünüm, uyarı eşikleri ve bildirim tercihleri." />

      <Bolum baslik="Profil" aciklama="Panelde görünen adınız. E-posta hesabınıza bağlıdır.">
        <Alan etiket="Görünen ad">
          <input value={ayarlar.gorunenAd} onChange={(e) => guncelle({ gorunenAd: e.target.value })}
            placeholder={oturum?.eposta?.split("@")[0]} className="girdi max-w-xs" />
        </Alan>
        <Alan etiket="E-posta">
          <input value={oturum?.eposta || ""} disabled className="girdi max-w-xs" />
        </Alan>
      </Bolum>

      <Bolum baslik="Görünüm">
        <Alan etiket="Tema">
          <Secenekler deger={ayarlar.tema} degis={(tema) => guncelle({ tema })} secenekler={[
            { id: "koyu", ad: "Koyu", ikon: Moon },
            { id: "acik", ad: "Açık", ikon: Sun },
            { id: "sistem", ad: "Sistem", ikon: Monitor },
          ]} />
        </Alan>
        <Alan etiket="Tablo yoğunluğu">
          <Secenekler deger={ayarlar.yogunluk} degis={(yogunluk) => guncelle({ yogunluk })} secenekler={[
            { id: "rahat", ad: "Rahat" },
            { id: "siki", ad: "Sıkı" },
          ]} />
        </Alan>
      </Bolum>

      <EsikBolumu />

      <Bolum baslik="Bildirimler" aciklama="Üst çubuktaki zil menüsünde gösterilecek olaylar.">
        <Anahtar etiket="Kritik cihazlar" aciklama="Sağlık skoru kritik eşiğin altına düşen cihazlar."
          deger={ayarlar.bildirimKritik} degis={(v) => guncelle({ bildirimKritik: v })} />
        <Anahtar etiket="Kayıt başvuruları" aciklama="Onay bekleyen yeni müşteri başvuruları."
          deger={ayarlar.bildirimBasvuru} degis={(v) => guncelle({ bildirimBasvuru: v })} />
        <Anahtar etiket="Garanti talepleri" aciklama="İnceleme bekleyen garanti talepleri."
          deger={ayarlar.bildirimGaranti} degis={(v) => guncelle({ bildirimGaranti: v })} />
      </Bolum>

      <Bolum baslik="Veri ve oturum">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm">Sohbet geçmişi</div>
            <div className="text-xs text-sonuk">Bu tarayıcıda saklanan tüm sohbetleri siler.</div>
          </div>
          <button className="dugme-ikincil" onClick={() => {
            if (confirm("Tüm sohbet geçmişi silinecek. Emin misiniz?")) {
              localStorage.removeItem("de_sohbetler");
              window.location.reload();
            }
          }}>Geçmişi sil</button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm">Varsayılan ayarlar</div>
            <div className="text-xs text-sonuk">Tema, eşik ve bildirim tercihlerini sıfırlar.</div>
          </div>
          <button className="dugme-ikincil" onClick={sifirla}>Sıfırla</button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm">Oturum</div>
            <div className="text-xs text-sonuk">{oturum?.demo ? "Demo oturumu" : oturum?.eposta}</div>
          </div>
          <button className="dugme-tehlike" onClick={() => { oturumSil(); git("/giris", { replace: true }); }}>
            Çıkış yap
          </button>
        </div>
      </Bolum>
    </div>
  );
}

function EsikBolumu() {
  const { ayarlar, guncelle } = useAyarlar();
  const [uyari, setUyari] = useState(ayarlar.esikUyari);
  const [kritik, setKritik] = useState(ayarlar.esikKritik);
  const [kaydedildi, setKaydedildi] = useState(false);

  const u = Number(uyari), k = Number(kritik);
  const hata = !(u > 0 && u <= 100 && k > 0 && k < u) ? "Kritik eşik, izleme eşiğinden küçük olmalı (1–100)." : null;
  const degisti = u !== ayarlar.esikUyari || k !== ayarlar.esikKritik;

  function kaydet(e) {
    e.preventDefault();
    if (hata) return;
    guncelle({ esikUyari: u, esikKritik: k });
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 2000);
  }

  return (
    <Bolum baslik="Sağlık eşikleri"
      aciklama="Cihaz sağlık skorunun hangi değerde izlemeye ve kritik duruma geçeceği. Renkler, müdahale kuyruğu ve bildirimler bu değerleri kullanır.">
      <form onSubmit={kaydet} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="etiket">İzleme eşiği (altı sarı)</label>
            <input type="number" min={1} max={100} value={uyari} onChange={(e) => setUyari(e.target.value)} className="girdi" />
          </div>
          <div>
            <label className="etiket">Kritik eşik (altı kırmızı)</label>
            <input type="number" min={1} max={100} value={kritik} onChange={(e) => setKritik(e.target.value)} className="girdi" />
          </div>
        </div>
        <EsikOnizleme uyari={u} kritik={k} />
        {hata && <p className="text-xs text-kritik">{hata}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" className="dugme-ana" disabled={!!hata || !degisti}>Kaydet</button>
          {degisti && (
            <button type="button" className="dugme-hayalet"
              onClick={() => { setUyari(VARSAYILAN.esikUyari); setKritik(VARSAYILAN.esikKritik); }}>
              Varsayılana dön
            </button>
          )}
          {kaydedildi && <span className="flex items-center gap-1 text-xs text-saglikli"><Check size={13} /> Kaydedildi</span>}
        </div>
      </form>
    </Bolum>
  );
}

function EsikOnizleme({ uyari, kritik }) {
  if (!(kritik > 0 && kritik < uyari && uyari <= 100)) return null;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full">
        <div className="bg-kritik" style={{ width: `${kritik}%` }} />
        <div className="bg-uyari" style={{ width: `${uyari - kritik}%` }} />
        <div className="bg-saglikli" style={{ width: `${100 - uyari}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-2xs text-sonuk">
        <span>0</span><span>Kritik &lt; {kritik}</span><span>İzleme &lt; {uyari}</span><span>100</span>
      </div>
    </div>
  );
}

function Bolum({ baslik, aciklama, children }) {
  return (
    <section className="rounded-lg border border-cizgi bg-panel">
      <header className="border-b border-cizgi px-5 py-4">
        <h2 className="text-sm font-semibold">{baslik}</h2>
        {aciklama && <p className="mt-0.5 text-xs leading-relaxed text-sonuk">{aciklama}</p>}
      </header>
      <div className="space-y-5 px-5 py-5">{children}</div>
    </section>
  );
}

function Alan({ etiket, children }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[180px_1fr] sm:items-center">
      <span className="text-sm text-soluk">{etiket}</span>
      <div>{children}</div>
    </div>
  );
}

function Secenekler({ deger, degis, secenekler }) {
  return (
    <div className="inline-flex rounded-md border border-cizgi bg-zemin p-0.5">
      {secenekler.map((s) => (
        <button key={s.id} type="button" onClick={() => degis(s.id)} aria-pressed={deger === s.id}
          className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            deger === s.id ? "bg-panel2 text-metin ring-1 ring-cizgi" : "text-soluk hover:text-metin"}`}>
          {s.ikon && <s.ikon size={13} />}
          {s.ad}
        </button>
      ))}
    </div>
  );
}

function Anahtar({ etiket, aciklama, deger, degis }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm">{etiket}</span>
        <span className="block text-xs text-sonuk">{aciklama}</span>
      </span>
      <button type="button" role="switch" aria-checked={deger} onClick={() => degis(!deger)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${deger ? "bg-saglikli" : "bg-cizgi"}`}>
        <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          deger ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}
