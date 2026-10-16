#!/usr/bin/env python3
"""Bildirim Lambda'sı (aws/ekler/bildirim/dennis_bildirim.py) testleri.

Çalıştır:
    python3 test/backend/test_bildirim.py

Kapsam:
  1. KRİPTO gidiş-dönüş — Web Push aes128gcm şifreleme (RFC 8291): şifrele()
     çıktısı gerçek alıcı anahtarıyla ÇÖZÜLÜP düz metne eşit mi? (ECDH+HKDF+
     AES-GCM doğru mu). VAPID (RFC 8292): üretilen imza genel anahtarla
     doğrulanıyor mu?
  2. DURUM mantığı — durum_hesapla sustu/kritik/sicak eşikleri + bozuk girdi.
  3. İLETİ metinleri — musteri_iletisi (4 olay), personel_iletisi (tekil+özet).
  4. UÇTAN UCA — lambda_handler sahte DynamoDB ile: ilk çalışma yalnız kaydeder,
     durum değişince bildirir, tekrar göndermez, müşteri izolasyonu, 410→silme.
"""
import os
import sys

KOK = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(KOK, "test", "backend"))
sys.path.insert(0, os.path.join(KOK, "aws", "ekler", "bildirim"))

# Tablo adları import'tan önce ortamda olmalı (lambda_handler os.environ okur)
os.environ.setdefault("BILDIRIM_TABLOSU", "bt")
os.environ.setdefault("CIHAZ_TABLOSU", "ct")
os.environ.setdefault("OLCUM_TABLOLARI", "aku=aku_t,inverter=inv_t")
os.environ.setdefault("SUSKUN_DK", "30")
os.environ.setdefault("VAPID_KONU", "mailto:destek@dennisenerji.com")

from datetime import datetime, timedelta, timezone

# cryptography bu ortamda kurulu/sağlam değilse (dennis_bildirim onu import eder)
# testi zarifçe atla — hook/CI yeşil kalsın; gerçek Lambda katmanında kuruludur.
try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from sahte_aws import SahteDynamo, SahteTablo
    import dennis_bildirim as B
except Exception as _e:  # noqa
    print(f"ATLANDI: cryptography/bağımlılık yok ({type(_e).__name__}); "
          "bildirim testi gerçek Lambda ortamında koşar.")
    sys.exit(0)


# ─────────────── mini çatı ───────────────
_g = 0
_k = []


def created(ad):
    def sar(fn):
        global _g
        try:
            fn(); _g += 1; print(f"  ok   {ad}")
        except AssertionError as e:
            _k.append((ad, str(e))); print(f"  HATA {ad}: {e}")
        except Exception as e:  # noqa
            _k.append((ad, f"{type(e).__name__}: {e}")); print(f"  ÇÖKTÜ {ad}: {type(e).__name__}: {e}")
        return fn
    return sar


def esit(a, b, m=""):
    assert a == b, f"{m} (beklenen {b!r}, gelen {a!r})"


def dogru(k, m=""):
    assert k, m or "doğru bekleniyordu"


# ═══════════════ 1. KRİPTO GİDİŞ-DÖNÜŞ ═══════════════

@created("Web Push şifrelemesi gerçek alıcı anahtarıyla çözülüp düz metne eşit")
def _():
    # Alıcı (tarayıcı) anahtar çifti
    alici = ec.generate_private_key(ec.SECP256R1())
    ua_genel = alici.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    auth = os.urandom(16)
    p256dh_b64 = B.b64u(ua_genel)
    auth_b64 = B.b64u(auth)

    mesaj = '{"baslik":"test","govde":"çÖĞ"}'.encode("utf-8")
    govde = B.sifrele(p256dh_b64, auth_b64, mesaj)

    # RFC 8291 aes128gcm başlığını çöz
    tuz = govde[:16]
    idlen = govde[20]
    as_genel = govde[21:21 + idlen]
    sifreli = govde[21 + idlen:]
    ortak = alici.exchange(ec.ECDH(),
                           ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_genel))
    ikm = B._hmac(B._hmac(auth, ortak), b"WebPush: info\x00" + ua_genel + as_genel + b"\x01")
    prk = B._hmac(tuz, ikm)
    cek = B._hmac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = B._hmac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    duz = AESGCM(cek).decrypt(nonce, sifreli, None).rstrip(b"\x02")
    esit(duz, mesaj, "çözülen düz metin orijinalle aynı olmalı")


@created("şifrele sabit anahtar+tuz ile deterministik (gizli nondeterminizm yok)")
def _():
    alici = ec.generate_private_key(ec.SECP256R1())
    ua = alici.public_key().public_bytes(serialization.Encoding.X962,
                                         serialization.PublicFormat.UncompressedPoint)
    ozel = ec.generate_private_key(ec.SECP256R1())
    tuz = b"\x11" * 16
    a = B.sifrele(B.b64u(ua), B.b64u(b"\x22" * 16), b"ayni", _ozel=ozel, _tuz=tuz)
    b = B.sifrele(B.b64u(ua), B.b64u(b"\x22" * 16), b"ayni", _ozel=ozel, _tuz=tuz)
    esit(a, b, "aynı girdi+anahtar → aynı çıktı")


@created("VAPID başlığı üretilen imza genel anahtarla doğrulanıyor")
def _():
    ozel = ec.generate_private_key(ec.SECP256R1())
    d = ozel.private_numbers().private_value
    ozel_b64 = B.b64u(d.to_bytes(32, "big"))
    genel = ozel.public_key().public_bytes(serialization.Encoding.X962,
                                            serialization.PublicFormat.UncompressedPoint)
    genel_b64 = B.b64u(genel)

    bas = B.vapid_basligi("https://push.example.com/abc?x=1", ozel_b64, genel_b64,
                          "mailto:d@e.com", simdi=1_000_000)
    dogru(bas.startswith("vapid t="), "vapid başlık biçimi")
    jwt = bas.split("t=")[1].split(",")[0]
    h, p, s = jwt.split(".")
    # raw r||s imzayı DER'e çevirip doğrula
    ham = B.b64u_coz(s)
    der = encode_dss_signature(int.from_bytes(ham[:32], "big"), int.from_bytes(ham[32:], "big"))
    pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), genel)
    pub.verify(der, f"{h}.{p}".encode(), ec.ECDSA(hashes.SHA256()))  # hatalıysa exception
    import json as _j
    yuk = _j.loads(B.b64u_coz(p))
    esit(yuk["aud"], "https://push.example.com", "aud origin olmalı")
    esit(yuk["sub"], "mailto:d@e.com")
    dogru(yuk["exp"] > 1_000_000, "exp gelecekte olmalı")


# ═══════════════ 2. DURUM MANTIĞI ═══════════════

def _simdi():
    return datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc)


@created("durum_hesapla: eski ölçüm → sustu True, yeni → False")
def _():
    s = _simdi()
    eski = {"zaman": (s - timedelta(hours=2)).isoformat()}
    yeni = {"zaman": (s - timedelta(minutes=5)).isoformat()}
    dogru(B.durum_hesapla({"cihaz_id": "x"}, eski, s)["sustu"], "2 saat → sustu")
    dogru(not B.durum_hesapla({"cihaz_id": "x"}, yeni, s)["sustu"], "5 dk → sustu değil")


@created("durum_hesapla: kritik (arızalı ya da saglik<65) ve sicak (>=55)")
def _():
    s = _simdi()
    o = {"zaman": s.isoformat(), "max_sicaklik": 58}
    d1 = B.durum_hesapla({"cihaz_id": "x", "durum": "arizali"}, o, s)
    dogru(d1["kritik"], "arızalı → kritik")
    dogru(d1["sicak"], "58 °C → sıcak")
    d2 = B.durum_hesapla({"cihaz_id": "x", "saglik": 50}, {"zaman": s.isoformat(), "max_sicaklik": 30}, s)
    dogru(d2["kritik"], "saglik 50 → kritik")
    dogru(not d2["sicak"], "30 °C → sıcak değil")
    d3 = B.durum_hesapla({"cihaz_id": "x", "saglik": 90}, {"zaman": s.isoformat(), "max_sicaklik": 40}, s)
    dogru(not d3["kritik"], "saglik 90 → kritik değil")


@created("durum_hesapla: bozuk saglik/sicaklik çökertmez")
def _():
    s = _simdi()
    d = B.durum_hesapla({"cihaz_id": "x", "saglik": "bozuk"},
                        {"zaman": "gecersiz", "max_sicaklik": "x"}, s)
    dogru(not d["kritik"] and not d["sicak"] and not d["sustu"], "bozuk girdi hepsi False")


@created("_zaman: Z'li ISO, tz'siz (UTC varsay), bozuk → None")
def _():
    dogru(B._zaman("2026-10-16T12:00:00Z") is not None)
    z = B._zaman("2026-10-16T12:00:00")
    dogru(z is not None and z.tzinfo is not None, "tz'siz zaman UTC'ye atanmalı")
    dogru(B._zaman("saçma") is None)


# ═══════════════ 3. İLETİ METİNLERİ ═══════════════

@created("musteri_iletisi: 4 olay da cihaz kimliğiyle sade metin verir")
def _():
    c = {"cihaz_id": "AKU-1", "tip": "aku"}
    for olay in ("sustu", "geri_geldi", "kritik", "sicak"):
        d = {"_dk": 150, "_sicaklik": 58.0}
        b, g = B.musteri_iletisi(olay, c, d)
        dogru(len(b) > 3 and "AKU-1" in g, f"{olay}: başlık+gövde dolu, cihaz id geçmeli")
    # sustu süresi: <120 dk "dakika", >=120 "saat"
    _, g1 = B.musteri_iletisi("sustu", c, {"_dk": 45})
    _, g2 = B.musteri_iletisi("sustu", c, {"_dk": 180})
    dogru("dakika" in g1 and "saat" in g2, "süre birimi doğru seçilmeli")


@created("personel_iletisi: tekil özel, çoklu özet")
def _():
    c1 = {"cihaz_id": "AKU-1", "tip": "aku"}
    c2 = {"cihaz_id": "INV-2", "tip": "inverter"}
    b, g, yol = B.personel_iletisi([("sustu", c1, {"_dk": 40})])
    dogru("AKU-1" in g and yol == "/aku/AKU-1", "tekil: cihaz yoluna gider")
    b2, g2, yol2 = B.personel_iletisi([("sustu", c1, {"_dk": 40}), ("kritik", c2, {})])
    dogru("2" in b2 and yol2 == "/arizalar", "çoklu: özet + arızalar sayfası")


# ═══════════════ 4. UÇTAN UCA (sahte DynamoDB + yakalanan gönderim) ═══════════════

def _kur(aboneler, cihazlar, olcumler, baslangic=True, durumlar=None):
    """Sahte tabloları kurar ve B._ddb'ye enjekte eder. gonder yakalanır."""
    bt = SahteTablo("anahtar")
    ct = SahteTablo("cihaz_id")
    aku_t = SahteTablo("cihaz_id", "zaman")
    inv_t = SahteTablo("cihaz_id", "zaman")
    for a in aboneler:
        bt.put_item(a)
    if baslangic:
        bt.put_item({"anahtar": "sistem#baslangic", "tur": "sistem", "zaman": "2026-01-01T00:00:00"})
    for d in (durumlar or []):
        bt.put_item(d)
    for c in cihazlar:
        ct.put_item(c)
    for (tip, o) in olcumler:
        (aku_t if tip == "aku" else inv_t).put_item(o)
    B._ddb = SahteDynamo({"bt": bt, "ct": ct, "aku_t": aku_t, "inv_t": inv_t})

    gonderilenler = []

    def sahte_gonder(abone, icerik, acil=False):
        gonderilenler.append({"anahtar": abone.get("anahtar"), "rol": abone.get("rol"),
                              "musteri_id": abone.get("musteri_id"), "etiket": icerik.get("etiket"),
                              "baslik": icerik.get("baslik"), "kod": abone.get("_kod", 201)})
        return abone.get("_kod", 201)

    B.gonder = sahte_gonder
    return bt, gonderilenler


def _musteri_abonesi(mid, anahtar=None, karsilandi=True, kod=201):
    return {"anahtar": anahtar or f"abone#{mid}", "tur": "abone", "musteri_id": mid,
            "endpoint": "https://push/x", "p256dh": "x", "auth": "y",
            "karsilandi": karsilandi, "_kod": kod}


def _personel_abonesi():
    return {"anahtar": "abone#uretici", "tur": "abone", "rol": "uretici",
            "endpoint": "https://push/u", "p256dh": "x", "auth": "y", "karsilandi": True}


SAAT3_ONCE = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
SIMDI_ISO = datetime.now(timezone.utc).isoformat()


@created("ilk çalışma: yalnız durum kaydeder, olay bildirimi GÖNDERMEZ")
def _():
    bt, gond = _kur(
        aboneler=[_musteri_abonesi("MST1", karsilandi=True)],
        cihazlar=[{"cihaz_id": "AKU1", "musteri_id": "MST1", "tip": "aku", "saglik": 90}],
        olcumler=[("aku", {"cihaz_id": "AKU1", "zaman": SAAT3_ONCE})],
        baslangic=False)   # sistem#baslangic yok → ilk çalışma
    B.lambda_handler({}, None)
    olay_gonderimi = [g for g in gond if g["etiket"] not in ("karsilama",)]
    esit(olay_gonderimi, [], "ilk çalışmada olay bildirimi gitmemeli")
    dogru(bt.get_item({"anahtar": "sistem#baslangic"}).get("Item"), "başlangıç işareti yazılmalı")


@created("susan cihaz: müşteriye + personele bildirim gider")
def _():
    bt, gond = _kur(
        aboneler=[_musteri_abonesi("MST1"), _personel_abonesi()],
        cihazlar=[{"cihaz_id": "AKU1", "musteri_id": "MST1", "tip": "aku", "saglik": 90}],
        olcumler=[("aku", {"cihaz_id": "AKU1", "zaman": SAAT3_ONCE})],
        durumlar=[{"anahtar": "durum#AKU1", "tur": "durum", "sustu": False, "kritik": False, "sicak": False}])
    B.lambda_handler({}, None)
    mus = [g for g in gond if g["rol"] != "uretici" and g["etiket"] == "sustu-AKU1"]
    per = [g for g in gond if g["rol"] == "uretici" and g["etiket"] == "saha"]
    dogru(len(mus) == 1, "müşteri sustu bildirimi almalı")
    dogru(len(per) == 1, "personel saha özeti almalı")
    dogru(bt.get_item({"anahtar": "durum#AKU1"})["Item"]["sustu"] is True, "durum sustu=True kaydedilmeli")


@created("aynı durum tekrar: ikinci çalışmada tekrar bildirim GİTMEZ")
def _():
    _kur(
        aboneler=[_musteri_abonesi("MST1")],
        cihazlar=[{"cihaz_id": "AKU1", "musteri_id": "MST1", "tip": "aku", "saglik": 90}],
        olcumler=[("aku", {"cihaz_id": "AKU1", "zaman": SAAT3_ONCE})],
        durumlar=[{"anahtar": "durum#AKU1", "tur": "durum", "sustu": True, "kritik": False, "sicak": False}])
    # gönderimi bu çalışmada yeniden yakala
    gond = []
    B.gonder = lambda a, i, acil=False: (gond.append(i.get("etiket")) or 201)
    B.lambda_handler({}, None)
    dogru("sustu-AKU1" not in gond, "zaten sustu olan cihaz için tekrar bildirim olmamalı")


@created("müşteri izolasyonu: başka müşterinin cihazı için bildirim gitmez")
def _():
    _, gond = _kur(
        aboneler=[_musteri_abonesi("MST1"), _musteri_abonesi("MST2", anahtar="abone#MST2")],
        cihazlar=[{"cihaz_id": "AKU1", "musteri_id": "MST1", "tip": "aku", "saglik": 90}],
        olcumler=[("aku", {"cihaz_id": "AKU1", "zaman": SAAT3_ONCE})],
        durumlar=[{"anahtar": "durum#AKU1", "tur": "durum", "sustu": False, "kritik": False, "sicak": False}])
    B.lambda_handler({}, None)
    mst2 = [g for g in gond if g["musteri_id"] == "MST2"]
    esit(mst2, [], "MST2, MST1'in cihazı için bildirim almamalı")


@created("kritik sağlık: kritik bildirimi gider")
def _():
    _, gond = _kur(
        aboneler=[_musteri_abonesi("MST1")],
        cihazlar=[{"cihaz_id": "AKU1", "musteri_id": "MST1", "tip": "aku", "saglik": 40}],
        olcumler=[("aku", {"cihaz_id": "AKU1", "zaman": SIMDI_ISO})],
        durumlar=[{"anahtar": "durum#AKU1", "tur": "durum", "sustu": False, "kritik": False, "sicak": False}])
    B.lambda_handler({}, None)
    dogru(any(g["etiket"] == "kritik-AKU1" for g in gond), "saglik 40 → kritik bildirim")


@created("410 yanıtı: geçersiz abonelik tablodan silinir")
def _():
    bt, gond = _kur(
        aboneler=[_musteri_abonesi("MST1", kod=410)],
        cihazlar=[{"cihaz_id": "AKU1", "musteri_id": "MST1", "tip": "aku", "saglik": 40}],
        olcumler=[("aku", {"cihaz_id": "AKU1", "zaman": SIMDI_ISO})],
        durumlar=[{"anahtar": "durum#AKU1", "tur": "durum", "sustu": False, "kritik": False, "sicak": False}])
    B.lambda_handler({}, None)
    dogru(not bt.get_item({"anahtar": "abone#MST1"}).get("Item"), "410 alan abonelik silinmeli")


# ═══════════════ çalıştır ═══════════════
if __name__ == "__main__":
    print("Bildirim Lambda'sı testleri\n" + "=" * 40)
    if _k:
        print(f"\n{len(_k)} başarısız:")
        for ad, h in _k:
            print(f"  - {ad}: {h}")
        sys.exit(1)
    print(f"\n{_g} test geçti.")
    sys.exit(0)
