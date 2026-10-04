#!/usr/bin/env python3
"""Fizik motoru senaryo testleri — bilinen giriş → beklenen çıkış.

Çalıştır:
    python3 test/backend/test_fizik.py

Motor saf fizik (model yok), bu yüzden her senaryonun çıktısı önceden
bilinebilir ve savunulabilir. Testler iki şeyi birden korur:
  1. Mekanizma skorları/seviyeleri doğru yönde (soğuk→risk, dengeli→normal…)
  2. Arıza kaynağı sınıflandırması garanti kararını doğru veriyor
     (soğuk şarj→kullanım, baştan ayrışma→üretim, aşırı gerilim→dış etken)

Kritik olan: motor canlı lambda'ya gömülü; bu testler repo kopyasının
davranışını kilitler, böylece bir değişiklik sessizce kararı bozarsa yakalanır.
"""
import os
import sys

# backend/ paketini içe aktarılabilir yap
KOK = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if KOK not in sys.path:
    sys.path.insert(0, KOK)

from backend.motor import fizik, kaynak


# ══════════════════ mini test çatısı ══════════════════

_gecen = 0
_kalan = []


def created(ad):
    def sar(fn):
        global _gecen
        try:
            fn()
            _gecen += 1
            print(f"  ok   {ad}")
        except AssertionError as e:
            _kalan.append((ad, str(e)))
            print(f"  HATA {ad}: {e}")
        except Exception as e:  # noqa
            _kalan.append((ad, f"{type(e).__name__}: {e}"))
            print(f"  ÇÖKTÜ {ad}: {type(e).__name__}: {e}")
        return fn
    return sar


def esit(a, b, mesaj=""):
    assert a == b, f"{mesaj} (beklenen {b!r}, gelen {a!r})"


def dogru(k, mesaj=""):
    assert k, mesaj or "doğru bekleniyordu"


# ══════════════════ 1. SICAKLIK DÜZELTMESİ ══════════════════

@created("soğukta SOH düzeltmesi gerçek kaybı geri kazandırır")
def _():
    # -10 °C'de ölçülen %78 SOH, gerçekte sıcaklık düzeltilince daha yüksek
    d = fizik.soh_duzelt(78.0, -10.0)
    dogru(d["duzeltme_uygulandi"], "soğukta düzeltme uygulanmalı")
    dogru(d["duzeltilmis_soh"] > d["olculen_soh"],
          "soğukta düzeltilmiş SOH ölçülenden yüksek olmalı")
    dogru(d["gecici_kayip"] > 0, "geçici kayıp pozitif olmalı")


@created("referans sıcaklıkta düzeltme yapılmaz")
def _():
    d = fizik.soh_duzelt(90.0, 25.0)
    dogru(not d["duzeltme_uygulandi"], "25 °C'de düzeltme gereksiz")
    dogru(abs(d["duzeltilmis_soh"] - d["olculen_soh"]) < 2.0,
          "referansta SOH neredeyse değişmez")


@created("kapasite sapması soğukta negatif, sıcakta pozitife yakın")
def _():
    soguk = fizik.kapasite_sapmasi(-10.0)
    ilik  = fizik.kapasite_sapmasi(25.0)
    dogru(soguk < ilik, "soğukta sapma daha olumsuz olmalı")
    dogru(abs(ilik) < 2.0, "25 °C'de sapma sıfıra yakın olmalı")


# ══════════════════ 2. HÜCRE DENGESİZLİĞİ ══════════════════

@created("dengeli paket normal döner")
def _():
    h = fizik.aku_hucre_dengesizligi([3301, 3300, 3302, 3299],
                                     temel_fark_mv=3.0)
    esit(h["seviye"], "normal", "dengeli paket normal olmalı")
    dogru(h["skor"] >= 90, "dengeli pakette skor yüksek")


@created("baseline'ın 3 katına çıkan fark kritik")
def _():
    # temel 10 mV iken 45 mV → trend 4.5x ve mutlak fark yüksek
    h = fizik.aku_hucre_dengesizligi([3320, 3300, 3295, 3275],
                                     temel_fark_mv=10.0)
    esit(h["seviye"], "kritik", "trend 3x üstü + yüksek fark kritik olmalı")
    dogru(h["trend_orani"] >= 2.5, "trend oranı kritik eşiği aşmalı")


@created("yük düzeltmesi: yüksek akımdaki fark normalize edilir")
def _():
    # 50 mV ham fark ama 100 A yük altında → düzeltilmiş fark çok daha düşük
    yuksuz = fizik.aku_hucre_dengesizligi([3350, 3300], temel_fark_mv=8.0,
                                          akim_a=0)
    yuklu = fizik.aku_hucre_dengesizligi([3350, 3300], temel_fark_mv=8.0,
                                         akim_a=100)
    dogru(yuklu["duzeltilmis_fark_mv"] < yuksuz["duzeltilmis_fark_mv"],
          "yük altındaki fark düzeltmeyle küçülmeli")
    dogru(yuklu["yuk_carpani"] > 1.0, "yük çarpanı 1'den büyük olmalı")


@created("baseline yokken trend hesaplanmaz, mutlak eşiğe düşülür")
def _():
    h = fizik.aku_hucre_dengesizligi([3330, 3300], temel_fark_mv=None)
    dogru(h["trend_orani"] is None, "baseline yoksa trend None olmalı")
    # 30 mV mutlak fark: uyarı eşiği (15) ile kritik (40) arası → uyarı
    esit(h["seviye"], "uyari", "baseline yokken mutlak eşik uygulanır")


# ══════════════════ 3. TERMAL YAŞLANMA (U-eğrisi) ══════════════════

@created("optimum bandta termal risk sıfır")
def _():
    t = fizik.aku_termal_yaslanma(35.0)
    esit(t["yon"], "optimum")
    esit(t["seviye"], "normal")
    dogru(t["risk"] < 0.1, "optimum bandta risk ~0")


@created("sıcakta kimyasal yaşlanma uyarısı")
def _():
    t = fizik.aku_termal_yaslanma(52.0)
    esit(t["yon"], "sicak")
    dogru(t["risk"] > 0, "sıcakta risk pozitif")
    dogru(t["seviye"] in ("uyari", "kritik"))


@created("soğukta da risk var (çift yönlü U-eğrisi)")
def _():
    t = fizik.aku_termal_yaslanma(5.0, akim_orani=0.5)
    esit(t["yon"], "soguk")
    dogru(t["risk"] > 0, "soğukta risk pozitif olmalı")


@created("Arrhenius: +10 °C takvim yaşlanmasını ~2 katına çıkarır")
def _():
    t35 = fizik.aku_termal_yaslanma(35.0)
    t45 = fizik.aku_termal_yaslanma(45.0)
    oran = t45["takvim_hizlanma"] / t35["takvim_hizlanma"]
    dogru(1.8 <= oran <= 2.2, f"10 °C ~2x beklenir, gelen {oran:.2f}")


# ══════════════════ 4. İÇ DİRENÇ ══════════════════

@created("baseline yokken iç direnç 'bilinmiyor' döner")
def _():
    r = fizik.direnc_yaslanma(0.005, sicaklik_c=25.0, temel_direnc=None)
    esit(r["seviye"], "bilinmiyor")
    dogru(r["skor"] is None, "baseline yoksa skor yok")


@created("direnç 2 katına çıkınca ömür sonu (kritik)")
def _():
    r = fizik.direnc_yaslanma(0.010, sicaklik_c=25.0, temel_direnc=0.005)
    esit(r["seviye"], "kritik", "2x direnç ömür sonu olmalı")
    dogru(r["artis_kat"] >= 2.0)


@created("sıcaklık düzeltmesi: sıcakta ölçülen direnç 25 °C'de daha yüksektir")
def _():
    # Akü iç direnci sıcakla DÜŞER; sıcakta okunan değer düşük çıkar, 25 °C
    # eşdeğerine çevrilince yükselir (yoksa sıcak cihaz sahte sağlıklı görünür).
    r25 = fizik.direnc_sicaklik_duzelt(0.010, 45.0)
    dogru(r25 > 0.010, "sıcakta okunan direncin 25 °C eşdeğeri daha yüksek olmalı")
    # soğukta okunan değer ise yüksek çıkar, 25 °C'ye inince düşer
    rsoguk = fizik.direnc_sicaklik_duzelt(0.010, 5.0)
    dogru(rsoguk < 0.010, "soğukta okunan direncin 25 °C eşdeğeri daha düşük olmalı")


# ══════════════════ 5. İNVERTER MEKANİZMALARI ══════════════════

@created("normal IGBT termal fark sağlıklı")
def _():
    i = fizik.igbt_termal_yorulma(55.0, 45.0)
    esit(i["seviye"], "normal")


@created("yüksek IGBT jonksiyonu kritik")
def _():
    i = fizik.igbt_termal_yorulma(95.0, 55.0)
    esit(i["seviye"], "kritik")


@created("faz kolu dengesizliği baseline'a göre kritik")
def _():
    # temel yayılım 2 °C iken 8 °C → 4x, kritik
    k = fizik.kopru_dengesizligi([60, 60, 68], temel_yayilim_c=2.0)
    esit(k["seviye"], "kritik")
    esit(k["en_sicak_kol"], 3)


@created("küçük faz yayılımı gürültü sayılır (normal)")
def _():
    k = fizik.kopru_dengesizligi([60, 61, 62], temel_yayilim_c=1.0)
    esit(k["seviye"], "normal", "4 °C altı yayılım alarm vermemeli")


@created("güç kısıtlama: düşük dönüşüm verimi tespit edilir")
def _():
    g = fizik.guc_kisitlama(dc_guc_w=5000, ac_guc_w=4100, igbt_c=70,
                            anma_guc_kw=5)
    dogru(g["seviye"] in ("uyari", "kritik"), "%82 verim kısıtlama sayılmalı")


# ══════════════════ 6. KALAN SÜRE ══════════════════

@created("yetersiz ölçümle kalan süre tahmini yapılmaz")
def _():
    r = fizik.kalan_sure([10, 11, 12], kritik_esik=40, artan=True)
    esit(r["durum"], "yetersiz_veri")


@created("kararlı göstergede 'kararlı' döner, uydurma tahmin yok")
def _():
    sabit = [20.0] * 10
    r = fizik.kalan_sure(sabit, kritik_esik=40, artan=True)
    esit(r["durum"], "kararli")


@created("artan trendde kalan gün tahmini mantıklı")
def _():
    # 10'dan 28'e lineer artış, eşik 40 → birkaç adım daha
    seri = [10 + i * 2 for i in range(10)]   # 10,12,...,28
    r = fizik.kalan_sure(seri, kritik_esik=40, olcum_araligi_saat=24, artan=True)
    esit(r["durum"], "tahmin")
    dogru(r["kalan_gun"] > 0, "kalan gün pozitif olmalı")
    dogru(r["alt_sinir_gun"] <= r["kalan_gun"] <= r["ust_sinir_gun"],
          "güven aralığı tahmini kapsamalı")


@created("eşik zaten aşılmışsa müdahale uyarısı")
def _():
    seri = [30 + i for i in range(10)]    # 30..39, mevcut 45 eşik üstü
    r = fizik.kalan_sure(seri, kritik_esik=40, mevcut=45, artan=True)
    esit(r["durum"], "esik_asildi")
    esit(r["kalan_saat"], 0)


# ══════════════════ 7. TOPLU DEĞERLENDİRME ══════════════════

@created("sağlıklı akü ölçümü normal değerlendirilir")
def _():
    s = fizik.aku_degerlendir({
        "hucreler": [3300, 3301, 3299, 3302],
        "sicakliklar": [32, 33, 32],
        "temel_fark_mv": 3.0,
        "cevrim": 200,
    })
    esit(s["seviye"], "normal")
    dogru(s["saglik"] >= 85)


@created("en kötü mekanizma önceliklendirilir (%70 ağırlık)")
def _():
    # hücre kritik, geri kalan iyi → genel skor kötü mekanizmaya yakın
    s = fizik.aku_degerlendir({
        "hucreler": [3340, 3300, 3295, 3270],
        "sicakliklar": [33, 34, 33],
        "temel_fark_mv": 8.0,
        "cevrim": 300,
    })
    esit(s["oncelikli"], "hucre_dengesizligi")
    dogru(s["bulgular"][0]["mekanizma"] == "hucre_dengesizligi",
          "en kötü bulgu başta sıralanmalı")


@created("özet metin insan diliyle ve mekanizmaya özgü")
def _():
    s = fizik.aku_degerlendir({
        "hucreler": [3340, 3300, 3295, 3270],
        "sicakliklar": [33, 34, 33],
        "temel_fark_mv": 8.0,
    })
    metin = fizik.ozet_metin(s)
    dogru(len(metin) > 20, "özet dolu olmalı")
    dogru("hücre" in metin.lower() or "fark" in metin.lower(),
          "dengesizlik özetinde hücre/fark geçmeli")


# ══════════════════ 8. ARIZA KAYNAĞI (GARANTİ KARARI) ══════════════════

@created("soğuk şarj → KULLANIM kaynaklı (garanti dışı)")
def _():
    olcum = {
        "hucreler": [3310, 3300, 3295, 3285],
        "sicakliklar": [-8, -7, -8],
        "sicaklik": -8,
        "akim": 20,          # şarj (pozitif), 0 °C altında
        "sarjda": True,
        "kapasite_ah": 100,
        "temel_fark_mv": 8.0,
    }
    sonuc = kaynak.kaynak_analizi(olcum, calisma_gun=400)
    esit(sonuc["sinif"], "kullanim", "soğukta şarj kullanım hatası olmalı")
    dogru("garanti" in sonuc["garanti_yorum"].lower())
    dogru(len(sonuc["kanit"]) >= 1, "kanıt üretilmeli")


@created("baştan var olan, büyümeyen ayrışma → ÜRETİM kaynaklı (garanti içi)")
def _():
    # trend düşük (baştan yüksek), mutlak fark uyarı seviyesinde, ılıman sıcaklık
    olcum = {
        "hucreler": [3330, 3300, 3298, 3296],
        "sicakliklar": [30, 31, 30],
        "sicaklik": 30,
        "akim": -10,          # deşarj, soğuk şarj sinyali yok
        "sarjda": False,
        "kapasite_ah": 100,
        "temel_fark_mv": 28.0,   # baştan ~30 mV, trend ~1.1x
    }
    sonuc = kaynak.kaynak_analizi(olcum, calisma_gun=120)
    esit(sonuc["sinif"], "uretim", "baştan ayrışma üretim hatası olmalı")
    dogru("garanti kapsamında" in sonuc["garanti_yorum"].lower())


@created("aşırı DC gerilim → DIŞ ETKEN (garanti dışı, ürün kusuru değil)")
def _():
    olcum = {
        "igbt": 75, "sogutucu": 55,
        "thd": 6.0,
        "dc_gerilim": 480, "nominal_dc": 400,   # %20 aşım
        "kopru_sicakliklari": [60, 62, 61],
        "temel_kopru_yayilim": 2.0,
    }
    deg = fizik.inverter_degerlendir(olcum)
    sonuc = kaynak.kaynak_analizi(olcum, degerlendirme=deg, calisma_gun=500)
    esit(sonuc["sinif"], "dis_etken", "aşırı gerilim dış etken olmalı")
    dogru("kusuru değil" in sonuc["garanti_yorum"].lower() or
          "dış etken" in sonuc["garanti_yorum"].lower())


@created("normal cihazda sınıflandırılacak arıza yok → belirsiz, güven 0")
def _():
    olcum = {
        "hucreler": [3300, 3301, 3299, 3300],
        "sicakliklar": [32, 33, 32],
        "temel_fark_mv": 3.0,
    }
    sonuc = kaynak.kaynak_analizi(olcum, calisma_gun=300)
    esit(sonuc["sinif"], "belirsiz")
    esit(sonuc["guven"], 0.0)


@created("tekil hücre kusuru → ÜRETİM (üretim hatasının imzası)")
def _():
    # tek hücre belirgin kopuk, diğerleri dengeli
    olcum = {
        "hucreler": [3300, 3301, 3265, 3299],  # hücre 3 ~35 mV kopuk
        "sicakliklar": [30, 31, 30],
        "sicaklik": 30,
        "akim": -5,
        "sarjda": False,
        "temel_fark_mv": 30.0,   # trend düşük tutmak için
    }
    sonuc = kaynak.kaynak_analizi(olcum, calisma_gun=150)
    esit(sonuc["sinif"], "uretim", "tekil hücre kusuru üretim olmalı")


@created("çelişen kanıt güveni düşürür ve şeffaf not ekler")
def _():
    # hem soğuk şarj (kullanım) hem baştan ayrışma (üretim) işareti
    olcum = {
        "hucreler": [3330, 3300, 3298, 3296],
        "sicakliklar": [-6, -5, -6],
        "sicaklik": -6,
        "akim": 15,            # soğuk şarj → kullanım sinyali
        "sarjda": True,
        "kapasite_ah": 100,
        "temel_fark_mv": 28.0,  # baştan yüksek → üretim sinyali
    }
    sonuc = kaynak.kaynak_analizi(olcum, calisma_gun=120)
    dogru(sonuc["guven"] < 0.9, "çelişen kanıtta güven düşmeli")
    notlar = " ".join(sonuc["gerekceler"]).lower()
    dogru("not:" in notlar, "çelişen kanıt şeffaf biçimde belirtilmeli")


@created("her kaynak sonucu garanti yorumu ve kanıt taşır")
def _():
    olcum = {
        "hucreler": [3310, 3300, 3295, 3285],
        "sicakliklar": [-8, -7, -8], "sicaklik": -8,
        "akim": 20, "sarjda": True, "kapasite_ah": 100,
        "temel_fark_mv": 8.0,
    }
    sonuc = kaynak.kaynak_analizi(olcum, calisma_gun=400)
    for alan in ("sinif", "sinif_adi", "guven", "garanti_yorum",
                 "gerekceler", "kanit"):
        dogru(alan in sonuc, f"sonuçta {alan} alanı olmalı")


# ══════════════════ 9. YAMA J: _birlestir canlıya taşınır ══════════════════

# yamala.py'yi içe aktar (fizik düzeltmesini canlı Lambda'ya uygulayan yama)
sys.path.insert(0, os.path.join(KOK, "aws", "ekler"))
import yamala  # noqa: E402

# Düzeltme ÖNCESİ _birlestir (iki clamp, uyari koruması yok) — hatayı üretir
_ONCE = '''
def _birlestir(bulgular, tip, ek=None):
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
    sonuc = {"tip": tip, "saglik": saglik, "seviye": seviye, "bulgular": bulgular}
    return sonuc


def lambda_handler(event, context):
    return None
'''


@created("yama J: düzeltme öncesi motorda yüksek skorlu uyarı 'normal' sayılır (hata)")
def _():
    ns = {}
    exec(_ONCE, ns)
    # en kötü uyarı skoru 88, diğeri 94 → harmanlanmış 89 ≥ 85 → normal (hata)
    bulgular = [{"mekanizma": "a", "seviye": "uyari", "skor": 88},
                {"mekanizma": "b", "seviye": "normal", "skor": 94}]
    r = ns["_birlestir"](list(bulgular), "aku")
    esit(r["seviye"], "normal", "düzeltme öncesi hatalı davranışın kanıtı")


@created("yama J: _birlestir'e uyarı koruması uygulanır ve davranışı düzeltir")
def _():
    yeni, uygulandi = yamala.yama_birlestir_uyari(_ONCE)
    dogru(uygulandi, "yama uygulanmalı")
    compile(yeni, "test", "exec")   # sözdizimi geçerli
    ns = {}
    exec(yeni, ns)
    bulgular = [{"mekanizma": "a", "seviye": "uyari", "skor": 88},
                {"mekanizma": "b", "seviye": "normal", "skor": 94}]
    r = ns["_birlestir"](list(bulgular), "aku")
    esit(r["seviye"], "uyari", "yamalı motor uyarıyı korumalı")


@created("yama J: idempotent — ikinci kez uygulanmaz")
def _():
    yeni, _u = yamala.yama_birlestir_uyari(_ONCE)
    tekrar, uygulandi = yamala.yama_birlestir_uyari(yeni)
    dogru(not uygulandi, "ikinci uygulamada değişiklik olmamalı")
    esit(tekrar, yeni, "idempotent: içerik aynı kalmalı")


@created("yama J: fizik motoru gömülü değilse güvenle atlanır")
def _():
    try:
        yamala.yama_birlestir_uyari("def lambda_handler(e, c):\n    return None\n")
        dogru(False, "motor yoksa YamaAtla beklenir")
    except yamala.YamaAtla:
        pass


@created("yama J: depodaki gerçek fizik.py zaten düzeltilmiş (çift uygulanmaz)")
def _():
    with open(os.path.join(KOK, "backend", "motor", "fizik.py"), encoding="utf-8") as f:
        gercek = f.read()
    _yeni, uygulandi = yamala.yama_birlestir_uyari(gercek)
    dogru(not uygulandi, "depo kopyası zaten düzeltme içermeli")


# ══════════════════ çalıştır ══════════════════

if __name__ == "__main__":
    print("Fizik motoru senaryo testleri\n" + "=" * 40)
    if _kalan:
        print(f"\n{len(_kalan)} test başarısız:")
        for ad, h in _kalan:
            print(f"  - {ad}: {h}")
        sys.exit(1)
    print(f"\n{_gecen} test geçti.")
    sys.exit(0)
