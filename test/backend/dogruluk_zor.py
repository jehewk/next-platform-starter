#!/usr/bin/env python3
"""Fizik motoru ZOR / DÜŞMANCA doğruluk testi — kör noktaları ortaya çıkarır.

Çalıştır:
    python3 test/backend/dogruluk_zor.py

dogruluk.py "belirgin" arızaları ölçer (kolay vaka). Bu dosya tersini yapar:
motorun KAÇIRABİLECEĞİ veya YANLIŞ ALARM verebileceği zor vakalar.

Dört kategori:
  1. BAŞLANGIÇ (incipient) — çok küçük ama gerçek arıza → YAKALAMALI
  2. ÇÖP / İŞE YARAMAZ    — gürültü düzeyinde → GÖRMEZDEN GELMELİ (alarm yok)
  3. KÖR NOKTA            — motorun tasarım gereği göremediği → DÜRÜSTÇE belgelenir
  4. KOPUK SENSÖR         — -40 °C nöbetçisi → sahte alarm vermemeli (regresyon)

Amaç yüksek skor değil; motorun SINIRINI dürüstçe göstermek. Kör noktalar
"hata" değil, bilinen fiziksel/veri sınırlarıdır — rapor bunları açıkça listeler.
"""
import os
import sys

KOK = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if KOK not in sys.path:
    sys.path.insert(0, KOK)

from backend.motor import fizik


def deg(olcum, tip="aku"):
    return (fizik.aku_degerlendir(olcum) if tip == "aku"
            else fizik.inverter_degerlendir(olcum))


def alarmli(d):
    return d.get("seviye") in ("uyari", "kritik")


def soc_kaydi(d):
    return (d.get("soc_kontrol") or {}).get("durum")


# ══════════════════ 1. BAŞLANGIÇ ARIZALARI (yakalamalı) ══════════════════

BASLANGIC = [
    ("hücre farkı yeni başlıyor (baseline 3→8 mV, trend 2.7x)",
     {"hucreler": [3308, 3300, 3301, 3300], "sicakliklar": [30, 31, 30],
      "temel_fark_mv": 3.0}, "aku"),
    ("iç direnç eşiğin tam ucunda (1.45x, baseline var)",
     {"hucreler": [3300, 3301, 3299, 3300], "sicakliklar": [30, 31, 30],
      "temel_fark_mv": 3.0, "ic_direnc": 0.00725, "temel_direnc": 0.005},
     "aku"),
    ("IGBT termal fark eşiğin hemen üstü (20 °C)",
     {"igbt": 65, "sogutucu": 45, "thd": 2.0, "dc_gerilim": 400,
      "nominal_dc": 400}, "inverter"),
    ("THD tam uyarı eşiğinde (%5.0)",
     {"igbt": 60, "sogutucu": 50, "thd": 5.0, "dc_gerilim": 395,
      "nominal_dc": 400}, "inverter"),
    ("çevrim ömrü uyarı ucunda (%72)",
     {"hucreler": [3300, 3301, 3299, 3300], "sicakliklar": [30, 31, 30],
      "temel_fark_mv": 3.0, "cevrim": 2160}, "aku"),
    ("faz kolu baseline'a göre küçük sapma (1.85x)",
     {"igbt": 60, "sogutucu": 50, "thd": 2.0, "dc_gerilim": 400,
      "nominal_dc": 400, "kopru_sicakliklari": [60, 60, 64.6],
      "temel_kopru_yayilim": 2.5}, "inverter"),
]

# SoC başlangıç sürüklenmesi (ayrı alan kontrol edilir)
BASLANGIC_SOC = [
    ("SoC diz ucunda hafif sürüklenme (3040 mV, %35)",
     {"hucreler": [3040, 3050, 3045, 3048], "soc": 35, "akim": 1.0,
      "sicakliklar": [25, 25]}, "aku"),
]


# ══════════════════ 2. ÇÖP / İŞE YARAMAZ ARIZALAR (görmezden gel) ══════════════════

COP = [
    ("1 mV hücre farkı (gürültü)",
     {"hucreler": [3300, 3301, 3300, 3300], "sicakliklar": [30, 31, 30],
      "temel_fark_mv": 2.0}, "aku"),
    ("IGBT 58/48, fark 10 °C (normal)",
     {"igbt": 58, "sogutucu": 48, "thd": 2.0, "dc_gerilim": 400,
      "nominal_dc": 400}, "inverter"),
    ("THD %2 (temiz)",
     {"igbt": 55, "sogutucu": 45, "thd": 2.0, "dc_gerilim": 400,
      "nominal_dc": 400}, "inverter"),
    ("sıcaklık 35 °C (optimum)",
     {"hucreler": [3300, 3301, 3299, 3300], "sicakliklar": [35, 35, 35],
      "temel_fark_mv": 3.0}, "aku"),
    ("faz yayılımı 3 °C (gürültü eşiği altı)",
     {"igbt": 60, "sogutucu": 50, "thd": 2.0, "dc_gerilim": 400,
      "nominal_dc": 400, "kopru_sicakliklari": [60, 61, 63],
      "temel_kopru_yayilim": 1.0}, "inverter"),
    ("çevrim %17 (yeni akü)",
     {"hucreler": [3300, 3301, 3299, 3300], "sicakliklar": [30, 31, 30],
      "temel_fark_mv": 3.0, "cevrim": 500}, "aku"),
    ("iç direnç 1.2x @25 °C (normal yaşlanma)",
     {"hucreler": [3300, 3301, 3299, 3300], "sicakliklar": [25, 25, 25],
      "temel_fark_mv": 3.0, "ic_direnc": 0.006, "temel_direnc": 0.005},
     "aku"),
]

COP_SOC = [
    ("SoC düz bölgede %55 (doğrulanamaz, alarm değil)",
     {"hucreler": [3280, 3281, 3279, 3280], "soc": 55, "akim": 0.5,
      "sicakliklar": [25, 25]}, "aku"),
]


# ══════════════════ 3. KÖR NOKTALAR (tasarım sınırı — belgele) ══════════════════
# Beklenti: motor YAKALAYAMAZ. Bu bir hata değil, bilinen veri/fizik sınırıdır.

KOR = [
    ("hücre farkı 13 mV ama BASELINE YOK → mutlak eşik altı",
     {"hucreler": [3313, 3300, 3301, 3300], "sicakliklar": [30, 31, 30]},
     "aku",
     "Baseline oluşmadan (ilk haftalar) 15 mV altı sapma trendsiz; mutlak "
     "eşiğe takılmaz. Baseline oluşunca yakalanır."),
    ("iç direnç 1.9x ama BASELINE YOK → 'bilinmiyor'",
     {"hucreler": [3300, 3301, 3299, 3300], "sicakliklar": [30, 31, 30],
      "temel_fark_mv": 3.0, "ic_direnc": 0.0095}, "aku",
     "Temel direnç oluşmadan artış oranı hesaplanamaz; ilk haftalarda kör."),
    ("SoC gerçekte kaymış ama düz bölgede (3280 mV, %90)",
     {"hucreler": [3280, 3281, 3279], "soc": 90, "akim": 0.5}, "aku",
     "LiFePO4 düz eğrisinde gerilimden SoC doğrulanamaz; fiziksel sınır. "
     "Ancak diz bölgesinde (tam/boş) yakalanır."),
    ("yavaş takvim yaşlanması — hücre dengeli, SOH telemetrisi yok",
     {"hucreler": [3300, 3301, 3299, 3300], "sicakliklar": [30, 31, 30],
      "temel_fark_mv": 3.0, "cevrim": 300}, "aku",
     "Dengeli + ılıman + SOH alanı gelmiyorsa saf kapasite kaybı görünmez. "
     "SOH/çevrim telemetrisi ya da zaman serisi gerekir."),
]


# ══════════════════ 4. KOPUK SENSÖR (regresyon — sahte alarm olmasın) ══════════════════

SENSOR = [
    ("tüm sıcaklık sensörleri kopuk (-40 °C)",
     {"hucreler": [3300, 3301, 3299, 3300], "sicakliklar": [-40, -40, -40],
      "temel_fark_mv": 3.0}, "aku"),
    ("tek sensör kopuk, diğerleri normal",
     {"hucreler": [3300, 3301, 3299, 3300], "sicakliklar": [-40, 30, 31],
      "temel_fark_mv": 3.0}, "aku"),
]


# ══════════════════ ÇALIŞTIR ══════════════════

def kosu():
    print("FİZİK MOTORU ZOR / DÜŞMANCA DOĞRULUK TESTİ")
    print("=" * 66)

    sonuc = {}

    # 1. Başlangıç — yakalamalı
    y, t = 0, 0
    print("\n[1] BAŞLANGIÇ ARIZALARI (yakalamalı):")
    for ad, o, tip in BASLANGIC:
        d = deg(o, tip); t += 1
        ok = alarmli(d)
        y += ok
        print(f"  {'✓ yakaladı' if ok else '✗ KAÇIRDI ':<12} {ad}  ({d['seviye']})")
    for ad, o, tip in BASLANGIC_SOC:
        d = deg(o, tip); t += 1
        ok = soc_kaydi(d) in ("surukleme_yuksek", "surukleme_dusuk")
        y += ok
        print(f"  {'✓ yakaladı' if ok else '✗ KAÇIRDI ':<12} {ad}  (soc:{soc_kaydi(d)})")
    sonuc["baslangic"] = (y, t)

    # 2. Çöp — görmezden gelmeli
    y, t = 0, 0
    print("\n[2] ÇÖP / İŞE YARAMAZ ARIZALAR (alarm vermemeli):")
    for ad, o, tip in COP:
        d = deg(o, tip); t += 1
        ok = not alarmli(d)
        y += ok
        print(f"  {'✓ sustu   ' if ok else '✗ ALARM!  ':<12} {ad}  ({d['seviye']})")
    for ad, o, tip in COP_SOC:
        d = deg(o, tip); t += 1
        ok = soc_kaydi(d) in ("dogrulanamaz", "tutarli", None)
        y += ok
        print(f"  {'✓ sustu   ' if ok else '✗ ALARM!  ':<12} {ad}  (soc:{soc_kaydi(d)})")
    sonuc["cop"] = (y, t)

    # 3. Kör noktalar — belge (yakalayamaması beklenir)
    print("\n[3] KÖR NOKTALAR (tasarım sınırı — yakalayamaz, bu beklenen):")
    kor_tutar = 0
    for ad, o, tip, aciklama in KOR:
        d = deg(o, tip)
        if o.get("soc") is not None:
            gorundu = soc_kaydi(d) in ("surukleme_yuksek", "surukleme_dusuk")
        else:
            gorundu = alarmli(d)
        # "beklendiği gibi kör" = görünmedi
        beklendigi_gibi = not gorundu
        kor_tutar += beklendigi_gibi
        im = "• kör (beklenen)" if beklendigi_gibi else "! BEKLENMEDİK: yakaladı"
        print(f"  {im:<22} {ad}")
        print(f"      └ {aciklama}")
    sonuc["kor"] = (kor_tutar, len(KOR))

    # 4. Kopuk sensör — sahte alarm olmamalı
    y, t = 0, 0
    print("\n[4] KOPUK SENSÖR (sahte alarm vermemeli):")
    for ad, o, tip in SENSOR:
        d = deg(o, tip); t += 1
        ok = not alarmli(d)
        y += ok
        print(f"  {'✓ temiz   ' if ok else '✗ SAHTE ALARM':<12} {ad}  ({d['seviye']})")
    sonuc["sensor"] = (y, t)

    # ÖZET
    print("\n" + "=" * 66)
    print("ÖZET:")
    b = sonuc["baslangic"]; print(f"  Başlangıç arızası yakalama   {100*b[0]/b[1]:5.1f}%  ({b[0]}/{b[1]})")
    c = sonuc["cop"];       print(f"  Çöp arızayı görmezden gelme  {100*c[0]/c[1]:5.1f}%  ({c[0]}/{c[1]})")
    s = sonuc["sensor"];    print(f"  Kopuk sensör sahte-alarmsız  {100*s[0]/s[1]:5.1f}%  ({s[0]}/{s[1]})")
    k = sonuc["kor"];       print(f"  Kör nokta (bilinen sınır)    {k[1]} adet belgelendi")
    print("=" * 66)

    # Başarısızlık: başlangıç kaçırma, çöp alarmı, sensör sahte alarmı
    hata = (b[1] - b[0]) + (c[1] - c[0]) + (s[1] - s[0])
    if hata:
        print(f"UYARI: {hata} beklenmedik davranış (kaçırma/sahte alarm).")
        print("  Not: Kör noktalar bu sayıya DAHİL DEĞİL (onlar bilinen sınır).")
        return 1
    print("Beklenen tüm davranışlar doğru. Kör noktalar yukarıda dürüstçe listelendi.")
    return 0


if __name__ == "__main__":
    sys.exit(kosu())
