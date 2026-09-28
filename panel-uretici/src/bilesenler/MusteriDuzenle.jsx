import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "./Modal";
import { musteriGuncelle, musteriOlustur } from "../api/servis";
import { useToast } from "./Toast";

const TIPLER = ["Konut", "Ticari", "Sanayi", "Tarım", "Kamu"];

/**
 * Müşteri oluşturma (musteri verilmezse) ve düzenleme diyaloğu.
 * Oluşturma: POST /de/musteri/olustur · Düzenleme: POST /de/musteri/guncelle
 */
export default function MusteriDuzenle({ acik, kapat, musteri, kaydedildi }) {
  const bildir = useToast();
  const yeni = !musteri;
  const [form, setForm] = useState(null);
  const [hata, setHata] = useState(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    if (!acik) return;
    const m = musteri || {};
    setForm({
      ad: m.ad || "", tip: m.tip || "Konut", telefon: m.telefon || "",
      email: m.email || "", il: m.il || "", ilce: m.ilce || "",
      adres: m.adres || "", lat: m.lat ?? "", lng: m.lng ?? "",
    });
    setHata(null);
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
      const veri = { ...form, ad: form.ad.trim(), email: form.email.trim().toLowerCase(), lat, lng };
      if (yeni) await musteriOlustur(veri);
      else await musteriGuncelle(musteri.id, veri);
      bildir(yeni ? `${veri.ad} eklendi` : "Müşteri bilgileri kaydedildi");
      kaydedildi?.();
      kapat();
    } catch (err) {
      setHata(err.message);
    } finally {
      setKaydediliyor(false);
    }
  }

  return (
    <Modal acik={acik} kapat={kapat} baslik={yeni ? "Yeni müşteri" : "Müşteriyi düzenle"} aciklama={yeni ? "Kurulum yapılacak adres ve iletişim bilgileri" : musteri.id} genislik="max-w-xl"
      alt={<>
        <button type="button" onClick={kapat} className="dugme-ikincil">Vazgeç</button>
        <button type="submit" form="musteri-form" disabled={kaydediliyor || !form.ad.trim()} className="dugme-ana">
          {kaydediliyor && <Loader2 size={14} className="animate-spin" />} Kaydet
        </button>
      </>}>
      <form id="musteri-form" onSubmit={kaydet} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="etiket">Ad / unvan</label>
          <input required autoFocus {...alan("ad")} className="girdi" />
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
