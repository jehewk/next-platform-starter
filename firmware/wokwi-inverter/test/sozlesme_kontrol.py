"""İnverter firmware paketlerini backend sözleşmesiyle doğrular.

`backend_kaydi`, POST /de/inverter/veri alım mantığının kopyasıdır. Saklanan
alanlar, panelin okuduğu alanlarla (servis.js inverterDetayUyarla) aynıdır.
Her paket bu fonksiyondan hatasız geçmeli ve aralık/senaryo kurallarına uymalı.

Not: Depodaki örnek backend (test/backend/ornek-backend.py) alımı sadeleştirip
igbt/sogutucu/gunluk_kwh saklar; canlı backend panelin okuduğu tüm alanları
saklar. Bu test canlı sözleşmeyi (tam alan kümesi) temel alır.
"""
import json
import sys
from decimal import Decimal

ZORUNLU = {"cihaz_id", "anahtar", "igbt", "sogutucu", "dc_gerilim", "ac_gerilim",
           "frekans", "guc_faktoru", "thd", "gunluk_kwh", "hata_kodlari"}
ESKI_PROTOKOL = {"inverter_id", "hucre_fark", "uretim_wh"}


def backend_kaydi(body):
    """Canlı /de/inverter/veri alımının sakladığı kayıt (kimlik hariç)."""
    return {
        "igbt":        Decimal(str(body.get("igbt", 0))),
        "sogutucu":    Decimal(str(body.get("sogutucu", 0))),
        "dc_gerilim":  Decimal(str(body.get("dc_gerilim", 0))),
        "ac_gerilim":  Decimal(str(body.get("ac_gerilim", 0))),
        "frekans":     Decimal(str(body.get("frekans", 0))),
        "guc_faktoru": Decimal(str(body.get("guc_faktoru", 0))),
        "thd":         Decimal(str(body.get("thd", 0))),
        "gunluk_kwh":  Decimal(str(body.get("gunluk_kwh", 0))),
        "hata_kodlari": body.get("hata_kodlari", []),
    }


hatalar = []
paketler = [json.loads(s) for s in sys.stdin if s.strip()]
if not paketler:
    print("paket yok"); sys.exit(1)

kayitlar = []
for i, p in enumerate(paketler, 1):
    eksik = ZORUNLU - p.keys()
    fazla = p.keys() - ZORUNLU
    if eksik: hatalar.append(f"#{i} eksik alan: {eksik}")
    if fazla: hatalar.append(f"#{i} sözleşme dışı alan: {fazla}")
    if p.keys() & ESKI_PROTOKOL: hatalar.append(f"#{i} eski protokol alanı var")
    if not 0 <= p["igbt"] <= 150: hatalar.append(f"#{i} igbt aralık dışı: {p['igbt']}")
    if not p["sogutucu"] <= p["igbt"] + 0.1:
        hatalar.append(f"#{i} soğutucu IGBT'den sıcak olamaz: {p['sogutucu']}>{p['igbt']}")
    if not 300 <= p["dc_gerilim"] <= 450: hatalar.append(f"#{i} dc_gerilim aralık dışı: {p['dc_gerilim']}")
    if not 180 <= p["ac_gerilim"] <= 260: hatalar.append(f"#{i} ac_gerilim aralık dışı: {p['ac_gerilim']}")
    if not 49 <= p["frekans"] <= 51: hatalar.append(f"#{i} frekans aralık dışı: {p['frekans']}")
    if not 0.0 <= p["guc_faktoru"] <= 1.0: hatalar.append(f"#{i} guc_faktoru aralık dışı: {p['guc_faktoru']}")
    if not 0.0 <= p["thd"] <= 30: hatalar.append(f"#{i} thd aralık dışı: {p['thd']}")
    if p["gunluk_kwh"] < 0: hatalar.append(f"#{i} gunluk_kwh negatif")
    for h in p["hata_kodlari"]:
        if set(h) != {"kod", "mesaj", "seviye"} or h["seviye"] not in ("bilgi", "uyari", "kritik"):
            hatalar.append(f"#{i} hata kodu biçimi: {h}")
    try:
        kayitlar.append(backend_kaydi(p))
    except Exception as e:
        hatalar.append(f"#{i} backend mantığında hata: {e!r}")

# Senaryonun beklenen olayları gerçekten üretildi mi?
kodlar = {h["kod"] for p in paketler for h in p["hata_kodlari"]}
kwh = [float(p["gunluk_kwh"]) for p in paketler]
igbtler = [float(p["igbt"]) for p in paketler]
thdler = [float(p["thd"]) for p in paketler]
pfler = [float(p["guc_faktoru"]) for p in paketler]
# gün dönümü: bir paketin kWh'ı öncekinden küçükse sayaç sıfırlanmış demektir
sifirlandi = any(kwh[i] < kwh[i - 1] - 0.01 for i in range(1, len(kwh)))

beklenen = {
    "gün içi kWh birikti (tepe > 0)": max(kwh) > 0,
    "gün dönümünde kWh sıfırlandı": sifirlandi,
    "yük/arıza ile IGBT uyarı eşiğini aştı": max(igbtler) >= 70,
    "arızada THD uyarısı çıktı (K01/K02)": ("K01" in kodlar) or ("K02" in kodlar),
    "arızada güç faktörü düştü (G01)": "G01" in kodlar and min(pfler) < 0.92,
    "soğutma zayıflama uyarısı (S01)": "S01" in kodlar,
}
for ad, ok in beklenen.items():
    if not ok: hatalar.append(f"senaryo: {ad} — GERÇEKLEŞMEDİ")

print(f"{len(paketler)} paket · IGBT {min(igbtler):.0f}→{max(igbtler):.0f} °C · "
      f"THD {min(thdler):.1f}→{max(thdler):.1f}% · kWh tepe {max(kwh):.1f} · kodlar {sorted(kodlar)}")
for ad, ok in beklenen.items():
    print(("  ✓ " if ok else "  ✗ ") + ad)
print("\nÖrnek paket:\n" + json.dumps(paketler[len(paketler) // 2], ensure_ascii=False))
if hatalar:
    print("\nHATALAR:\n" + "\n".join(hatalar[:30]))
    sys.exit(1)
print("\nTüm paketler sözleşmeye uygun.")
