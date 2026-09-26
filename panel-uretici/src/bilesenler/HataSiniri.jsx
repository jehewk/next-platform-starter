import { Component } from "react";

/**
 * Son çare güvenlik ağı.
 *
 * React'te bir bileşenin render sırasında fırlattığı senkron bir
 * hata (beklenmeyen veri şekli, eksik yapılandırma, üçüncü parti
 * kütüphane hatası) yakalanmazsa tüm uygulama beyaz ekrana düşer —
 * kullanıcı için hiçbir ipucu olmadan. Bu bileşen o son anı yakalar
 * ve en azından "bir şey ters gitti, sayfayı yenile" mesajını verir.
 *
 * Bu, HataKutusu'nun (API çağrıları için) yerini tutmaz — o veri
 * çekme hatalarını ele alır. Bu, React'in kendisinin çöktüğü,
 * çok daha nadir ama çok daha kör anlar içindir.
 */
export default class HataSiniri extends Component {
  state = { hata: null };

  static getDerivedStateFromError(hata) {
    return { hata };
  }

  componentDidCatch(hata, bilgi) {
    console.error("Yakalanmamış arayüz hatası:", hata, bilgi);
  }

  render() {
    if (this.state.hata) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zemin px-6 text-center">
          <p className="text-sm font-medium text-metin">Sayfa yüklenirken bir sorun oluştu.</p>
          <p className="max-w-md text-xs text-soluk">{this.state.hata.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="dugme-ikincil mt-2 text-xs"
          >
            Sayfayı yenile
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
