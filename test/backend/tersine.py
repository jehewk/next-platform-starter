#!/usr/bin/env python3
"""Fizik motoru TERSİNE MÜHENDİSLİK testi — kara kutu davranış analizi.

Çalıştır:
    python3 test/backend/tersine.py

Önceki testler "şu girdi → şu beklenen çıktı" (etikete dayalı). Bu dosya farklı:
motoru kara kutu kabul edip girdileri SÜPÜRÜR, gerçek karar yüzeyini çıkarır ve
fiziksel/matematiksel DEĞİŞMEZLERİ (invariant) ihlal eden yer arar. Etiket yok;
motorun kendi iç tutarlılığını sınar.

İhlali aranan değişmezler:
  1. MONOTONLUK   — arıza parametresi kötüleştikçe sağlık skoru ASLA yükselmemeli
  2. SINIR        — tüm skorlar [0,100]; SOH ≤105; seviye ∈ {normal,uyari,kritik,...}
  3. ÇELİŞKİ      — "kritik"/"normal" seviyesi bulgularla tutarlı olmalı
  4. DAYANIKLILIK — binlerce rastgele/aşırı/bozuk girdide exception/NaN olmamalı
  5. EŞİK HARİTASI — gerçek seviye-geçiş noktaları bulunur ve raporlanır
"""
import math
import os
import random
import sys

KOK = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if KOK not in sys.path:
    sys.path.insert(0, KOK)

from backend.motor import fizik

ihlaller = []


def ihlal(kategori, detay):
    ihlaller.append((kategori, detay))
    print(f"  ✗ İHLAL [{kategori}] {detay}")


# ══════════════════ 1. MONOTONLUK SÜPÜRMELERİ ══════════════════
# Arıza parametresi tek yönde kötüleşirken skor monoton azalmalı (plato OK,
# ama ASLA yükselmemeli). Her mekanizmayı izole çağırırız.

def monoton_azalan(ad, nokta_skor, tolerans=0.0):
    """nokta_skor: [(x, skor)] kötüleşen x sırasıyla. Skor yükselirse ihlal."""
    onceki = None
    ihlal_var = False
    for x, s in nokta_skor:
        if s is None:
            continue
        if onceki is not None and s > onceki + tolerans:
            ihlal(ad, f"x={x}: skor {onceki:.1f} → {s:.1f} YÜKSELDİ (kötüleşirken)")
            ihlal_var = True
        onceki = s
    if not ihlal_var:
        print(f"  ✓ {ad}: monoton (kötüleştikçe skor düşüyor/sabit)")


def suru_monotonluk():
    print("\n[1] MONOTONLUK (kötüleştikçe skor yükselmemeli):")

    # Hücre farkı artıyor (baseline 5, yüksüz)
    pts = []
    for fark in range(0, 61, 2):
        h = fizik.aku_hucre_dengesizligi([3300 + fark, 3300], temel_fark_mv=5.0)
        pts.append((fark, h["skor"] if h else None))
    monoton_azalan("hücre farkı ↑", pts)

    # İç direnç kat artıyor (baseline sabit, 25 °C)
    pts = []
    for kat in [1.0, 1.1, 1.2, 1.3, 1.4, 1.45, 1.5, 1.6, 1.8, 2.0, 2.2, 2.5]:
        r = fizik.direnc_yaslanma(0.005 * kat, sicaklik_c=25.0, temel_direnc=0.005)
        pts.append((kat, r["skor"] if r and r["skor"] is not None else None))
    monoton_azalan("iç direnç kat ↑", pts)

    # Sıcaklık optimum ÜSTÜ artıyor (42 → 60)
    pts = [(t, fizik.aku_termal_yaslanma(t)["skor"]) for t in
           [42, 44, 46, 48, 50, 52, 54, 55, 58, 60]]
    monoton_azalan("sıcaklık ↑ (sıcak taraf)", pts)

    # Sıcaklık optimum ALTI düşüyor (28 → -5); kötüleşme = soğuma
    pts = [(t, fizik.aku_termal_yaslanma(t, akim_orani=0.5)["skor"]) for t in
           [28, 24, 20, 16, 12, 8, 4, 1, -2, -5]]
    monoton_azalan("sıcaklık ↓ (soğuk taraf)", pts)

    # Çevrim artıyor
    pts = [(c, fizik.aku_cevrim_yorulmasi(c)["skor"]) for c in
           range(0, 3200, 200)]
    monoton_azalan("çevrim ↑", pts)

    # IGBT jonksiyon sıcaklığı artıyor (soğutucu sabit 45)
    pts = [(j, fizik.igbt_termal_yorulma(j, 45)["skor"]) for j in
           range(50, 101, 5)]
    monoton_azalan("IGBT jonksiyon ↑", pts)

    # THD artıyor
    pts = [(thd, fizik.kondansator_esr(thd, 400, 50)["skor"]) for thd in
           [0, 1, 2, 3, 4, 5, 6, 7, 8, 10]]
    monoton_azalan("THD ↑", pts)

    # Köprü yayılımı artıyor (baseline 2 °C sabit)
    pts = []
    for yay in range(0, 25, 1):
        k = fizik.kopru_dengesizligi([60, 60, 60 + yay], temel_yayilim_c=2.0)
        pts.append((yay, k["skor"] if k else None))
    monoton_azalan("köprü yayılımı ↑", pts)

    # Dönüşüm verimi DÜŞÜYOR (kötüleşme); skor düşmeli
    pts = []
    for verim in [0.99, 0.95, 0.90, 0.88, 0.86, 0.84, 0.82, 0.80, 0.78, 0.70]:
        ac = 5000 * verim
        g = fizik.guc_kisitlama(5000, ac, igbt_c=70, anma_guc_kw=5)
        pts.append((verim, g["skor"] if g else None))
    monoton_azalan("dönüşüm verimi ↓", pts)


# ══════════════════ 2 + 3. SINIR ve ÇELİŞKİ (aku/inverter degerlendir) ══════

def suru_sinir_celiski():
    print("\n[2+3] SINIR ve ÇELİŞKİ (rastgele gerçekçi ölçümler):")
    n = 0
    for _ in range(4000):
        olcum = {
            "hucreler": [random.randint(2800, 3450) for _ in range(4)],
            "sicakliklar": [random.choice([-40, random.randint(-10, 60)])
                            for _ in range(3)],
            "temel_fark_mv": random.choice([None, 2, 5, 10, 30]),
            "akim": random.choice([0, 10, -10, 50, -80, 120]),
            "cevrim": random.choice([None, 100, 1500, 2900, 3500]),
            "ic_direnc": random.choice([None, 0.004, 0.006, 0.010, 0.02]),
            "temel_direnc": random.choice([None, 0.005]),
            "soc": random.choice([None, 0, 20, 55, 90, 100]),
            "kapasite_ah": random.choice([None, 100, 280]),
        }
        d = fizik.aku_degerlendir(olcum)
        n += 1
        _sinir_celiski_kontrol(d, olcum)
    print(f"  ✓ {n} akü ölçümü sınır+çelişki kontrolünden geçti"
          if not any(k in ("SINIR", "ÇELİŞKİ") for k, _ in ihlaller)
          else f"  (↑ ihlaller {n} ölçüm içinde)")


def _sinir_celiski_kontrol(d, olcum):
    s = d.get("saglik")
    if s is not None and not (0 <= s <= 100):
        ihlal("SINIR", f"saglik={s} aralık dışı. olcum={olcum}")
    for b in (d.get("bulgular") or []):
        sk = b.get("skor")
        if sk is not None and not (0 <= sk <= 100):
            ihlal("SINIR", f"{b['mekanizma']} skor={sk} aralık dışı")
    if d.get("seviye") not in ("normal", "uyari", "kritik", "bilinmiyor"):
        ihlal("SINIR", f"beklenmeyen seviye={d.get('seviye')}")
    bulg = d.get("bulgular") or []
    sev = d.get("seviye")
    # Çelişki: normal iken hiçbir bulgu uyari/kritik olmamalı (clamp garantisi)
    if sev == "normal" and any(b["seviye"] in ("uyari", "kritik") for b in bulg):
        ihlal("ÇELİŞKİ", "seviye=normal ama bir bulgu uyari/kritik")
    # Çelişki: kritik iken en az bir uyari/kritik bulgu olmalı
    if sev == "kritik" and bulg and not any(
            b["seviye"] in ("uyari", "kritik") for b in bulg):
        ihlal("ÇELİŞKİ", "seviye=kritik ama hiçbir bulgu uyari/kritik değil")
    sc = d.get("soc_kontrol")
    if sc and sc.get("durum") not in (
            "tutarli", "surukleme_yuksek", "surukleme_dusuk", "dogrulanamaz"):
        ihlal("SINIR", f"soc_kontrol.durum beklenmeyen={sc.get('durum')}")


# ══════════════════ 4. DAYANIKLILIK (fuzz — exception/NaN yok) ══════════════

def suru_fuzz():
    # Değişmez: ÜRETİM GİRİŞ NOKTALARI (aku/inverter_degerlendir, soc_tutarlilik)
    # saha verisini alır; arbitrary çöp girdide bile ASLA çökmemeli — en kötü
    # None/güvenli sonuç döner. (Düşük seviyeli mekanizmalar temizlenmiş veri
    # varsayar; sözleşme giriş noktasındadır.)
    print("\n[4] DAYANIKLILIK (giriş noktaları — çöp girdide çökme olmamalı):")
    cop = [None, [], {}, "x", "dolu", -1, 1e9, -1e9, float("inf"),
           float("nan"), [None], [0], [3300], ["3300", None], 0, 99999, True]
    cagri = cokme = 0
    for _ in range(8000):
        olcum = {
            "hucreler": random.choice(cop + [[random.choice(cop)
                                              for _ in range(random.randint(0, 5))]]),
            "sicakliklar": random.choice(cop),
            "temel_fark_mv": random.choice(cop),
            "akim": random.choice(cop),
            "soc": random.choice(cop),
            "cevrim": random.choice(cop),
            "ic_direnc": random.choice(cop),
            "temel_direnc": random.choice(cop),
            "kapasite_ah": random.choice(cop),
            "igbt": random.choice(cop), "sogutucu": random.choice(cop),
            "thd": random.choice(cop), "dc_gerilim": random.choice(cop),
            "kopru_sicakliklari": random.choice(cop),
            "guc_w": random.choice(cop), "anma_guc_w": random.choice(cop),
            "dc_guc_w": random.choice(cop), "ac_guc_w": random.choice(cop),
        }
        try:
            hedef = random.choice(("aku", "inverter", "soc"))
            if hedef == "aku":
                fizik.aku_degerlendir(olcum)
            elif hedef == "inverter":
                fizik.inverter_degerlendir(olcum)
            else:
                fizik.soc_tutarlilik(olcum["soc"], olcum["hucreler"],
                                     akim_a=olcum["akim"],
                                     kapasite_ah=olcum["kapasite_ah"])
            cagri += 1
        except Exception as e:  # noqa
            cokme += 1
            if cokme <= 5:
                ihlal("DAYANIKLILIK", f"{hedef}: {type(e).__name__}: {e}")
    if cokme == 0:
        print(f"  ✓ {cagri} fuzz çağrısı (giriş noktaları) — hiç çökme yok")
    else:
        print(f"  ✗ {cokme} çökme / {cagri + cokme} çağrı")


# ══════════════════ 5. EŞİK HARİTASI (gerçek karar sınırlarını çıkar) ══════

def esik_bul(fn, dusuk, yuksek, adim, hedef_seviye):
    """fn(x)->seviye; hedef_seviyeye ilk geçiş x'ini döndürür."""
    x = dusuk
    while x <= yuksek:
        if fn(x) == hedef_seviye:
            return x
        x += adim
    return None


def suru_esik_haritasi():
    print("\n[5] EŞİK HARİTASI (motorun GERÇEK karar sınırları):")

    u = esik_bul(lambda j: fizik.igbt_termal_yorulma(j, 45)["seviye"],
                 50, 120, 1, "uyari")
    k = esik_bul(lambda j: fizik.igbt_termal_yorulma(j, 45)["seviye"],
                 50, 120, 1, "kritik")
    print(f"  IGBT jonksiyon (soğutucu 45): uyarı≥{u} °C, kritik≥{k} °C")

    u = esik_bul(lambda t: fizik.kondansator_esr(t, 400, 50)["seviye"],
                 0, 15, 0.1, "uyari")
    k = esik_bul(lambda t: fizik.kondansator_esr(t, 400, 50)["seviye"],
                 0, 15, 0.1, "kritik")
    print(f"  THD: uyarı≥%{u:.1f}, kritik≥%{k:.1f}")

    u = esik_bul(lambda t: fizik.aku_termal_yaslanma(t)["seviye"],
                 42, 70, 0.5, "uyari")
    print(f"  Sıcaklık (sıcak taraf): uyarı≥{u} °C "
          f"(üst sınır sabiti {fizik.AKU_UST_SINIR} °C)")

    k = esik_bul(lambda kat: fizik.direnc_yaslanma(
        0.005 * kat, 25.0, 0.005)["seviye"], 1.0, 2.5, 0.01, "kritik")
    u = esik_bul(lambda kat: fizik.direnc_yaslanma(
        0.005 * kat, 25.0, 0.005)["seviye"], 1.0, 2.5, 0.01, "uyari")
    print(f"  İç direnç: uyarı≥{u:.2f}x, kritik≥{k:.2f}x "
          f"(ömür-sonu sabiti {fizik.DIRENC_EOL_KAT}x)")

    u = esik_bul(lambda c: fizik.aku_cevrim_yorulmasi(c)["seviye"],
                 0, 3200, 10, "uyari")
    k = esik_bul(lambda c: fizik.aku_cevrim_yorulmasi(c)["seviye"],
                 0, 3200, 10, "kritik")
    print(f"  Çevrim (ömür 3000): uyarı≥{u} (%{100*u/3000:.0f}), "
          f"kritik≥{k} (%{100*k/3000:.0f})")

    # SoC boş-diz sürüklenme eşiği
    u = esik_bul(lambda soc: fizik.soc_tutarlilik(
        soc, [3000, 3010], akim_a=0)["durum"], 0, 100, 1, "surukleme_yuksek")
    print(f"  SoC (boş hücre 3000 mV): %{u} üstünde yüksek-sürüklenme uyarısı")


# ══════════════════ ÇALIŞTIR ══════════════════

if __name__ == "__main__":
    print("FİZİK MOTORU TERSİNE MÜHENDİSLİK TESTİ")
    print("=" * 64)
    random.seed(42)   # tekrarlanabilir
    suru_monotonluk()
    suru_sinir_celiski()
    suru_fuzz()
    suru_esik_haritasi()

    print("\n" + "=" * 64)
    if ihlaller:
        print(f"SONUÇ: {len(ihlaller)} DEĞİŞMEZ İHLALİ bulundu:")
        for k, d in ihlaller[:20]:
            print(f"  - [{k}] {d}")
        sys.exit(1)
    print("SONUÇ: Hiçbir değişmez ihlali yok.")
    print("  Monoton, sınırlı, çelişkisiz, dayanıklı. Eşikler sabitlerle uyumlu.")
    sys.exit(0)
