"""Dennis Energy arıza kaynağı analizi — garanti kararı için kanıt üretir.

KAYNAK NOTU: Bu dosya da canlı lambda_function.py içine gömülüdür (DEVIR.md §5);
burada değişiklik canlı koda taşınmalıdır. Testler: test/backend/test_fizik.py.

Amaç bir sağlık skoru DEĞİL, bir SORUMLULUK kararıdır: arıza üretim hatasından
mı (garanti kapsamında), kullanım/kurulum hatasından mı (kapsam dışı), dış
etkenden mi (yıldırım, şebeke) kaynaklandı? Her sonuç fizik gerekçesine ve
somut ölçüm kanıtına dayanır; "model öyle dedi" hukukta savunulamaz.

Sınıflar:
  uretim    — üretim/malzeme hatası  → garanti kapsamında
  kullanim  — yanlış kullanım/kurulum → kapsam dışı
  dis_etken — dış etken (yıldırım vb.) → kapsam dışı (ürün kusuru değil)
  belirsiz  — kanıt yetersiz           → saha incelemesi önerilir
"""

from . import fizik


SINIF_ADI = {
    "uretim":    "Üretim/malzeme hatası",
    "kullanim":  "Kullanım/kurulum hatası",
    "dis_etken": "Dış etken",
    "belirsiz":  "Belirsiz",
}

GARANTI_YORUM = {
    "uretim":    "Garanti kapsamında değerlendirilebilir.",
    "kullanim":  "Kullanım/kurulum kaynaklı; garanti kapsamı dışında kalması olası.",
    "dis_etken": "Dış etken kaynaklı; ürün kusuru değil, garanti kapsamı dışında.",
    "belirsiz":  "Kanıt yetersiz; saha incelemesi önerilir.",
}


# ══════════════════ KULLANIM İŞARETLERİ ══════════════════

def sifir_alti_sarj(olcum):
    """0 °C altında yüksek akımla şarj → lityum kaplama (kullanım hatası)."""
    sic = olcum.get("sicaklik")
    sicakliklar = olcum.get("sicakliklar") or []
    if sic is None and sicakliklar:
        sic = min(sicakliklar)
    akim = olcum.get("akim")
    sarjda = olcum.get("sarjda")
    if sarjda is None and akim is not None:
        sarjda = float(akim) > 0

    if sic is None or akim is None:
        return None
    if sic > 0 or not sarjda:
        return None

    kapasite = olcum.get("kapasite_ah")
    oran = abs(float(akim)) / float(kapasite) if kapasite else None
    siddetli = oran is not None and oran > 0.1

    if sic <= -5 or siddetli:
        return {
            "isaret":  "sifir_alti_sarj",
            "sinif":   "kullanim",
            "agirlik": 0.9 if siddetli else 0.7,
            "kanit": (f"{sic:.0f} °C'de {abs(float(akim)):.1f} A ile şarj. "
                      "0 °C altında şarj lityum kaplamaya yol açar; bu kurulum/"
                      "kullanım koşuludur, hücre kusuru değildir."),
        }
    return {
        "isaret":  "sifir_alti_sarj",
        "sinif":   "kullanim",
        "agirlik": 0.4,
        "kanit": f"{sic:.0f} °C'de düşük akımla şarj — sınırda kullanım koşulu.",
    }


def yuk_bagimli_dengesizlik(dengesizlik):
    """Yük altında büyüyüp boşta kaybolan dengesizlik → bağlantı/kullanım."""
    if not dengesizlik:
        return None
    yuk = dengesizlik.get("yuk_carpani")
    if yuk is None or yuk < 1.5:
        return None
    ham = dengesizlik.get("fark_mv")
    duz = dengesizlik.get("duzeltilmis_fark_mv")
    if ham is None or duz is None:
        return None
    if ham > duz * 1.4 and duz < fizik.HUCRE_FARK_UYARI:
        return {
            "isaret":  "yuk_bagimli_dengesizlik",
            "sinif":   "kullanim",
            "agirlik": 0.6,
            "kanit": (f"Fark yük altında {ham:.0f} mV, yük düzeltmesiyle "
                      f"{duz:.0f} mV'a iniyor. Bu, hücrenin kendisinden çok "
                      "yüksek akım/bağlantı direncine işaret eder."),
        }
    return None


def _kullanim_isaretleri(olcum, degerlendirme):
    isaretler = []
    a = sifir_alti_sarj(olcum)
    if a:
        isaretler.append(a)

    dengesizlik = None
    for b in (degerlendirme.get("bulgular") or []):
        if b.get("mekanizma") == "hucre_dengesizligi":
            dengesizlik = b
            break
    y = yuk_bagimli_dengesizlik(dengesizlik)
    if y:
        isaretler.append(y)

    sicakliklar = olcum.get("sicakliklar") or []
    if sicakliklar and max(sicakliklar) >= fizik.AKU_UST_SINIR:
        isaretler.append({
            "isaret":  "asiri_sicaklik",
            "sinif":   "kullanim",
            "agirlik": 0.6,
            "kanit": (f"{max(sicakliklar):.0f} °C — üretici üst sınırının "
                      f"({fizik.AKU_UST_SINIR:.0f} °C) üzerinde. Yetersiz "
                      "havalandırma/kurulum koşulu olası."),
        })
    return isaretler


# ══════════════════ ÜRETİM İŞARETLERİ ══════════════════

def baslangic_dengesizligi(dengesizlik, calisma_gun=None):
    """Baştan var olan, zamanla büyümeyen hücre ayrışması → üretim/eşleştirme."""
    if not dengesizlik:
        return None
    trend = dengesizlik.get("trend_orani")
    duz = dengesizlik.get("duzeltilmis_fark_mv")
    if duz is None:
        return None

    if trend is not None and trend < 1.25 and duz >= fizik.HUCRE_FARK_UYARI:
        return {
            "isaret":  "baslangic_dengesizligi",
            "sinif":   "uretim",
            "agirlik": 0.75,
            "kanit": (f"Fark baştan beri yüksek ({duz:.0f} mV) ama neredeyse "
                      f"büyümüyor (trend {trend:.2f}x). Zamanla gelişen bir "
                      "yıpranma değil; hücre eşleştirme/üretim kaynaklı."),
        }
    return None


def inverter_erken_sapma(degerlendirme, calisma_gun=None):
    """Erken dönemde ortaya çıkan köprü/IGBT sapması → üretim."""
    if calisma_gun is not None and calisma_gun > 180:
        return None
    for b in (degerlendirme.get("bulgular") or []):
        if b.get("mekanizma") in ("kopru_dengesizligi", "igbt_termal_yorulma") \
                and b.get("seviye") in ("uyari", "kritik"):
            gun = f" (yalnız {calisma_gun} gün sonra)" if calisma_gun else ""
            return {
                "isaret":  "erken_sapma",
                "sinif":   "uretim",
                "agirlik": 0.7,
                "kanit": (f"{fizik.MEKANIZMA_ADI.get(b['mekanizma'])} erken "
                          f"dönemde ortaya çıktı{gun}. Normal yıpranmadan önce "
                          "görülen sapma montaj/bileşen kusuruna işaret eder."),
            }
    return None


def _uretim_isaretleri(olcum, degerlendirme, calisma_gun=None):
    isaretler = []
    dengesizlik = None
    for b in (degerlendirme.get("bulgular") or []):
        if b.get("mekanizma") == "hucre_dengesizligi":
            dengesizlik = b
            break
    bd = baslangic_dengesizligi(dengesizlik, calisma_gun)
    if bd:
        isaretler.append(bd)

    es = inverter_erken_sapma(degerlendirme, calisma_gun)
    if es:
        isaretler.append(es)

    # Tek hücre/kolun diğerlerinden kopuk ayrışması (sistematik değil, yerel)
    if dengesizlik and dengesizlik.get("sapan_hucreler"):
        sapanlar = dengesizlik["sapan_hucreler"]
        if len(sapanlar) == 1 and sapanlar[0]["sapma_mv"] >= 25:
            isaretler.append({
                "isaret":  "tekil_hucre_kusuru",
                "sinif":   "uretim",
                "agirlik": 0.65,
                "kanit": (f"Yalnız hücre {sapanlar[0]['no']} ayrışmış "
                          f"({sapanlar[0]['sapma_mv']:.0f} mV). Tüm pakette değil "
                          "tek hücrede kusur, üretim hatasının tipik imzasıdır."),
            })
    return isaretler


# ══════════════════ DIŞ ETKEN İŞARETLERİ ══════════════════

def sarj_gerilimi_asimi(olcum):
    """Şebeke/şarj cihazı kaynaklı aşırı gerilim → dış etken."""
    dc = olcum.get("dc_gerilim")
    nominal = olcum.get("nominal_dc", 400.0)
    if dc is None or not nominal:
        return None
    sapma = (float(dc) - float(nominal)) / float(nominal) * 100
    if sapma > 15:
        return {
            "isaret":  "asiri_gerilim",
            "sinif":   "dis_etken",
            "agirlik": 0.7,
            "kanit": (f"DC bara gerilimi {dc:.0f} V, nominalin %{sapma:.0f} "
                      "üzerinde. Şebeke dalgalanması/şarj cihazı kaynaklı aşırı "
                      "gerilim; ürün kusuru değil."),
        }
    return None


def _dis_etken_isaretleri(olcum, degerlendirme):
    isaretler = []
    g = sarj_gerilimi_asimi(olcum)
    if g:
        isaretler.append(g)

    # Ani/tekil termal sıçrama tüm bileşenlerde eşzamanlı → dış etken (yıldırım,
    # ortam yangını) — tek bir mekanizma değil, hepsi birden kritik
    bulgular = degerlendirme.get("bulgular") or []
    termal = [b for b in bulgular
              if b.get("mekanizma") in ("igbt_termal_yorulma", "termal_yaslanma",
                                        "kopru_dengesizligi")]
    if len(termal) >= 2 and all(b.get("seviye") == "kritik" for b in termal):
        isaretler.append({
            "isaret":  "eszamanli_termal",
            "sinif":   "dis_etken",
            "agirlik": 0.55,
            "kanit": ("Birden çok bağımsız bileşen aynı anda kritik termal "
                      "seviyede. Kademeli yıpranma değil, dış kaynaklı ani "
                      "olay (aşırı ortam sıcaklığı, elektriksel darbe) olası."),
        })
    return isaretler


# ══════════════════ SONUÇ ══════════════════

def _sonuc(sinif, guven, gerekceler, kanitlar):
    return {
        "sinif":         sinif,
        "sinif_adi":     SINIF_ADI[sinif],
        "guven":         round(max(0.0, min(1.0, guven)), 2),
        "garanti_yorum": GARANTI_YORUM[sinif],
        "gerekceler":    gerekceler,
        "kanit":         kanitlar,
    }


def kaynak_analizi(olcum, degerlendirme=None, calisma_gun=None):
    """Arızanın kaynağını sınıflandırır ve garanti yorumu üretir.

    olcum          : ham ölçüm sözlüğü (fizik.aku_degerlendir ile aynı biçim)
    degerlendirme  : fizik değerlendirme sonucu (yoksa buradan hesaplanır)
    calisma_gun    : cihazın saha ömrü (erken-dönem kararı için)
    """
    if degerlendirme is None:
        degerlendirme = fizik.aku_degerlendir(olcum)

    # Sağlık normalse kaynak araması yapma
    if degerlendirme.get("seviye") == "normal":
        return _sonuc("belirsiz", 0.0,
                      ["Göstergeler normal; sınıflandırılacak arıza yok."], [])

    kullanim = _kullanim_isaretleri(olcum, degerlendirme)
    uretim   = _uretim_isaretleri(olcum, degerlendirme, calisma_gun)
    dis      = _dis_etken_isaretleri(olcum, degerlendirme)

    puanlar = {
        "kullanim":  sum(i["agirlik"] for i in kullanim),
        "uretim":    sum(i["agirlik"] for i in uretim),
        "dis_etken": sum(i["agirlik"] for i in dis),
    }
    tum_isaretler = {"kullanim": kullanim, "uretim": uretim, "dis_etken": dis}

    toplam = sum(puanlar.values())
    if toplam < 0.5:
        return _sonuc("belirsiz", 0.2,
                      ["Arıza var ama kaynağına dair yeterli ayırt edici "
                       "kanıt bulunamadı. Saha incelemesi önerilir."], [])

    sinif = max(puanlar, key=puanlar.get)
    en_yuksek = puanlar[sinif]

    # İkinci en yüksek sınıfa yakınsa güven düşer (çelişen kanıt)
    sirali = sorted(puanlar.values(), reverse=True)
    fark = sirali[0] - sirali[1] if len(sirali) > 1 else sirali[0]
    guven = min(0.95, 0.45 + fark * 0.5 + en_yuksek * 0.15)

    gerekceler = [i["kanit"] for i in tum_isaretler[sinif]]
    kanitlar = tum_isaretler[sinif]

    # Çelişen kanıtı şeffaf biçimde ekle
    for s, isaretler in tum_isaretler.items():
        if s != sinif and isaretler:
            gerekceler.append(
                f"Not: {SINIF_ADI[s].lower()} yönünde de işaret var "
                f"({len(isaretler)} kanıt); güven buna göre düşürüldü.")

    return _sonuc(sinif, guven, gerekceler, kanitlar)
