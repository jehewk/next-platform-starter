"""Firmware paketlerini DEVIR.md §4'teki backend mantığıyla doğrular.

Aşağıdaki `backend_kaydi` fonksiyonu lambda_function.py'deki
POST /de/aku/veri gövdesinin birebir kopyasıdır (kimlik doğrulama hariç).
Her paket bu fonksiyondan hatasız geçmeli ve sözleşme kurallarına uymalı.
"""
import json
import sys
from decimal import Decimal

ZORUNLU = {"cihaz_id", "anahtar", "gerilim", "akim", "soc", "cevrim",
           "hucreler", "sicakliklar", "sarj_mos", "desarj_mos", "hata_kodlari"}
ESKI_PROTOKOL = {"inverter_id", "hucre_fark"}


def backend_kaydi(body):
    hucreler = body.get('hucreler', [])
    sicakliklar = body.get('sicakliklar', [])
    kayit = {
        'gerilim':   Decimal(str(body.get('gerilim', 0))),
        'akim':      Decimal(str(body.get('akim', 0))),
        'soc':       Decimal(str(body.get('soc', 0))),
        'cevrim':    Decimal(str(body.get('cevrim', 0))),
        'hucreler':  [Decimal(str(h)) for h in hucreler],
        'sicakliklar': [Decimal(str(t)) for t in sicakliklar],
        'sarj_mos':    bool(body.get('sarj_mos', True)),
        'desarj_mos':  bool(body.get('desarj_mos', True)),
        'hata_kodlari': body.get('hata_kodlari', []),
    }
    if hucreler:
        enY, enD = max(hucreler), min(hucreler)
        kayit['max_hucre_mv'] = Decimal(str(enY))
        kayit['min_hucre_mv'] = Decimal(str(enD))
        kayit['hucre_farki_mv'] = Decimal(str(enY - enD))
        kayit['min_hucre_no'] = hucreler.index(enD) + 1
    if sicakliklar:
        kayit['max_sicaklik'] = Decimal(str(max(sicakliklar)))
    if body.get('ic_direnc'):
        kayit['ic_direnc'] = Decimal(str(body['ic_direnc']))
    return kayit


hatalar = []
paketler = [json.loads(s) for s in sys.stdin if s.strip()]
kayitlar = []
for i, p in enumerate(paketler, 1):
    eksik = ZORUNLU - p.keys()
    fazla = p.keys() - ZORUNLU - {"ic_direnc"}
    if eksik: hatalar.append(f"#{i} eksik alan: {eksik}")
    if fazla: hatalar.append(f"#{i} sözleşme dışı alan: {fazla}")
    if p.keys() & ESKI_PROTOKOL: hatalar.append(f"#{i} eski Inverter AI alanı var")
    if not all(isinstance(h, int) and 2000 <= h <= 3800 for h in p["hucreler"]):
        hatalar.append(f"#{i} hücre mV aralık/tip dışı: {p['hucreler']}")
    if len(p["hucreler"]) != 16: hatalar.append(f"#{i} 16 hücre bekleniyordu")
    if not 0 <= p["soc"] <= 100: hatalar.append(f"#{i} soc aralık dışı")
    if abs(sum(p["hucreler"]) / 1000 - p["gerilim"]) > 0.05:
        hatalar.append(f"#{i} paket gerilimi hücre toplamıyla uyuşmuyor")
    for h in p["hata_kodlari"]:
        if set(h) != {"kod", "mesaj", "seviye"} or h["seviye"] not in ("bilgi", "uyari", "kritik"):
            hatalar.append(f"#{i} hata kodu biçimi: {h}")
    if "ic_direnc" in p and not 0.001 <= p["ic_direnc"] <= 0.5:
        hatalar.append(f"#{i} ic_direnc aralık dışı: {p['ic_direnc']}")
    try:
        kayitlar.append(backend_kaydi(p))
    except Exception as e:
        hatalar.append(f"#{i} backend mantığında hata: {e!r}")

# Senaryonun beklenen olayları gerçekten üretildi mi?
kodlar = {h["kod"] for p in paketler for h in p["hata_kodlari"]}
direncler = [p["ic_direnc"] for p in paketler if "ic_direnc" in p]
farklar = [int(k['hucre_farki_mv']) for k in kayitlar]
beklenen = {
    "iç direnç en az bir kez tahmin edildi": bool(direncler),
    "arızada hücre farkı 80 mV'u aştı (H01)": "H01" in kodlar,
    "en düşük hücre 7 olarak bulundu": any(k['min_hucre_no'] == 7 for k in kayitlar[-5:]),
    "boş pakette deşarj kesildi (H03)": "H03" in kodlar and any(not p["desarj_mos"] for p in paketler),
    "sıcakta şarj kesildi (T02)": "T02" in kodlar and any(not p["sarj_mos"] for p in paketler),
    "4. sensör −40 (bağlı değil)": all(p["sicakliklar"][3] == -40 for p in paketler),
}
for ad, ok in beklenen.items():
    if not ok: hatalar.append(f"senaryo: {ad} — GERÇEKLEŞMEDİ")

print(f"{len(paketler)} paket · hücre farkı {min(farklar)}→{max(farklar)} mV · "
      f"iç direnç {direncler[:3]} Ω · kodlar {sorted(kodlar)}")
for ad, ok in beklenen.items():
    print(("  ✓ " if ok else "  ✗ ") + ad)
print("\nÖrnek paket:\n" + json.dumps(paketler[len(paketler) // 2], ensure_ascii=False))
if hatalar:
    print("\nHATALAR:\n" + "\n".join(hatalar[:30]))
    sys.exit(1)
print("\nTüm paketler sözleşmeye uygun.")
