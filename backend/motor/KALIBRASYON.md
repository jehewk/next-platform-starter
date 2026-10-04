# Fizik Motoru — Kalibrasyon Kontrol Belgesi

Bu belge, `fizik.py` ve `kaynak.py` içindeki her eşiğin/sabitin **nereden
geldiğini** ve **saha verisiyle doğrulanıp doğrulanmadığını** izler. Amaç şudur:
motor bugün iyi tasarlanmış bir *hipotez*tir; gerçek arızalı cihaz verisi
biriktikçe bu tablolardaki değerleri doğrulayıp "kanıtlanmış"a çevirmek.

**Durum işaretleri**
- ✅ **Doğrulandı** — en az birkaç gerçek arıza/sağlam cihaz verisiyle teyit edildi
- ⚠️ **Varsayım** — literatürden/mühendislik sezgisinden makul, ama *senin*
  akülerinde/kullanımında teyit edilmedi
- ⬜ **Veri bekliyor** — doğrulamak için henüz yeterli örnek yok

> Her değeri `fizik.py` içinde değiştirince `test/backend/test_fizik.py`'yi
> çalıştır; senaryolar hâlâ geçiyor mu bak. Canlıya `.\hazirlik-kur.ps1` ile gider.

---

## 1. Genel ilkeler (bunlar iyi, dokunma)

| İlke | Durum | Not |
|---|---|---|
| Model değil fizik kuralı; her sonuç gerekçeli | ✅ | Garanti kararı hukuki; "model dedi" savunulamaz, "fark 2,5x" savunulur. Doğru seçim. |
| Baseline + trend (mutlak eşik değil) | ✅ | Fabrikadan farklı gelen paketi yanlış damgalamaz. |
| Yük düzeltmesi (akımla normalize) | ⚠️ | Mantık doğru; `yuk_carpani` katsayısı (aşağıda) doğrulanmalı. |
| En kötü mekanizma %70 + ortalama %30 | ⚠️ | Ağırlık sezgisel; bir arıza tek mekanizmadan geldiğinde iyi çalışır. |

---

## 2. Akü — hücre dengesizliği (`aku_hucre_dengesizligi`)

| Sabit | Değer | Kaynak | Durum | Doğrulama için gereken |
|---|---|---|---|---|
| `HUCRE_FARK_UYARI` | 15 mV | Genel BMS pratiği | ⚠️ | Sağlıklı paketlerin fark dağılımı (p95 nerede?) |
| `HUCRE_FARK_KRITIK` | 40 mV | Genel BMS pratiği | ⚠️ | Dengesizlikten arızalanmış ≥3 paketin fark değeri |
| `HUCRE_TREND_UYARI` | 1.5x | Sezgi | ⬜ | Zamanla büyüyen vs. büyümeyen vakalar |
| `HUCRE_TREND_KRITIK` | 2.5x | Sezgi | ⬜ | Aynı |
| `KRITIK_ALT_SINIR_MV` | 12 mV | Trend yanlış alarmını kesen taban | ⚠️ | — |
| `UYARI_ALT_SINIR_MV` | 6 mV | Aynı | ⚠️ | — |
| Yük çarpanı | `1 + min(0.9, (A/120)*0.9)` | 120 A referans akım varsayımı | ⬜ | **Senin akünün gerçek anma akımı** (120 A doğru mu?) ve aynı paketin boşta/yük altında fark ölçümü |

**Öncelik:** Yük çarpanındaki `120` sayısı senin modülüne özgü olmalı. Yanlışsa
yük altındaki farkı fazla/az düzeltir. İlk doğrulanacak değer bu.

---

## 3. Akü — termal yaşlanma (`aku_termal_yaslanma`)

| Sabit | Değer | Kaynak | Durum | Doğrulama |
|---|---|---|---|---|
| Optimum band | 28–42 °C | LiFePO4 literatürü | ⚠️ | Genelde kabul görür; sahada teyit kolay |
| `ARRHENIUS_KATSAYI` | 2.0 (/10 °C) | Arrhenius kuralı | ✅ | Kimya için yerleşik |
| `AKU_UST_SINIR` | 55 °C | Üretici veri sayfası | ⬜ | **Kendi hücre veri sayfandan** teyit et |
| Soğuk risk üssü | `(fark/10)^1.6` | Sezgi | ⬜ | Soğukta şarj edilip kapasite kaybeden vakalar |

**Not:** Soğuk taraf (lityum kaplama) üssü `1.6` tamamen sezgisel. Soğuk şarj
vakası biriktikçe eğriyi oturtmak gerekir.

---

## 4. Akü — çevrim & iç direnç

| Sabit | Değer | Kaynak | Durum | Doğrulama |
|---|---|---|---|---|
| `beklenen_omur` | 3000 çevrim | LiFePO4 tipik | ⬜ | **Kendi hücre veri sayfan** (çoğu LiFePO4 3000–6000) |
| Kapasite eğrisi | `100 - 20*(oran^0.7)` | Varsayım | ⬜ | Çevrim sayısı yüksek cihazların gerçek kapasitesi |
| `DIRENC_SICAKLIK_K` | 0.035 | ~1.42x/10 °C | ⚠️ | Aynı akünün farklı sıcaklıkta direnç ölçümü |
| `DIRENC_EOL_KAT` | 2.0x | Yerleşik "direnç 2 katına → ömür sonu" | ✅ | Literatürde standart |

---

## 5. İnverter mekanizmaları

| Sabit | Değer | Kaynak | Durum | Doğrulama |
|---|---|---|---|---|
| `REF_SICAKLIK_IGBT` | 50 °C | Tipik jonksiyon | ⚠️ | Kendi inverter çalışma profili |
| `REF_SOGUTUCU_FARK` | 12 °C | Tipik IGBT–soğutucu farkı | ⚠️ | Sağlam inverterlerde ölçülen fark |
| `IGBT_UST_SINIR` | 125 °C | Üretici mutlak sınırı | ⬜ | **IGBT veri sayfası** |
| Köprü yayılım uyarı/kritik | 1.8x / 3.0x | PMSM verisi (medyan ~3.5x) | ⚠️ | Faz kolu arızalı inverter verisi |
| `KOPRU_YAYILIM_ALT_C` | 4 °C | Gürültü tabanı | ⚠️ | — |
| `THD_UYARI` | %5 | Genel güç elektroniği | ⚠️ | Kondansatör arızalı inverter THD'si |
| `DERATING_ESIK` / `_ORAN` | 0.85 / 0.88 | Sezgi | ⬜ | Isınınca güç kısan cihaz logları |
| `KONDANSATOR_RISK_YIL` | 6 yıl | Elektrolitik kondansatör tipik | ⚠️ | — |

---

## 6. Kalan süre tahmini (`kalan_sure`) — EN KIRILGAN

| Unsur | Değer | Durum | Risk |
|---|---|---|---|
| Model | Lineer + hızlanma katsayısı | ⚠️ | **Akü bozulması lineer değil**; diz noktasından sonra çöker. Lineer model dizden önce iyimser olabilir. |
| `KALAN_SURE_MIN_OLCUM` | 8 | ⚠️ | Az; gürültüye açık |
| Belirsizlik payı | %35–80 | ✅ | Dürüst; **mutlaka aralık olarak göster, tek sayı verme** |
| `KALAN_SURE_MAKS_GUN` | 365 | ⚠️ | Üstünü "uzun vadeli" sayar — makul |

**Kural:** Müşteriye asla "47 gün kaldı" deme; "yaklaşık 30–70 gün" de. Kod zaten
`alt_sinir_gun`/`ust_sinir_gun` üretiyor — arayüzde bunu kullan.

---

## 7. Baseline öğrenme (ayrı modülde)

| Unsur | Değer | Durum | Doğrulama |
|---|---|---|---|
| Baseline için gün | 42 gün | ⚠️ | İlk 6 hafta "normal" kabul ediliyor; cihaz baştan arızalıysa yanlış baseline |
| Baseline için ölçüm | 30 ölçüm | ⚠️ | — |

**Risk:** Baseline, cihazın ilk haftalarının *sağlıklı* olduğunu varsayar. Baştan
kusurlu bir cihaz, kusuru "normal" olarak öğrenir. Fabrika çıkış testi verisiyle
baseline'ı beslemek bu riski kapatır.

---

## 8. Garanti kararı (`kaynak.py`) — EN YÜKSEK RİSKLİ

| Unsur | Durum | Not |
|---|---|---|
| Sınıf ağırlıkları (`agirlik` 0.4–0.9) | ⬜ | Tamamen sezgisel; gerçek vakalarla ayarlanmalı |
| Güven formülü | ⚠️ | Çelişen kanıtta düşürüyor (iyi), ama kalibre değil |
| **Otomatik karar** | ⬜ | **İlk dönemde otomatik garanti kararı VERME.** "Sistem şöyle diyor + kanıt" göster, son sözü insan versin. Hukuki sonuç doğurur. |

---

## Yapılacaklar sırası (veri geldikçe)

1. ⬜ **Yük çarpanındaki anma akımını (120 A) kendi modülünle doğrula** — en çok etkiyen, en kolay düzeltilen.
2. ⬜ **Hücre veri sayfasından** `AKU_UST_SINIR`, `beklenen_omur`, IGBT `IGBT_UST_SINIR` gerçek değerlerini gir.
3. ⬜ **Fabrika çıkış testi verisiyle** baseline besle (baştan kusurlu cihaz riskini kapat).
4. ⬜ İlk 5–10 gerçek arıza vakasını topla; `kaynak_analizi` sınıfını gerçek sonuçla karşılaştır, `agirlik` değerlerini ayarla.
5. ⬜ Kalan süre tahminini birkaç ay gerçek cihazda izle; lineer model diz noktasını kaçırıyorsa eğriyi güncelle.
6. ⬜ Her sabit doğrulandıkça bu belgede ⚠️/⬜ → ✅ yap ve nedenini (kaç vaka, hangi cihaz) yaz.

---

*Bu belge kodla birlikte sürümlenir. Bir sabiti değiştirdiğinde: (1) `fizik.py`'de
değeri güncelle, (2) `test/backend/test_fizik.py` geçiyor mu bak, (3) bu tabloda
durumu ve gerekçeyi güncelle, (4) `.\hazirlik-kur.ps1` ile canlıya al.*
