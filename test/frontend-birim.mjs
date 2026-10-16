// Frontend saf-mantık birim testleri — düz Node (test/ayristirici.mjs gibi;
// runner/kurulum gerekmez). Yalnız Vite-stili import'u OLMAYAN saf modüller.
//
// Çalıştır:  node test/frontend-birim.mjs
//
// Kapsam:
//   #8  Garanti tarih hesabı (panel-uretici/src/veri/yardimci.js) — iş-kritik.
//   #10 Müşteri paneli NLP ayrıştırıcısı (panel-musteri/src/api/ayristirici.js).
//
// servis.js / ble.js / oturum.js Vite import'u ve tarayıcı API'si içerir →
// onlar vitest+jsdom ile test edilir (test/vitest/).

import {
  garantiDurumu, saglikDurumu, onceMetni, GARANTI_SURESI_AY, utcTarih,
} from "../panel-uretici/src/veri/yardimci.js";
import {
  zamanAraligi, sadelestir, kelimeler, saglikGecmisiMi, soruCoz,
} from "../panel-musteri/src/api/ayristirici.js";

let gecen = 0, hata = 0;
const dogru = (k, ad) => { if (k) { gecen++; console.log(`  ok   ${ad}`); } else { hata++; console.log(`  HATA ${ad}`); } };
const GUN = 86400000;


// ═══════════ #8 GARANTİ ═══════════
console.log("── Garanti (yardimci.js)");

// 60 ay garanti, 1 yıl önce üretilmiş → geçerli, kalan ~ 60*30.4-365 gün
{
  const uretim = new Date(Date.now() - 365 * GUN).toISOString();
  const g = garantiDurumu({ tip: "aku", uretim });
  dogru(g.gecerli === true, "1 yıllık akü garantisi geçerli");
  const beklenen = Math.round(GARANTI_SURESI_AY.aku * 30.4 - 365);
  dogru(Math.abs(g.kalanGun - beklenen) <= 2, `kalan gün ~${beklenen} (gelen ${g.kalanGun})`);
}

// 6 yıl önce (72 ay) → 60 aylık garanti dolmuş
{
  const uretim = new Date(Date.now() - 6 * 365 * GUN).toISOString();
  const g = garantiDurumu({ tip: "aku", uretim });
  dogru(g.gecerli === false && g.kalanGun <= 0, "6 yıllık akü garantisi dolmuş");
}

// üretim tarihi yok → geçersiz
dogru(garantiDurumu({ tip: "aku" }).gecerli === false, "üretim tarihi yoksa garanti geçersiz");
dogru(garantiDurumu(null).gecerli === false, "cihaz null → geçersiz (çökmez)");

// 60 ay ≈ 1824 gün (30.4 çarpanı; eski 30'luk 'ay' hatası dönmemeli)
{
  const uretim = new Date(Date.now()).toISOString();
  const g = garantiDurumu({ tip: "inverter", uretim });
  dogru(Math.abs(g.kalanGun - Math.round(60 * 30.4)) <= 2, "yeni inverter ~1824 gün (30.4 çarpanı)");
}

// saglikDurumu eşikleri
dogru(saglikDurumu(90) === "saglikli", "saglik 90 → saglikli");
dogru(saglikDurumu(70) === "uyari", "saglik 70 → uyari");
dogru(saglikDurumu(50) === "kritik", "saglik 50 → kritik");
dogru(saglikDurumu(null) === "notr", "saglik null → notr");

// onceMetni
dogru(onceMetni(null) === "—", "tarih yoksa —");
dogru(onceMetni(new Date(Date.now() - 2 * 3600000).toISOString()).includes("sa"), "2 saat önce → 'sa'");
dogru(utcTarih("saçma") === null, "bozuk tarih → null");


// ═══════════ #10 MÜŞTERİ AYRIŞTIRICI ═══════════
console.log("── Müşteri ayrıştırıcı (ayristirici.js)");

// zamanAraligi: sabit 'şimdi' ile
const simdi = new Date("2026-10-16T12:00:00+03:00");
dogru(zamanAraligi("bugün ne ürettim", simdi)?.ad?.includes("bugün"), "zamanAraligi: bugün");
dogru(!!zamanAraligi("dün ne kadar şarj oldu", simdi), "zamanAraligi: dün tanınır");
dogru(!!zamanAraligi("bu hafta üretim", simdi), "zamanAraligi: bu hafta tanınır");
dogru(zamanAraligi("merhaba nasılsın", simdi) == null, "zaman içermeyen soru → null");

// sadelestir / kelimeler (Türkçe küçük harf + noktalama temizliği)
dogru(sadelestir("Merhaba, DÜNYA!").includes("merhaba"), "sadelestir küçük harfe indirir");
dogru(kelimeler("akü   şarj  ") .length === 2, "kelimeler boşlukları temizler");

// saglikGecmisiMi: parçalanmış soru üzerinde
dogru(saglikGecmisiMi(soruCoz("akümün sağlık geçmişini göster")) === true, "sağlık geçmişi sorusu tanınır");
dogru(saglikGecmisiMi(soruCoz("bugün hava nasıl")) === false, "alakasız soru sağlık geçmişi değil");


// ═══════════ sonuç ═══════════
console.log(`\n${gecen} geçti, ${hata} başarısız.`);
process.exit(hata ? 1 : 0);
