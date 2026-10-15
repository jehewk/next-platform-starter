#!/usr/bin/env python3
"""Fizik motoru DOĞRULUK / KAPSAM ölçümü — etiketli arıza kataloğu.

Çalıştır:
    python3 test/backend/dogruluk.py

Ne ölçer (her arıza tipi için ayrı, sonra genel %):
  1. TESPİT       — arızalı senaryo "normal" dışına çıkıyor mu? (duyarlılık)
  2. YANLIŞ ALARM — sağlıklı senaryo "normal" kalıyor mu? (özgüllük)
  3. MEKANİZMA    — öncelikli mekanizma beklenen arıza mı?
  4. GARANTİ      — kaynak sınıfı (üretim/kullanım/dış etken) doğru mu?
  5. EKRAN        — ozet_metin arızaya özgü (genel "normal" değil) mesaj veriyor mu?
  6. ÖNGÖRÜ       — kötüleşen seride kalan_sure "tahmin" veriyor mu? (erken uyarı)

DÜRÜST SINIR: Etiketler motorun FİZİK BEKLENTİSİNE göre konmuştur (sahada
doğrulanmış gerçek arıza verisi DEĞİL — o veri henüz yok). Bu test "motor
tasarlandığı gibi tüm arıza tiplerini yakalıyor/sınıflıyor mu"yu ölçer;
gerçek saha doğruluğu fabrika/pilot verisiyle ayrıca ölçülmelidir.
"""
import os
import sys

KOK = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if KOK not in sys.path:
    sys.path.insert(0, KOK)

from backend.motor import fizik, kaynak


# ══════════════════ ARIZA KATALOĞU ══════════════════
# tip: "aku" | "inverter"
# beklenti: saglikli(bool), mekanizma(str|None), garanti(str|None)

AKU = []
INV = []


def aku(ad, olcum, saglikli=False, mekanizma=None, garanti=None, calisma_gun=None):
    AKU.append({"ad": ad, "olcum": olcum, "saglikli": saglikli,
                "mekanizma": mekanizma, "garanti": garanti,
                "calisma_gun": calisma_gun})


def inv(ad, olcum, saglikli=False, mekanizma=None, garanti=None, calisma_gun=None):
    INV.append({"ad": ad, "olcum": olcum, "saglikli": saglikli,
                "mekanizma": mekanizma, "garanti": garanti,
                "calisma_gun": calisma_gun})


# ---- AKÜ: sağlıklı kontroller ----
aku("sağlıklı paket (ılıman)",
    {"hucreler": [3300, 3301, 3299, 3302], "sicakliklar": [30, 31, 30],
     "temel_fark_mv": 3.0, "cevrim": 200, "soc": 60, "akim": 0},
    saglikli=True)
aku("sağlıklı paket (hafif yük)",
    {"hucreler": [3310, 3308, 3312, 3309], "sicakliklar": [33, 34, 33],
     "temel_fark_mv": 4.0, "cevrim": 400, "soc": 75, "akim": -8},
    saglikli=True)

# ---- AKÜ: her bozulma mekanizması ----
aku("hücre dengesizliği (kritik, trend)",
    {"hucreler": [3320, 3300, 3295, 3275], "sicakliklar": [32, 33, 32],
     "temel_fark_mv": 10.0, "cevrim": 300},
    mekanizma="hucre_dengesizligi")
aku("termal yaşlanma — sıcak",
    {"hucreler": [3300, 3301, 3299, 3300], "sicakliklar": [52, 53, 52],
     "temel_fark_mv": 3.0},
    mekanizma="termal_yaslanma")
aku("termal yaşlanma — soğuk (yük altında)",
    {"hucreler": [3300, 3301, 3299, 3300], "sicakliklar": [2, 1, 2],
     "temel_fark_mv": 3.0, "akim": 50, "kapasite_ah": 100},
    mekanizma="termal_yaslanma")
aku("iç direnç — ömür sonu (2x)",
    {"hucreler": [3300, 3301, 3299, 3300], "sicakliklar": [30, 31, 30],
     "temel_fark_mv": 3.0, "ic_direnc": 0.010, "temel_direnc": 0.005},
    mekanizma="ic_direnc")
aku("çevrim yorulması (ömür ~%97)",
    {"hucreler": [3300, 3301, 3299, 3300], "sicakliklar": [30, 31, 30],
     "temel_fark_mv": 3.0, "cevrim": 2900},
    mekanizma="cevrim_yorulmasi")

# ---- AKÜ: garanti sınıfı senaryoları ----
aku("soğuk şarj → KULLANIM",
    {"hucreler": [3310, 3300, 3295, 3285], "sicakliklar": [-8, -7, -8],
     "sicaklik": -8, "akim": 20, "sarjda": True, "kapasite_ah": 100,
     "temel_fark_mv": 8.0},
    mekanizma="hucre_dengesizligi", garanti="kullanim", calisma_gun=400)
aku("baştan ayrışma → ÜRETİM",
    {"hucreler": [3330, 3300, 3298, 3296], "sicakliklar": [30, 31, 30],
     "sicaklik": 30, "akim": -10, "sarjda": False, "kapasite_ah": 100,
     "temel_fark_mv": 28.0},
    mekanizma="hucre_dengesizligi", garanti="uretim", calisma_gun=120)
aku("tekil hücre kusuru → ÜRETİM",
    {"hucreler": [3300, 3301, 3265, 3299], "sicakliklar": [30, 31, 30],
     "sicaklik": 30, "akim": -5, "sarjda": False, "temel_fark_mv": 30.0},
    mekanizma="hucre_dengesizligi", garanti="uretim", calisma_gun=150)

# ---- İNVERTER: sağlıklı kontrol ----
inv("sağlıklı inverter",
    {"igbt": 55, "sogutucu": 45, "thd": 2.0, "dc_gerilim": 400,
     "nominal_dc": 400, "kopru_sicakliklari": [60, 61, 62],
     "temel_kopru_yayilim": 2.0, "guc_kw": 5},
    saglikli=True)

# ---- İNVERTER: her bozulma mekanizması ----
inv("IGBT termal yorulma (kritik)",
    {"igbt": 95, "sogutucu": 55, "thd": 2.0, "dc_gerilim": 400,
     "nominal_dc": 400},
    mekanizma="igbt_termal_yorulma")
inv("DC bara kondansatörü (THD yüksek)",
    {"igbt": 60, "sogutucu": 50, "thd": 8.0, "dc_gerilim": 360,
     "nominal_dc": 400},
    mekanizma="kondansator_esr")
inv("faz kolu dengesizliği (kritik)",
    {"igbt": 60, "sogutucu": 50, "thd": 2.0, "dc_gerilim": 400,
     "nominal_dc": 400, "kopru_sicakliklari": [60, 62, 92],
     "temel_kopru_yayilim": 2.0},
    mekanizma="kopru_dengesizligi")
inv("güç kısıtlama (düşük verim)",
    {"igbt": 70, "sogutucu": 55, "thd": 2.0, "dc_gerilim": 400,
     "nominal_dc": 400, "dc_guc_w": 5000, "ac_guc_w": 3900, "guc_kw": 5},
    mekanizma="guc_kisitlama")
inv("soğutma zayıf — fan (temel değere göre)",
    {"igbt": 62, "sogutucu": 55, "thd": 2.0, "dc_gerilim": 400,
     "nominal_dc": 400, "kopru_sicakliklari": [60, 61, 62],
     "temel_kopru_yayilim": 2.0, "temel_sogutucu_fark": 10.0},
    mekanizma="fan_verimi")

# ---- İNVERTER: garanti sınıfı ----
inv("aşırı DC gerilim → DIŞ ETKEN",
    {"igbt": 75, "sogutucu": 55, "thd": 6.0, "dc_gerilim": 480,
     "nominal_dc": 400, "kopru_sicakliklari": [60, 62, 61],
     "temel_kopru_yayilim": 2.0},
    garanti="dis_etken", calisma_gun=500)
inv("erken köprü sapması → ÜRETİM",
    {"igbt": 60, "sogutucu": 50, "thd": 2.0, "dc_gerilim": 400,
     "nominal_dc": 400, "kopru_sicakliklari": [60, 62, 92],
     "temel_kopru_yayilim": 2.0},
    garanti="uretim", calisma_gun=90)


# ══════════════════ ÖLÇÜM ══════════════════

def _ozet_arizaya_ozgu(sonuc):
    """ozet_metin genel 'normal' cümlesi değil, arızaya özgü mü?"""
    metin = fizik.ozet_metin(sonuc)
    return bool(metin) and "normal aralıkta" not in metin and len(metin) > 25


def olc():
    sayac = {k: [0, 0] for k in
             ("tespit", "yanlis_alarm", "mekanizma", "garanti", "ekran")}
    # [dogru, toplam]
    satirlar = []

    for tip, katalog in (("aku", AKU), ("inverter", INV)):
        for s in katalog:
            if tip == "aku":
                deg = fizik.aku_degerlendir(s["olcum"])
            else:
                deg = fizik.inverter_degerlendir(s["olcum"])

            arizali = not s["saglikli"]
            seviye = deg.get("seviye")
            tespit_edildi = seviye in ("uyari", "kritik")

            satir = {"ad": s["ad"], "seviye": seviye}

            if s["saglikli"]:
                sayac["yanlis_alarm"][1] += 1
                dogru = not tespit_edildi
                if dogru:
                    sayac["yanlis_alarm"][0] += 1
                satir["sonuc"] = "temiz" if dogru else "YANLIŞ ALARM"
            else:
                sayac["tespit"][1] += 1
                if tespit_edildi:
                    sayac["tespit"][0] += 1
                satir["sonuc"] = "tespit" if tespit_edildi else "KAÇIRDI"

                # mekanizma isabeti
                if s["mekanizma"]:
                    sayac["mekanizma"][1] += 1
                    if deg.get("oncelikli") == s["mekanizma"]:
                        sayac["mekanizma"][0] += 1
                        satir["mek"] = "✓"
                    else:
                        satir["mek"] = f"✗({deg.get('oncelikli')})"

                # ekran mesajı
                sayac["ekran"][1] += 1
                if _ozet_arizaya_ozgu(deg):
                    sayac["ekran"][0] += 1
                    satir["ekran"] = "✓"
                else:
                    satir["ekran"] = "✗"

                # garanti sınıfı
                if s["garanti"]:
                    sayac["garanti"][1] += 1
                    ka = kaynak.kaynak_analizi(
                        s["olcum"], degerlendirme=deg,
                        calisma_gun=s.get("calisma_gun"))
                    if ka["sinif"] == s["garanti"]:
                        sayac["garanti"][0] += 1
                        satir["gar"] = f"✓{ka['sinif']}"
                    else:
                        satir["gar"] = f"✗{ka['sinif']}≠{s['garanti']}"

            satirlar.append(satir)

    return sayac, satirlar


def olc_ongoru():
    """Kötüleşen zaman serisinde erken öngörü (kalan_sure 'tahmin')."""
    dogru = 0
    toplam = 0
    senaryolar = []

    # Hücre farkı günden güne büyüyor → eşiğe kalan gün tahmini
    gecmis = []
    for g in range(14):
        fark = 6 + g * 2.2   # 6 → ~35 mV, kritiğe doğru
        gecmis.append({"zaman": f"2026-09-{g+1:02d}", "hucre_farki_mv": fark})
    r1 = fizik.aku_kalan_sure(gecmis, temel_fark_mv=6.0)
    senaryolar.append(("hücre farkı büyüyor", r1.get("durum")))
    toplam += 1
    if r1.get("durum") in ("tahmin", "esik_asildi"):
        dogru += 1

    # İç direnç günden güne artıyor → ömür sonu eşiğine tahmin
    gecmis2 = []
    for g in range(14):
        d = 0.005 * (1 + g * 0.05)   # yavaş artış
        gecmis2.append({"zaman": f"2026-09-{g+1:02d}", "ic_direnc": d,
                        "max_sicaklik": 25})
    r2 = fizik.aku_kalan_sure(gecmis2, temel_direnc=0.005)
    senaryolar.append(("iç direnç artıyor", r2.get("durum")))
    toplam += 1
    if r2.get("durum") in ("tahmin", "esik_asildi"):
        dogru += 1

    # Kararlı seri → tahmin YAPMAMALI (sahte öngörü üretmemeli)
    sabit = [{"zaman": f"2026-09-{g+1:02d}", "hucre_farki_mv": 8.0}
             for g in range(14)]
    r3 = fizik.aku_kalan_sure(sabit, temel_fark_mv=8.0)
    senaryolar.append(("kararlı (tahmin olmamalı)", r3.get("durum")))
    toplam += 1
    if r3.get("durum") in ("kararli", "tahmin_yok", "uzun_vadeli"):
        dogru += 1

    return dogru, toplam, senaryolar


# ══════════════════ RAPOR ══════════════════

def yuzde(pay, payda):
    return 100.0 * pay / payda if payda else 0.0


if __name__ == "__main__":
    sayac, satirlar = olc()
    ong_dogru, ong_toplam, ong_sen = olc_ongoru()

    print("FİZİK MOTORU DOĞRULUK / KAPSAM RAPORU")
    print("=" * 64)
    print("(Etiketler fizik beklentisine göre; saha-doğrulanmış veri değil.)\n")

    print("Senaryo bazında:")
    for s in satirlar:
        ek = []
        if "mek" in s:   ek.append(f"mek {s['mek']}")
        if "gar" in s:   ek.append(f"gar {s['gar']}")
        if "ekran" in s: ek.append(f"ekran {s['ekran']}")
        print(f"  [{s['sonuc']:>12}] {s['ad']:<38} "
              f"({s['seviye']}) {'  '.join(ek)}")

    print("\nÖngörü (kalan süre) senaryoları:")
    for ad, durum in ong_sen:
        print(f"  {ad:<34} → {durum}")

    print("\n" + "=" * 64)
    print("ÖZET (% doğruluk):")
    etiket = {
        "tespit":       "Arıza tespiti (duyarlılık)",
        "yanlis_alarm": "Yanlış alarm yok (özgüllük)",
        "mekanizma":    "Doğru mekanizma (kaynak)",
        "garanti":      "Garanti sınıfı isabeti",
        "ekran":        "Ekran mesajı arızaya özgü",
    }
    toplam_dogru = toplam_hepsi = 0
    for k in ("tespit", "yanlis_alarm", "mekanizma", "garanti", "ekran"):
        d, t = sayac[k]
        toplam_dogru += d
        toplam_hepsi += t
        print(f"  {etiket[k]:<34} {yuzde(d, t):5.1f}%  ({d}/{t})")
    print(f"  {'Erken öngörü (kalan süre)':<34} "
          f"{yuzde(ong_dogru, ong_toplam):5.1f}%  ({ong_dogru}/{ong_toplam})")

    toplam_dogru += ong_dogru
    toplam_hepsi += ong_toplam
    print("-" * 64)
    print(f"  {'GENEL':<34} {yuzde(toplam_dogru, toplam_hepsi):5.1f}%  "
          f"({toplam_dogru}/{toplam_hepsi})")

    # Kaçırma / yanlış alarm varsa çıkış kodu 1 (CI için)
    kacirma = sayac["tespit"][1] - sayac["tespit"][0]
    yanlis = sayac["yanlis_alarm"][1] - sayac["yanlis_alarm"][0]
    print("=" * 64)
    if kacirma or yanlis:
        print(f"UYARI: {kacirma} kaçırma, {yanlis} yanlış alarm.")
        sys.exit(1)
    print("Kaçırma yok, yanlış alarm yok.")
    sys.exit(0)
