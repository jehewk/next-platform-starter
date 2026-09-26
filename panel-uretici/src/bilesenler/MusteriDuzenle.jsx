import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "./Modal";
import { musteriGuncelle } from "../api/servis";

const TIPLER = ["Konut", "Ticari", "Sanayi", "Tarım", "Kamu"];

/** Müşteri iletişim ve konum bilgilerini düzenleme diyaloğu. */
export default function MusteriDuzenle({ acik, kapat, musteri, kaydedildi }) {
  const [form, setForm] = useState(null);
  const [hata, setHata] = useState(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    if (acik && musteri) {
      setForm({
        ad: musteri.ad || "", tip: musteri.tip || "Konut", telefon: musteri.telefon || "",
        email: musteri.email || "", il: musteri.il || "", ilce: musteri.ilce || "",
        adres: musteri.adres || "", lat: musteri.lat ?? "", lng: musteri.lng ?? "",
      });
      setHata(null);
    }
  }, [acik, musteri]);

  if (!form) return null;
  const alan = (k) => ({ value: form[k], onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })) });

  async function kaydet(e) {
    e.preventDefault();
    const lat = form.lat === "" ? null : Number(form.lat);
    const lng = form.lng === "" ? null : Number(form.lng);
    if ((lat != null && !(lat >= -90 && lat <= 90)) || (lng != null && !(lng >= -180 && lng <= 180))) {
      setHata("Konum geçersiz. Enlem -90…90, boylam -180…180 arasında olmalı.");
      return;
    }
    setKaydediliyor(true);
    setHata(null);
    try {
      await musteriGuncelle(musteri.id, { ...form, ad: form.ad.trim(), lat, lng });
      kaydedildi?.();
      kapat();
    } catch (err) {
      setHata(err.message);
    } finally {
      setKaydediliyor(false);
    }
  }

  return (
    <Modal acik={acik} kapat={kapat} baslik="Müşteriyi düzenle" aciklama={musteri?.id} genislik="max-w-xl"
      alt={<>
        <button type="button" onClick={kapat} className="dugme-ikincil">Vazgeç</button>
        <button type="submit" form="musteri-form" disabled={kaydediliyor || !form.ad.trim()} className="dugme-ana">
          {kaydediliyor && <Loader2 size={14} className="animate-spin" />} Kaydet
        </button>
      </>}>
      <form id="musteri-form" onSubmit={kaydet} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="etiket">Ad / unvan</label>
          <input required {...alan("ad")} className="girdi" />
        </div>
        <div>
          <label className="etiket">Tip</label>
          <select {...alan("tip")} className="girdi">
            {TIPLER.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="etiket">Telefon</label>
          <input type="tel" {...alan("telefon")} className="girdi" />
        </div>
        <div className="sm:col-span-2">
          <label className="etiket">E-posta</label>
          <input type="email" {...alan("email")} className="girdi" />
        </div>
        <div>
          <label className="etiket">İl</label>
          <input {...alan("il")} className="girdi" />
        </div>
        <div>
          <label className="etiket">İlçe</label>
          <input {...alan("ilce")} className="girdi" />
        </div>
        <div className="sm:col-span-2">
          <label className="etiket">Adres</label>
          <input {...alan("adres")} className="girdi" />
        </div>
        <div>
          <label className="etiket">Enlem</label>
          <input inputMode="decimal" {...alan("lat")} placeholder="36.98" className="girdi font-mono" />
        </div>
        <div>
          <label className="etiket">Boylam</label>
          <input inputMode="decimal" {...alan("lng")} placeholder="35.32" className="girdi font-mono" />
        </div>
        {hata && <p className="rounded-md border border-kritik/30 bg-kritik/10 px-3 py-2 text-xs text-kritik sm:col-span-2">{hata}</p>}
      </form>
    </Modal>
  );
}
