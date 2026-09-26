import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Bir API çağrısını {veri, yukleniyor, hata, yenile} durumuna çevirir.
 *
 * Her sayfa aynı üç durumu ayrı ayrı yönetmesin diye tek yerde
 * toplanmıştır: ilk yüklemede iskelet, hata olursa mesaj + tekrar
 * dene düğmesi, veri gelince içerik.
 *
 * bagimliliklar değiştiğinde (örn. cihaz_id URL parametresi) otomatik
 * yeniden çeker; bağımlılık dizisi React'in kendi kuralına uyar.
 */
export function useVeri(getir, bagimliliklar = []) {
  const [veri, setVeri] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState(null);
  const guncelMi = useRef(true);

  const cek = useCallback(() => {
    setYukleniyor(true);
    setHata(null);
    getir()
      .then((sonuc) => { if (guncelMi.current) setVeri(sonuc); })
      .catch((e) => { if (guncelMi.current) setHata(e); })
      .finally(() => { if (guncelMi.current) setYukleniyor(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, bagimliliklar);

  useEffect(() => {
    guncelMi.current = true;
    cek();
    return () => { guncelMi.current = false; };
  }, [cek]);

  return { veri, yukleniyor, hata, yenile: cek };
}
