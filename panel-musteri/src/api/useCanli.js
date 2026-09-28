import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Belirli aralıkla kendini yenileyen veri kancası ("anlık durum").
 *
 * · Sekme / uygulama arka plandayken istek atmaz; öne gelince hemen yeniler.
 * · İlk yüklemede iskelet gösterilir; sonraki yenilemelerde eski veri ekranda
 *   kalır (sayfa zıplamaz), yalnızca `yenileniyor` bayrağı değişir.
 * · Yenileme hata verirse son geçerli veri korunur ve hata ayrıca bildirilir.
 */
export function useCanli(getir, aralikMs = 30000) {
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState(null);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [sonGuncelleme, setSonGuncelleme] = useState(null);
  const canli = useRef(true);
  const getirRef = useRef(getir);
  useEffect(() => { getirRef.current = getir; }, [getir]);

  const yenile = useCallback(async () => {
    setYenileniyor(true);
    try {
      const v = await getirRef.current();
      if (!canli.current) return;
      setVeri(v);
      setHata(null);
      setSonGuncelleme(new Date());
    } catch (e) {
      if (canli.current) setHata(e);
    } finally {
      if (canli.current) setYenileniyor(false);
    }
  }, []);

  useEffect(() => {
    canli.current = true;
    const ilk = setTimeout(yenile, 0);   // efektin içinde eşzamanlı setState yapılmasın
    const id = setInterval(() => { if (document.visibilityState === "visible") yenile(); }, aralikMs);
    const gorunur = () => document.visibilityState === "visible" && yenile();
    document.addEventListener("visibilitychange", gorunur);
    return () => {
      canli.current = false;
      clearTimeout(ilk);
      clearInterval(id);
      document.removeEventListener("visibilitychange", gorunur);
    };
  }, [yenile, aralikMs]);

  return { veri, hata, yukleniyor: !veri && !hata, yenileniyor, sonGuncelleme, yenile };
}
