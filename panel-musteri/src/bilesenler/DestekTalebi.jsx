import { useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "./Modal";
import { useToast } from "./Toast";
import { garantiTalepOlustur } from "../api/servis";

/**
 * Destek / garanti talebi — POST /de/garanti/talep {cihaz_id, aciklama}.
 * Talep üretici panelinde "İnceleniyor" olarak görünür; ekip cihazın
 * ölçüm geçmişiyle birlikte değerlendirir.
 */
export default function DestekTalebi({ acik, kapat, cihazlar, tamam }) {
  const bildir = useToast();
  const [cihazId, setCihazId] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState(null);

  if (!acik) return null;
  const secili = cihazId || (cihazlar.length === 1 ? cihazlar[0].id : "");
  const kapatVeSifirla = () => { setAciklama(""); setCihazId(""); setHata(null); kapat(); };

  async function gonder(e) {
    e.preventDefault();
    setGonderiliyor(true);
    setHata(null);
    try {
      await garantiTalepOlustur(secili, aciklama.trim());
      bildir("Talebiniz alındı. Ekibimiz en kısa sürede sizinle iletişime geçecek.");
      tamam?.();
      kapatVeSifirla();
    } catch (err) {
      setHata(err.message);
    } finally {
      setGonderiliyor(false);
    }
  }

  return (
    <Modal acik kapat={kapatVeSifirla} baslik="Destek talebi" aciklama="Yaşadığınız sorunu kısaca anlatın."
      alt={<>
        <button type="button" onClick={kapatVeSifirla} className="dugme-ikincil min-h-[44px]">Vazgeç</button>
        <button type="submit" form="destek-form" disabled={gonderiliyor || !secili || aciklama.trim().length < 10} className="dugme-ana min-h-[44px]">
          {gonderiliyor && <Loader2 size={15} className="animate-spin" />} Gönder
        </button>
      </>}>
      <form id="destek-form" onSubmit={gonder} className="space-y-4">
        {cihazlar.length > 1 && (
          <label className="block">
            <span className="etiket">Cihaz</span>
            <select value={secili} onChange={(e) => setCihazId(e.target.value)} className="girdi min-h-[44px]" required>
              <option value="">Seçin…</option>
              {cihazlar.map((c) => (
                <option key={c.id} value={c.id}>{c.tip === "aku" ? "Akü" : "İnverter"} · {c.id}</option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="etiket">Sorun</span>
          <textarea rows={5} value={aciklama} onChange={(e) => setAciklama(e.target.value)} autoFocus
            placeholder="Örn. Akü akşam saatlerinde erken bitiyor, inverter uyarı sesi veriyor…" className="girdi resize-none" />
          <span className="mt-1 block text-xs text-sonuk">En az 10 karakter. Cihaz verileriniz talebe otomatik eklenir.</span>
        </label>
        {hata && <p className="rounded-md border border-kritik/30 bg-kritik/10 px-3 py-2 text-xs text-kritik">{hata}</p>}
      </form>
    </Modal>
  );
}
