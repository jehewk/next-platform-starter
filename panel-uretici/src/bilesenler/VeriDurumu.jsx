import { RefreshCw, WifiOff, AlertTriangle } from "lucide-react";

/**
 * Yükleme ve hata durumları için ortak bileşenler.
 *
 * Her sayfa kendi "yükleniyor" animasyonunu icat etmesin diye tek
 * yerde toplanmıştır. İskelet, boş kutulardan iyidir — kullanıcı
 * içeriğin nerede belireceğini önceden görür, sayfa "zıplamaz".
 */

export function Iskelet({ satir = 3, yukseklik = "h-24" }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: satir }).map((_, i) => (
        <div key={i} className={`animate-pulse rounded-lg border border-cizgi bg-panel ${yukseklik}`} />
      ))}
    </div>
  );
}

export function SatirIskelet({ satir = 5 }) {
  return (
    <div className="divide-y divide-cizgi overflow-hidden rounded-lg border border-cizgi bg-panel">
      {Array.from({ length: satir }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-9 w-9 animate-pulse rounded-md bg-panel2" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-panel2" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-panel2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Hata mesajı bağlama göre değişir: ağ kopmuşsa "bağlantınızı
 * kontrol edin", yetkisizse "tekrar giriş yapın", diğerlerinde
 * sunucunun kendi mesajı. Her durumda tekrar dene düğmesi vardır.
 */
export function HataKutusu({ hata, yenile }) {
  const AgKoptuMu = hata?.durum === 0;
  const Ikon = AgKoptuMu ? WifiOff : AlertTriangle;

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-cizgi bg-panel px-6 py-12 text-center">
      <Ikon size={28} strokeWidth={1.5} className="text-sonuk" />
      <div>
        <p className="text-sm font-medium">
          {AgKoptuMu ? "Bağlantı kurulamadı" : "Veri alınamadı"}
        </p>
        <p className="mt-1 text-xs text-sonuk">{hata?.message || "Bilinmeyen bir hata oluştu."}</p>
      </div>
      {yenile && (
        <button
          onClick={yenile}
          className="dugme-ikincil text-xs"
        >
          <RefreshCw size={12} strokeWidth={1.75} />
          Tekrar dene
        </button>
      )}
    </div>
  );
}
