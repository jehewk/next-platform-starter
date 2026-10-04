"""Dennis Energy fizik motoru — akü ve inverter bozulma değerlendirmesi.

KAYNAK NOTU: Bu dosya, canlı lambda_function.py içine GÖMÜLÜ olan fizik motorunun
sürümlenmiş kaynağıdır (DEVIR.md §5). Lambda tek dosya olsun diye motor oraya
kopyalanır; burada bir değişiklik yapınca canlı koda da taşınmalıdır. Testler:
test/backend/test_fizik.py.

Model değil, fizik kuralı: her sonuç gerekçeli. Garanti kararı hukuki sonuç
doğurduğu için "model %87 dedi" savunulamaz; "hücre 7 sağlıklı dönemin 2,5 katı
ayrışmış" savunulabilir. Yedi gerçek veri setiyle kalibre edildi. numpy YOK
(Lambda katmanında yok) — saf Python.
"""
import math


# ══════════════════ SABİTLER ══════════════════

# Arrhenius: her 10 °C artış yaşlanmayı iki katına çıkarır
ARRHENIUS_KATSAYI = 2.0
ARRHENIUS_ADIM    = 10.0

# Referans çalışma koşulları
REF_SICAKLIK_IGBT   = 50.0   # °C — normal IGBT jonksiyon sıcaklığı
REF_SICAKLIK_AKU    = 25.0   # °C — akü referans sıcaklığı
REF_SOGUTUCU_FARK   = 12.0   # °C — IGBT ile soğutucu arasındaki normal fark

# Eşikler
IGBT_UST_SINIR      = 125.0  # °C — üretici mutlak sınırı
AKU_UST_SINIR       = 55.0   # C — bu degerin ustu kritik (48-55 arasi uyari)
HUCRE_FARK_UYARI    = 15.0   # mV — mutlak esik (yuk altinda ortalama)
HUCRE_FARK_KRITIK   = 40.0   # mV
HUCRE_TREND_UYARI   = 1.5    # temel degerin kaci uyari sayilir
HUCRE_TREND_KRITIK  = 2.5
THD_UYARI           = 5.0    # %


# ══════════════════ SICAKLIK DÜZELTMESİ ══════════════════

SICAKLIK_DUZELTME = (-0.0086, 0.677, -11.55)   # a*T^2 + b*T + c
DUZELTME_REF_C    = 25.0
DUZELTME_ALT_C    = -15.0     # bu araligin disinda duzeltme uygulanmaz
DUZELTME_UST_C    = 55.0


def kapasite_sapmasi(sicaklik_c):
    """Verilen sicaklikta beklenen kapasite sapmasi (yuzde)."""
    if sicaklik_c is None:
        return 0.0
    t = max(DUZELTME_ALT_C, min(DUZELTME_UST_C, float(sicaklik_c)))
    a, b, c = SICAKLIK_DUZELTME
    return a * t * t + b * t + c


def kapasite_duzelt(olculen_ah, sicaklik_c):
    """Olculen kapasiteyi 25 C esdegerine cevirir."""
    if olculen_ah is None or sicaklik_c is None:
        return olculen_ah, 1.0
    sapma = kapasite_sapmasi(sicaklik_c)
    carpan = 1.0 / (1.0 + sapma / 100.0)
    return olculen_ah * carpan, carpan


def soh_duzelt(olculen_soh, sicaklik_c):
    """Olculen SOH'u sicakliga gore duzeltir ve aciklamasiyla dondurur."""
    if olculen_soh is None:
        return None

    sapma = kapasite_sapmasi(sicaklik_c)
    carpan = 1.0 / (1.0 + sapma / 100.0)
    duzeltilmis = min(105.0, olculen_soh * carpan)

    return {
        "olculen_soh":    round(float(olculen_soh), 1),
        "duzeltilmis_soh": round(float(duzeltilmis), 1),
        "sicaklik_c":     round(float(sicaklik_c), 1) if sicaklik_c is not None else None,
        "sapma_yuzde":    round(sapma, 1),
        "gecici_kayip":   round(float(duzeltilmis - olculen_soh), 1),
        "duzeltme_uygulandi": abs(sapma) > 1.0,
        "not": (f"Olcum {sicaklik_c:.0f} C'de yapildi; sogugun yol actigi "
                f"%{abs(duzeltilmis - olculen_soh):.1f} gecici kayip duzeltildi."
                if sapma < -1.0 else
                "Olcum sicakligi referans araliginda, duzeltme gerekmedi."),
    }


# ══════════════════ AKÜ BOZULMA ══════════════════

def aku_hucre_dengesizligi(hucreler_mv, temel_fark_mv=None, akim_a=None):
    """Hucreler arasi gerilim farkindan dengesizlik gostergesi."""
    if not hucreler_mv or len(hucreler_mv) < 2:
        return None

    enY, enD = max(hucreler_mv), min(hucreler_mv)
    fark = enY - enD
    ort = sum(hucreler_mv) / len(hucreler_mv)

    yuk_carpani = 1.0
    if akim_a is not None:
        a = abs(float(akim_a))
        if a > 5:
            yuk_carpani = 1.0 + min(0.9, (a / 120.0) * 0.9)
    duzeltilmis_fark = fark / yuk_carpani

    sapanlar = []
    sapma_esigi = max(6.0, duzeltilmis_fark * 0.5)
    for i, v in enumerate(hucreler_mv):
        sapma = ort - v
        if sapma > sapma_esigi:
            sapanlar.append({"no": i + 1, "gerilim_mv": round(v, 1),
                             "sapma_mv": round(sapma, 1)})

    trend_orani = None
    if temel_fark_mv and temel_fark_mv > 0.5:
        trend_orani = fark / temel_fark_mv

    KRITIK_ALT_SINIR_MV = 12.0
    UYARI_ALT_SINIR_MV  = 6.0

    if trend_orani is not None:
        if ((trend_orani >= HUCRE_TREND_KRITIK and
             duzeltilmis_fark >= KRITIK_ALT_SINIR_MV)
                or duzeltilmis_fark >= HUCRE_FARK_KRITIK):
            seviye, skor = "kritik", 32
        elif ((trend_orani >= HUCRE_TREND_UYARI and
               duzeltilmis_fark >= UYARI_ALT_SINIR_MV)
              or duzeltilmis_fark >= HUCRE_FARK_UYARI):
            seviye = "uyari"
            skor = 88 - (trend_orani - HUCRE_TREND_UYARI) / \
                        (HUCRE_TREND_KRITIK - HUCRE_TREND_UYARI) * 50
            skor = max(40, min(88, skor))
        else:
            seviye = "normal"
            skor = 100 - max(0, (trend_orani - 1.0)) * 20
    else:
        if duzeltilmis_fark >= HUCRE_FARK_KRITIK:
            seviye, skor = "kritik", 32
        elif duzeltilmis_fark >= HUCRE_FARK_UYARI:
            seviye = "uyari"
            skor = 88 - (duzeltilmis_fark - HUCRE_FARK_UYARI) / \
                        (HUCRE_FARK_KRITIK - HUCRE_FARK_UYARI) * 50
        else:
            seviye = "normal"
            skor = 100 - (duzeltilmis_fark / HUCRE_FARK_UYARI) * 8

    return {
        "mekanizma":    "hucre_dengesizligi",
        "fark_mv":      round(fark, 1),
        "duzeltilmis_fark_mv": round(duzeltilmis_fark, 1),
        "yuk_carpani":  round(yuk_carpani, 2),
        "temel_fark_mv": round(temel_fark_mv, 1) if temel_fark_mv else None,
        "trend_orani":  round(trend_orani, 2) if trend_orani else None,
        "ortalama_mv":  round(ort, 1),
        "en_dusuk_no":  hucreler_mv.index(enD) + 1,
        "sapan_hucreler": sapanlar,
        "seviye":       seviye,
        "skor":         round(max(0, min(100, skor))),
    }


def aku_termal_yaslanma(sicaklik_c, akim_orani=None, calisma_saati=None):
    """Sicakliga bagli yaslanma — cift yonlu risk (U egrisi)."""
    if sicaklik_c is None:
        return None

    OPT_ALT, OPT_UST = 28.0, 42.0

    if sicaklik_c < OPT_ALT:
        fark = OPT_ALT - sicaklik_c
        agirlik = 1.0 if akim_orani is None else min(2.0, 0.6 + akim_orani)
        risk = (fark / 10.0) ** 1.6 * agirlik
        mekanizma_notu = "dusuk sicaklik — lityum kaplama riski"
    elif sicaklik_c > OPT_UST:
        fark = sicaklik_c - OPT_UST
        risk = (ARRHENIUS_KATSAYI ** (fark / ARRHENIUS_ADIM)) - 1.0
        mekanizma_notu = "yuksek sicaklik — kimyasal yaslanma"
    else:
        risk = 0.0
        mekanizma_notu = "optimum aralikta"

    takvim_hizlanma = ARRHENIUS_KATSAYI ** ((sicaklik_c - REF_SICAKLIK_AKU)
                                            / ARRHENIUS_ADIM)

    if sicaklik_c >= AKU_UST_SINIR or sicaklik_c <= 0:
        seviye, skor = "kritik", 35
    elif risk > 1.2:
        seviye = "uyari"
        skor = max(40, 85 - risk * 18)
    elif risk > 0.4:
        seviye = "uyari"
        skor = 90 - risk * 12
    else:
        seviye = "normal"
        skor = 100 - risk * 10

    return {
        "mekanizma":      "termal_yaslanma",
        "sicaklik_c":     round(sicaklik_c, 1),
        "optimum_band":   f"{OPT_ALT:.0f}-{OPT_UST:.0f} C",
        "risk":           round(risk, 2),
        "yon":            ("soguk" if sicaklik_c < OPT_ALT else
                           "sicak" if sicaklik_c > OPT_UST else "optimum"),
        "not":            mekanizma_notu,
        "takvim_hizlanma": round(takvim_hizlanma, 2),
        "seviye":         seviye,
        "skor":           round(max(0, min(100, skor))),
    }


def aku_cevrim_yorulmasi(cevrim, beklenen_omur=3000):
    """Çevrim sayısına göre beklenen kapasite kaybı."""
    if cevrim is None:
        return None

    oran = cevrim / beklenen_omur
    beklenen_kapasite = 100 - 20 * (oran ** 0.7)

    seviye = ("kritik" if oran > 0.95 else
              "uyari"  if oran > 0.7  else "normal")

    return {
        "mekanizma":         "cevrim_yorulmasi",
        "cevrim":            int(cevrim),
        "omur_orani":        round(oran, 3),
        "beklenen_kapasite": round(max(0, beklenen_kapasite), 1),
        "seviye":            seviye,
        "skor":              round(max(0, min(100, beklenen_kapasite + 10))),
    }


# ══════════════════ İÇ DİRENÇ TABANLI YAŞLANMA ══════════════════

DIRENC_SICAKLIK_K = 0.035      # 10 °C'de ~1.42x
DIRENC_REF_C      = 25.0
DIRENC_EOL_KAT    = 2.0        # direnç iki katına çıkınca ömür sonu


def direnc_sicaklik_duzelt(direnc_ohm, sicaklik_c):
    """Ölçülen direnci 25 °C eşdeğerine çevirir."""
    if direnc_ohm is None or sicaklik_c is None:
        return direnc_ohm
    return float(direnc_ohm) * math.exp(
        DIRENC_SICAKLIK_K * (float(sicaklik_c) - DIRENC_REF_C))


def direnc_yaslanma(direnc_ohm, sicaklik_c=None, temel_direnc=None):
    """İç direnç artışından yaşlanma göstergesi."""
    if direnc_ohm is None or direnc_ohm <= 0:
        return None

    r25 = direnc_sicaklik_duzelt(direnc_ohm, sicaklik_c)

    if not temel_direnc or temel_direnc <= 0:
        return {
            "mekanizma":   "ic_direnc",
            "direnc_ohm":  round(float(direnc_ohm), 5),
            "direnc_25c":  round(r25, 5),
            "temel_direnc": None,
            "artis_kat":   None,
            "seviye":      "bilinmiyor",
            "skor":        None,
            "not": ("Temel direnç değeri henüz oluşmadı; "
                    "ilk haftalarda hesaplanacak."),
        }

    kat = r25 / float(temel_direnc)

    soh_esdeger = 100.0 - (kat - 1.0) / (DIRENC_EOL_KAT - 1.0) * 20.0

    if kat >= DIRENC_EOL_KAT:
        seviye, skor = "kritik", max(20, round(soh_esdeger))
    elif kat >= 1.45:
        seviye, skor = "uyari", round(soh_esdeger)
    else:
        seviye, skor = "normal", round(min(100, soh_esdeger))

    return {
        "mekanizma":    "ic_direnc",
        "direnc_ohm":   round(float(direnc_ohm), 5),
        "direnc_25c":   round(r25, 5),
        "temel_direnc": round(float(temel_direnc), 5),
        "artis_kat":    round(kat, 2),
        "soh_esdeger":  round(soh_esdeger, 1),
        "seviye":       seviye,
        "skor":         max(0, min(100, skor)),
        "not": (f"Direnç sağlıklı dönemin {kat:.2f} katı; "
                f"ömür sonu eşiği {DIRENC_EOL_KAT:.1f}x."),
    }


# ══════════════════ İNVERTER BOZULMA ══════════════════

def igbt_termal_yorulma(igbt_c, sogutucu_c, ortam_c=25.0):
    """IGBT jonksiyon sıcaklığı ve termal direnç analizi."""
    if igbt_c is None or sogutucu_c is None:
        return None

    fark = igbt_c - sogutucu_c
    fark_orani = fark / REF_SICAKLIK_IGBT if REF_SICAKLIK_IGBT else 0

    if fark > REF_SOGUTUCU_FARK:
        omur_kaybi = ((fark / REF_SOGUTUCU_FARK) ** 2.5 - 1) * 100
    else:
        omur_kaybi = 0.0

    if igbt_c >= 90 or fark > REF_SOGUTUCU_FARK * 2.2:
        seviye, skor = "kritik", 30
    elif igbt_c >= 70 or fark > REF_SOGUTUCU_FARK * 1.6:
        seviye, skor = "uyari", 65
    else:
        seviye = "normal"
        skor = 100 - max(0, (igbt_c - REF_SICAKLIK_IGBT)) * 1.2

    return {
        "mekanizma":     "igbt_termal_yorulma",
        "jonksiyon_c":   round(igbt_c, 1),
        "sogutucu_c":    round(sogutucu_c, 1),
        "termal_fark_c": round(fark, 1),
        "omur_kaybi_yuzde": round(min(100, omur_kaybi), 1),
        "sinir_orani":   round(igbt_c / IGBT_UST_SINIR, 2),
        "seviye":        seviye,
        "skor":          round(max(0, min(100, skor))),
    }


def kondansator_esr(thd, dc_gerilim, sicaklik_c, nominal_dc=400.0):
    """DC bara kondansatörü yaşlanma göstergesi."""
    if thd is None:
        return None

    hizlanma = (ARRHENIUS_KATSAYI ** ((sicaklik_c - 40) / ARRHENIUS_ADIM)
                if sicaklik_c else 1.0)

    gerilim_sapma = 0.0
    if dc_gerilim and nominal_dc:
        gerilim_sapma = max(0.0, (nominal_dc - dc_gerilim) / nominal_dc * 100)

    if thd >= 7 or gerilim_sapma > 12:
        seviye, skor = "kritik", 28
    elif thd >= THD_UYARI or gerilim_sapma > 6:
        seviye = "uyari"
        skor = 80 - (thd - THD_UYARI) * 8 - gerilim_sapma * 1.5
    else:
        seviye = "normal"
        skor = 100 - thd * 3

    return {
        "mekanizma":       "kondansator_esr",
        "thd_yuzde":       round(thd, 2),
        "dc_sapma_yuzde":  round(gerilim_sapma, 1),
        "yaslanma_hizi":   round(hizlanma, 2),
        "seviye":          seviye,
        "skor":            round(max(0, min(100, skor))),
    }


# ══════════════════ FAZ/KÖPRÜ SICAKLIK DENGESİZLİĞİ ══════════════════

KOPRU_YAYILIM_UYARI  = 1.8    # temel yayilimin kati
KOPRU_YAYILIM_KRITIK = 3.0    # PMSM verisinde gercek isinma medyani 3.5x
KOPRU_YAYILIM_ALT_C  = 4.0    # bu farkin altinda alarm verilmez (gurultu)


def kopru_dengesizligi(sicakliklar_c, temel_yayilim_c=None):
    """Faz kollari arasi sicaklik yayilimindan bozulma gostergesi."""
    if not sicakliklar_c or len(sicakliklar_c) < 2:
        return None

    degerler = [float(x) for x in sicakliklar_c if x is not None]
    if len(degerler) < 2:
        return None

    yayilim = max(degerler) - min(degerler)
    en_sicak_no = degerler.index(max(degerler)) + 1
    ortalama = sum(degerler) / len(degerler)

    oran = None
    if temel_yayilim_c and temel_yayilim_c > 0.3:
        oran = yayilim / float(temel_yayilim_c)

    if yayilim < KOPRU_YAYILIM_ALT_C:
        seviye, skor = "normal", 100 - (yayilim / KOPRU_YAYILIM_ALT_C) * 5
    elif oran is not None:
        if oran >= KOPRU_YAYILIM_KRITIK:
            seviye, skor = "kritik", 34
        elif oran >= KOPRU_YAYILIM_UYARI:
            seviye = "uyari"
            skor = 86 - (oran - KOPRU_YAYILIM_UYARI) / \
                        (KOPRU_YAYILIM_KRITIK - KOPRU_YAYILIM_UYARI) * 46
        else:
            seviye = "normal"
            skor = 100 - max(0, (oran - 1.0)) * 18
    else:
        if yayilim > 12.0:
            seviye, skor = "kritik", 36
        elif yayilim > 7.0:
            seviye, skor = "uyari", 70
        else:
            seviye, skor = "normal", 92

    return {
        "mekanizma":     "kopru_dengesizligi",
        "yayilim_c":     round(yayilim, 2),
        "temel_yayilim_c": round(float(temel_yayilim_c), 2) if temel_yayilim_c else None,
        "oran":          round(oran, 2) if oran else None,
        "en_sicak_kol":  en_sicak_no,
        "ortalama_c":    round(ortalama, 1),
        "seviye":        seviye,
        "skor":          round(max(0, min(100, skor))),
    }


def sogutma_verimi(igbt_c, sogutucu_c, ortam_c=25.0, guc_kw=None):
    """Soğutma sisteminin (fan, kanatçık) verim kaybı."""
    if sogutucu_c is None:
        return None

    ortam_fark = sogutucu_c - ortam_c
    beklenen = 12.0 if guc_kw is None else 8.0 + guc_kw * 0.9

    oran = ortam_fark / beklenen if beklenen else 1.0

    if oran > 2.0:
        seviye, skor = "kritik", 32
    elif oran > 1.45:
        seviye, skor = "uyari", 68
    else:
        seviye = "normal"
        skor = 100 - max(0, (oran - 1) * 40)

    return {
        "mekanizma":       "sogutma_verimi",
        "sogutucu_c":      round(sogutucu_c, 1),
        "ortam_fark_c":    round(ortam_fark, 1),
        "beklenen_fark_c": round(beklenen, 1),
        "verim_orani":     round(1 / oran if oran else 1, 2),
        "seviye":          seviye,
        "skor":            round(max(0, min(100, skor))),
    }


# ══════════════════ İNVERTER — SAHA KAYNAKLI GÖSTERGELER ══════════════════

DERATING_ESIK      = 0.85
DERATING_SICAK_C  = 72.0
KONDANSATOR_RISK_YIL = 6.0


def termal_derating(guc_w, anma_guc_w, igbt_c, sogutucu_c, dc_akim_a=None):
    """Inverter kendini koruma amaciyla gucunu kisiyor mu?"""
    if not guc_w or not anma_guc_w or anma_guc_w <= 0:
        return None

    oran = float(guc_w) / float(anma_guc_w)
    if oran >= DERATING_ESIK:
        return {
            "mekanizma":  "termal_derating",
            "guc_orani":  round(oran, 3),
            "derating":   False,
            "seviye":     "normal",
            "skor":       100,
        }

    sicak = (igbt_c is not None and float(igbt_c) > DERATING_SICAK_C) or \
            (sogutucu_c is not None and float(sogutucu_c) > DERATING_SICAK_C - 8)

    dc_yeterli = dc_akim_a is None or float(dc_akim_a) > 1.0

    if not (sicak and dc_yeterli):
        return {
            "mekanizma": "termal_derating",
            "guc_orani": round(oran, 3),
            "derating":  False,
            "not":       "Dusuk guc, dusuk isinimla acikllaniyor.",
            "seviye":    "normal",
            "skor":      95,
        }

    kayip = (1.0 - oran) * 100
    if oran < 0.60:
        seviye, skor = "kritik", 38
    elif oran < 0.75:
        seviye, skor = "uyari", 62
    else:
        seviye, skor = "uyari", 78

    return {
        "mekanizma":   "termal_derating",
        "guc_orani":   round(oran, 3),
        "derating":    True,
        "kayip_yuzde": round(kayip, 1),
        "igbt_c":      round(float(igbt_c), 1) if igbt_c else None,
        "seviye":      seviye,
        "skor":        skor,
    }


def fan_verimi(sogutucu_c, ortam_c, guc_orani=None, temel_fark_c=None):
    """Sogutma fani zayifliyor mu?"""
    if sogutucu_c is None or ortam_c is None:
        return None

    fark = float(sogutucu_c) - float(ortam_c)
    if guc_orani and guc_orani > 0.15:
        normalize_fark = fark / float(guc_orani)
    else:
        normalize_fark = fark

    oran = None
    if temel_fark_c and temel_fark_c > 1.0:
        oran = normalize_fark / float(temel_fark_c)

    if oran is not None:
        if oran >= 1.8:
            seviye, skor = "kritik", 36
        elif oran >= 1.35:
            seviye = "uyari"
            skor = 84 - (oran - 1.35) / 0.45 * 44
        else:
            seviye = "normal"
            skor = 100 - max(0, (oran - 1.0)) * 30
    else:
        if normalize_fark > 35:
            seviye, skor = "kritik", 40
        elif normalize_fark > 25:
            seviye, skor = "uyari", 72
        else:
            seviye, skor = "normal", 94

    return {
        "mekanizma":      "fan_verimi",
        "ortam_fark_c":   round(fark, 1),
        "normalize_fark": round(normalize_fark, 1),
        "temel_fark_c":   round(float(temel_fark_c), 1) if temel_fark_c else None,
        "oran":           round(oran, 2) if oran else None,
        "seviye":         seviye,
        "skor":           round(max(0, min(100, skor))),
    }


def kondansator_yas_riski(yas_yil, ortalama_sicaklik_c=None):
    """Yasa ve calisma sicakligina bagli kondansator risk seviyesi."""
    if yas_yil is None:
        return None

    etkin_yas = float(yas_yil)
    if ortalama_sicaklik_c:
        etkin_yas *= 2.0 ** ((float(ortalama_sicaklik_c) - 40.0) / 10.0)

    if etkin_yas >= KONDANSATOR_RISK_YIL * 1.6:
        seviye, oneri = "yuksek", "Kondansator degisimi planlanmali."
    elif etkin_yas >= KONDANSATOR_RISK_YIL:
        seviye, oneri = "orta", "ESR olcumu ile durum kontrolu onerilir."
    else:
        seviye, oneri = "dusuk", "Rutin bakim yeterli."

    return {
        "mekanizma":   "kondansator_yas",
        "yas_yil":     round(float(yas_yil), 1),
        "etkin_yas":   round(etkin_yas, 1),
        "risk":        seviye,
        "oneri":       oneri,
    }


def kaskad_uyarisi(bulgular):
    """Birlikte gorulunce hizlanan ariza zincirini isaret eder."""
    ad = {b["mekanizma"]: b for b in bulgular}
    uyarilar = []

    igbt = ad.get("igbt_termal_yorulma")
    kond = ad.get("kondansator_esr")
    if igbt and kond and igbt["seviye"] != "normal" and kond["seviye"] != "normal":
        uyarilar.append({
            "tip": "igbt_kondansator",
            "metin": ("IGBT ve DC bara kondansatörü aynı anda bozuluyor. "
                      "Saha kayıtlarında bu zincir hızlı ilerler: IGBT arızası "
                      "kısa devreye dönüşüp kondansatör terminallerini zorlar. "
                      "Müdahale önceliği yükseltilmeli."),
        })

    fan = ad.get("fan_verimi")
    if fan and kond and fan["seviye"] != "normal" and kond["seviye"] != "normal":
        uyarilar.append({
            "tip": "fan_kondansator",
            "metin": ("Soğutma zayıflarken kondansatör de bozuluyor. ESR artışı "
                      "yerel ısınmayı büyütür, ısınma elektrolit kaybını "
                      "hızlandırır — kendini besleyen döngü."),
        })

    return uyarilar


# ══════════════════ GÜÇ KISITLAMA (DERATING) TESPİTİ ══════════════════

DERATING_ESIK_ORAN = 0.88
DERATING_SICAKLIK  = 60.0


def guc_kisitlama(dc_guc_w, ac_guc_w, igbt_c=None, anma_guc_kw=None):
    """Inverter cikis gucunu kisiyor mu?"""
    if not dc_guc_w or dc_guc_w < 100:
        return None
    if ac_guc_w is None:
        return None

    verim = float(ac_guc_w) / float(dc_guc_w)

    yuklenme = None
    if anma_guc_kw:
        yuklenme = float(ac_guc_w) / (float(anma_guc_kw) * 1000.0)

    termal_supheli = igbt_c is not None and float(igbt_c) > DERATING_SICAKLIK

    if verim < 0.80:
        seviye, skor = "kritik", 38
        not_metni = "Dönüşüm verimi ciddi düşük; bileşen arızası olası."
    elif verim < DERATING_ESIK_ORAN:
        seviye = "uyari"
        skor = 84 - (DERATING_ESIK_ORAN - verim) * 200
        not_metni = ("Çıkış gücü kısıtlanıyor" +
                     (" — yüksek sıcaklık nedeniyle." if termal_supheli
                      else "; soğutma veya bileşen kontrolü önerilir."))
    else:
        seviye = "normal"
        skor = 100 - max(0, (0.97 - verim)) * 120
        not_metni = "Dönüşüm verimi normal aralıkta."

    return {
        "mekanizma":     "guc_kisitlama",
        "verim":         round(verim, 3),
        "dc_guc_w":      round(float(dc_guc_w), 1),
        "ac_guc_w":      round(float(ac_guc_w), 1),
        "yuklenme":      round(yuklenme, 2) if yuklenme else None,
        "termal_supheli": termal_supheli,
        "seviye":        seviye,
        "skor":          round(max(0, min(100, skor))),
        "not":           not_metni,
    }


# ══════════════════ KALAN SÜRE TAHMİNİ ══════════════════

KALAN_SURE_MIN_OLCUM = 8
KALAN_SURE_MAKS_GUN  = 365


def _dogrusal_egim(degerler, zaman_araligi_saat=1.0):
    """Birim saatteki degisim hizi."""
    n = len(degerler)
    if n < 3:
        return 0.0
    x_ort = (n - 1) / 2.0
    y_ort = sum(degerler) / n
    ust = sum((i - x_ort) * (v - y_ort) for i, v in enumerate(degerler))
    alt = sum((i - x_ort) ** 2 for i in range(n))
    if alt == 0:
        return 0.0
    return (ust / alt) / max(zaman_araligi_saat, 1e-6)


def _hizlanma_katsayisi(degerler):
    """Bozulma hizlaniyor mu?"""
    n = len(degerler)
    if n < 8:
        return 1.0
    orta = n // 2
    ilk = _dogrusal_egim(degerler[:orta])
    son = _dogrusal_egim(degerler[orta:])
    if abs(ilk) < 1e-9:
        return 1.0
    oran = son / ilk
    return max(1.0, min(4.0, oran)) if oran > 0 else 1.0


def kalan_sure(gecmis_degerler, kritik_esik, mevcut=None,
               olcum_araligi_saat=1.0, artan=True):
    """Gostergenin kritik esige ulasmasina kalan sureyi tahmin eder."""
    degerler = [float(v) for v in gecmis_degerler if v is not None]
    if len(degerler) < KALAN_SURE_MIN_OLCUM:
        return {
            "durum": "yetersiz_veri",
            "not": (f"Tahmin icin en az {KALAN_SURE_MIN_OLCUM} olcum gerekli "
                    f"({len(degerler)} mevcut)."),
        }

    simdiki = float(mevcut) if mevcut is not None else degerler[-1]
    hiz = _dogrusal_egim(degerler, olcum_araligi_saat)
    hizlanma = _hizlanma_katsayisi(degerler)

    mesafe = (kritik_esik - simdiki) if artan else (simdiki - kritik_esik)

    if mesafe <= 0:
        return {
            "durum": "esik_asildi",
            "kalan_saat": 0,
            "not": "Gosterge kritik esigi zaten asmis; mudahale gerekiyor.",
        }

    kotulesme_hizi = hiz if artan else -hiz
    if kotulesme_hizi <= 1e-9:
        return {
            "durum": "kararli",
            "hiz": round(hiz, 6),
            "not": "Gosterge kotulesme yonunde ilerlemiyor; tahmin yapilmadi.",
        }

    ham_saat = mesafe / kotulesme_hizi
    saat = ham_saat / hizlanma
    gun = saat / 24.0

    if gun > KALAN_SURE_MAKS_GUN:
        return {
            "durum": "uzun_vadeli",
            "kalan_gun": None,
            "hiz": round(hiz, 6),
            "not": f"Mevcut hizla esige ulasmasi {KALAN_SURE_MAKS_GUN} gunden uzun surer.",
        }

    n = len(degerler)
    belirsizlik = 0.35 + 0.3 * (hizlanma - 1.0) + max(0.0, (20 - n) * 0.02)
    belirsizlik = min(0.8, belirsizlik)

    return {
        "durum":        "tahmin",
        "kalan_saat":   round(saat),
        "kalan_gun":    round(gun, 1),
        "alt_sinir_gun": round(gun * (1 - belirsizlik), 1),
        "ust_sinir_gun": round(gun * (1 + belirsizlik), 1),
        "hiz":          round(hiz, 6),
        "hizlanma":     round(hizlanma, 2),
        "olcum_sayisi": n,
        "not": (f"Mevcut bozulma hiziyla yaklasik {gun:.0f} gun "
                + (f"(hizlanma {hizlanma:.1f}x hesaba katildi)"
                   if hizlanma > 1.15 else "")),
    }


def gunluk_ozetle(olcumler, alan, zaman_alani="zaman"):
    """Olcumleri gune indirger — uzun vadeli trend icin gerekli."""
    from collections import defaultdict
    gunler = defaultdict(list)

    for o in olcumler:
        deger = o.get(alan)
        if deger is None and alan == "hucre_farki_mv":
            h = o.get("hucreler")
            if h and len(h) > 1:
                deger = max(h) - min(h)
        if deger is None:
            continue
        z = str(o.get(zaman_alani, ""))[:10]
        if z:
            gunler[z].append(float(deger))

    if len(gunler) < 3:
        return None, None

    sirali = sorted(gunler.items())
    degerler = []
    for _, liste in sirali:
        liste = sorted(liste)
        n = len(liste)
        degerler.append(liste[n//2] if n % 2 else (liste[n//2-1] + liste[n//2]) / 2.0)
    return degerler, 24.0


def aku_kalan_sure(gecmis_olcumler, temel_fark_mv=None, temel_direnc=None,
                   olcum_araligi_saat=1.0):
    """Akude en yakin kritik esige kalan sureyi bulur."""
    adaylar = []

    farklar, aralik = gunluk_ozetle(gecmis_olcumler, "hucre_farki_mv")
    if farklar is None:
        farklar = []
        for o in gecmis_olcumler:
            f = o.get("hucre_farki_mv")
            if f is None:
                h = o.get("hucreler")
                if h and len(h) > 1:
                    f = max(h) - min(h)
            if f is not None:
                farklar.append(float(f))
        aralik = olcum_araligi_saat

    if farklar:
        esik = HUCRE_FARK_KRITIK
        if temel_fark_mv:
            esik = min(esik, float(temel_fark_mv) * HUCRE_TREND_KRITIK)
        esik = max(esik, 12.0)
        r = kalan_sure(farklar, esik, olcum_araligi_saat=aralik, artan=True)
        r["mekanizma"] = "hucre_dengesizligi"
        r["esik"] = round(esik, 1)
        if r.get("durum") in ("tahmin", "esik_asildi"):
            adaylar.append(r)

    duzeltilmis = []
    for o in gecmis_olcumler:
        d = o.get("ic_direnc")
        sic = o.get("max_sicaklik")
        if d:
            kopya = dict(o)
            kopya["_r25"] = direnc_sicaklik_duzelt(float(d), sic)
            duzeltilmis.append(kopya)

    if duzeltilmis and temel_direnc:
        direncler, d_aralik = gunluk_ozetle(duzeltilmis, "_r25")
        if direncler is None:
            direncler = [o["_r25"] for o in duzeltilmis]
            d_aralik = olcum_araligi_saat
        esik = float(temel_direnc) * DIRENC_EOL_KAT
        r = kalan_sure(direncler, esik, olcum_araligi_saat=d_aralik, artan=True)
        r["mekanizma"] = "ic_direnc"
        r["esik"] = round(esik, 5)
        if r.get("durum") in ("tahmin", "esik_asildi"):
            adaylar.append(r)

    if not adaylar:
        return {"durum": "tahmin_yok",
                "not": "Hicbir gosterge icin anlamli bir egilim bulunamadi."}

    asilmis = [a for a in adaylar if a.get("durum") == "esik_asildi"]
    if asilmis:
        en_yakin = asilmis[0]
        en_yakin["diger_mekanizmalar"] = [
            {"mekanizma": a["mekanizma"], "kalan_gun": a.get("kalan_gun")}
            for a in adaylar if a is not en_yakin]
        return en_yakin

    en_yakin = min(adaylar, key=lambda x: x.get("kalan_gun") or 1e9)
    en_yakin["diger_mekanizmalar"] = [
        {"mekanizma": a["mekanizma"], "kalan_gun": a.get("kalan_gun")}
        for a in adaylar if a is not en_yakin]
    return en_yakin


# ══════════════════ TOPLU DEĞERLENDİRME ══════════════════

def aku_degerlendir(olcum):
    """Bir akü ölçümünden tüm bozulma mekanizmalarını değerlendirir."""
    bulgular = []

    h = aku_hucre_dengesizligi(
        olcum.get("hucreler"),
        temel_fark_mv=olcum.get("temel_fark_mv"),
        akim_a=olcum.get("akim"))
    if h: bulgular.append(h)

    sicakliklar = olcum.get("sicakliklar") or []
    if sicakliklar:
        akim = olcum.get("akim")
        kapasite = olcum.get("kapasite_ah")
        oran = (abs(float(akim)) / float(kapasite)
                if akim and kapasite else None)
        t = aku_termal_yaslanma(max(sicakliklar), akim_orani=oran)
        if t: bulgular.append(t)

    c = aku_cevrim_yorulmasi(olcum.get("cevrim"))
    if c: bulgular.append(c)

    r = direnc_yaslanma(olcum.get("ic_direnc"),
                        sicaklik_c=(max(sicakliklar) if sicakliklar else None),
                        temel_direnc=olcum.get("temel_direnc"))
    if r and r.get("skor") is not None:
        bulgular.append(r)

    sonuc = _birlestir(bulgular, "aku")

    sicakliklar = olcum.get("sicakliklar") or []
    olcum_sic = (float(sum(sicakliklar)) / len(sicakliklar) if sicakliklar
                 else olcum.get("sicaklik"))
    ham_soh = olcum.get("soh") or olcum.get("olculen_soh")
    if ham_soh is not None and olcum_sic is not None:
        d = soh_duzelt(float(ham_soh), float(olcum_sic))
        sonuc["sicaklik_duzeltmesi"] = d
        if d and d["duzeltme_uygulandi"]:
            yeni_saglik = max(sonuc.get("saglik") or 0,
                              min(100, round(d["duzeltilmis_soh"])))
            sonuc["saglik"] = yeni_saglik
            sonuc["seviye"] = ("kritik" if yeni_saglik < 65 else
                               "uyari"  if yeni_saglik < 85 else "normal")
    return sonuc


def inverter_degerlendir(olcum, ortam_c=25.0):
    """Bir inverter ölçümünden tüm bozulma mekanizmalarını değerlendirir."""
    bulgular = []

    i = igbt_termal_yorulma(olcum.get("igbt"), olcum.get("sogutucu"), ortam_c)
    if i: bulgular.append(i)

    k = kondansator_esr(olcum.get("thd"), olcum.get("dc_gerilim"),
                        olcum.get("igbt"), olcum.get("nominal_dc", 400.0))
    if k: bulgular.append(k)

    s = sogutma_verimi(olcum.get("sogutucu"), olcum.get("sogutucu"),
                       ortam_c, olcum.get("guc_kw"))
    if s: bulgular.append(s)

    k = kopru_dengesizligi(olcum.get("kopru_sicakliklari"),
                           olcum.get("temel_kopru_yayilim"))
    if k: bulgular.append(k)

    g = guc_kisitlama(olcum.get("dc_guc_w"), olcum.get("ac_guc_w"),
                      olcum.get("igbt"), olcum.get("guc_kw"))
    if g: bulgular.append(g)

    d = termal_derating(olcum.get("guc_w"), olcum.get("anma_guc_w"),
                        olcum.get("igbt"), olcum.get("sogutucu"),
                        olcum.get("dc_akim"))
    if d: bulgular.append(d)

    guc_or = None
    if olcum.get("guc_w") and olcum.get("anma_guc_w"):
        guc_or = float(olcum["guc_w"]) / float(olcum["anma_guc_w"])
    fv = fan_verimi(olcum.get("sogutucu"), ortam_c, guc_or,
                    olcum.get("temel_sogutucu_fark"))
    if fv: bulgular.append(fv)

    ek = {}
    kaskad = kaskad_uyarisi(bulgular)
    if kaskad:
        ek["kaskad_uyarilari"] = kaskad
    yas = kondansator_yas_riski(olcum.get("yas_yil"),
                                olcum.get("ortalama_sicaklik"))
    if yas:
        ek["kondansator_yas"] = yas
    return _birlestir(bulgular, "inverter", ek)


def _birlestir(bulgular, tip, ek=None):
    """Bulguları tek bir sağlık skoruna ve önceliğe indirger."""
    if not bulgular:
        return {"saglik": None, "seviye": "bilinmiyor", "bulgular": []}

    en_kotu = min(bulgular, key=lambda b: b["skor"])
    ortalama = sum(b["skor"] for b in bulgular) / len(bulgular)
    saglik = round(en_kotu["skor"] * 0.7 + ortalama * 0.3)

    seviye = ("kritik" if saglik < 65 else
              "uyari"  if saglik < 85 else "normal")

    if seviye == "kritik" and not any(b["seviye"] == "kritik" for b in bulgular):
        seviye = "uyari"
    if seviye == "normal" and any(b["seviye"] == "kritik" for b in bulgular):
        seviye = "uyari"
    # Bir mekanizma uyarı veriyorsa cihaz "normal" sayılamaz; harmanlanmış
    # skor yüksek kalsa bile en kötü bulgunun seviyesi korunur (aksi halde
    # yüksek skorlu tek bir uyarı ortalamada erir, kaynak analizi kaçar).
    if seviye == "normal" and any(b["seviye"] in ("uyari", "kritik")
                                  for b in bulgular):
        seviye = "uyari"

    sonuc = {
        "tip":       tip,
        "saglik":    saglik,
        "seviye":    seviye,
        "oncelikli": en_kotu["mekanizma"],
        "bulgular":  sorted(bulgular, key=lambda b: b["skor"]),
    }
    if ek:
        sonuc.update(ek)
    return sonuc


# ══════════════════ ÖZET METİN ══════════════════

MEKANIZMA_ADI = {
    "guc_kisitlama":       "Çıkış gücü kısıtlaması",
    "termal_derating":     "Termal güç kısıtlama",
    "fan_verimi":          "Soğutma fanı verimi",
    "kopru_dengesizligi":  "Faz kolu sıcaklık dengesizliği",
    "ic_direnc":           "İç direnç artışı",
    "hucre_dengesizligi":  "Hücre dengesizliği",
    "termal_yaslanma":     "Sıcaklık kaynaklı yaşlanma",
    "cevrim_yorulmasi":    "Çevrim yorulması",
    "igbt_termal_yorulma": "IGBT termal yorulması",
    "kondansator_esr":     "DC bara kondansatörü",
    "sogutma_verimi":      "Soğutma verimi",
}


def ozet_metin(sonuc):
    """Panelde gösterilecek insan diliyle açıklama."""
    if not sonuc.get("bulgular"):
        return "Değerlendirme için yeterli ölçüm yok."

    b = sonuc["bulgular"][0]

    if b.get("seviye") == "normal":
        ad_n = MEKANIZMA_ADI.get(b["mekanizma"], b["mekanizma"])
        return (f"Tüm göstergeler normal aralıkta. En yakın takip edilen: "
                f"{ad_n.lower()} (skor {b['skor']}).")
    ad = MEKANIZMA_ADI.get(b["mekanizma"], b["mekanizma"])

    if b["mekanizma"] == "hucre_dengesizligi":
        trend = ""
        if b.get("trend_orani"):
            trend = (f" Fark, sağlıklı dönemin {b['trend_orani']:.1f} katına "
                     f"çıkmış ({b['temel_fark_mv']:.1f} → "
                     f"{b['duzeltilmis_fark_mv']:.1f} mV).")
        if b["sapan_hucreler"]:
            h = b["sapan_hucreler"][0]
            return (f"{ad}: hücre {h['no']} ortalamadan {h['sapma_mv']:.0f} mV "
                    f"ayrışmış.{trend}")
        return f"{ad}: paket içi fark {b['duzeltilmis_fark_mv']:.0f} mV.{trend}"

    if b["mekanizma"] == "termal_yaslanma":
        if b["yon"] == "soguk":
            return (f"{ad}: {b['sicaklik_c']} °C — optimum bandın "
                    f"({b['optimum_band']}) altında. Düşük sıcaklıkta yüksek akım "
                    f"lityum kaplamaya yol açar, kapasite kalıcı azalır.")
        if b["yon"] == "sicak":
            return (f"{ad}: {b['sicaklik_c']} °C — optimum bandın "
                    f"({b['optimum_band']}) üzerinde, kimyasal yaşlanma hızlanıyor.")
        return (f"{ad}: {b['sicaklik_c']} °C, optimum aralıkta.")

    if b["mekanizma"] == "ic_direnc":
        return (f"{ad}: direnç sağlıklı dönemin {b['artis_kat']:.2f} katına "
                f"çıkmış ({b['temel_direnc']*1000:.1f} → "
                f"{b['direnc_25c']*1000:.1f} mΩ, 25 °C eşdeğeri).")

    if b["mekanizma"] == "cevrim_yorulmasi":
        return (f"{ad}: {b['cevrim']} çevrim tamamlanmış, "
                f"beklenen kapasite %{b['beklenen_kapasite']}.")

    if b["mekanizma"] == "igbt_termal_yorulma":
        return (f"{ad}: jonksiyon {b['jonksiyon_c']} °C, soğutucuyla fark "
                f"{b['termal_fark_c']} °C — normalin üzerinde.")

    if b["mekanizma"] == "guc_kisitlama":
        return (f"{ad}: dönüşüm verimi %{b['verim']*100:.1f}. {b['not']}")

    if b["mekanizma"] == "kopru_dengesizligi":
        oran = (f", sağlıklı dönemin {b['oran']:.1f} katı" if b.get("oran") else "")
        return (f"{ad}: {b['en_sicak_kol']}. faz kolu diğerlerinden "
                f"{b['yayilim_c']:.1f} °C sıcak{oran}. Bu koldaki anahtarda "
                f"bozulma veya soğutma teması sorunu olabilir.")

    if b["mekanizma"] == "kondansator_esr":
        return (f"{ad}: harmonik bozulma %{b['thd_yuzde']}, "
                f"DC gerilim sapması %{b['dc_sapma_yuzde']}.")

    if b["mekanizma"] == "termal_derating":
        if not b.get("derating"):
            return f"{ad}: güç kısıtlaması yok."
        return (f"{ad}: cihaz anma gücünün %{b['guc_orani']*100:.0f}'ine "
                f"düşmüş (IGBT {b.get('igbt_c')} °C). Üretim kaybı "
                f"%{b['kayip_yuzde']:.0f}; bu, bozulmanın ilk görünür belirtisidir.")

    if b["mekanizma"] == "fan_verimi":
        oran = (f", sağlıklı dönemin {b['oran']:.1f} katı" if b.get("oran") else "")
        return (f"{ad}: soğutucu ortamdan {b['ortam_fark_c']:.1f} °C yüksek{oran}. "
                f"Fan rulmanı aşınmış veya kanatçık tozlanmış olabilir.")

    if b["mekanizma"] == "sogutma_verimi":
        return (f"{ad}: soğutucu ortamdan {b['ortam_fark_c']} °C yüksek, "
                f"beklenen {b['beklenen_fark_c']} °C.")

    return f"{ad}: seviye {b['seviye']}."
