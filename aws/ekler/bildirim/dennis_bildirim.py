"""Dennis Energy — anlık bildirim gönderici (Lambda: dennis-bildirim, 10 dakikada bir).

aws/hazirlik-kur.ps1 kurar. Uygulamalar tarayıcı bildirim aboneliğini ana Lambda'ya
(POST /de/bildirim/abone) kaydeder; bu fonksiyon cihazları tarar ve DURUM DEĞİŞTİĞİNDE
bildirim gönderir (aynı durum için tekrar tekrar göndermez):

  sustu       cihazdan SUSKUN_DK dakikadır ölçüm gelmiyor (müşteri + üretici)
  geri_geldi  susan cihaz yeniden veri gönderdi           (yalnızca müşteri)
  kritik      cihaz arızalı ya da sağlık < KRITIK_SAGLIK    (müşteri + üretici)
  sicak       son ölçümde sıcaklık >= SICAK_DERECE °C       (müşteri + üretici)

Müşteri yalnızca kendi cihazları için, sade dille bildirim alır. Üretici/admin
abonelikleri her çalışmada tek bir özet bildirim alır.

İlk çalışmada yalnızca mevcut durum kaydedilir (kurulum anında herkese toplu
bildirim gitmez). Yeni abonelere bir kez "bildirimler açık" iletisi gider.

Web Push şifrelemesi (RFC 8291, aes128gcm) ve VAPID (RFC 8292) burada yazılıdır;
yalnızca `cryptography` paketi gerekir (Lambda katmanı: dennis-bildirim).

Ortam değişkenleri:
  BILDIRIM_TABLOSU  abonelik + durum tablosu (anahtar: "anahtar")
  CIHAZ_TABLOSU     cihaz listesi (cihaz_id, tip, musteri_id, durum, saglik)
  OLCUM_TABLOLARI   "aku=dennis-aku-verileri,inverter=dennis-inverter-verileri"
                    (anahtar: cihaz_id + zaman; son ölçüm buradan okunur)
  VAPID_OZEL, VAPID_GENEL (base64url), VAPID_KONU (mailto:...)
  SUSKUN_DK=30, KRITIK_SAGLIK=65, SICAK_DERECE=55
"""

import base64
import hashlib
import hmac
import json
import os
import struct
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PERSONEL = ("uretici", "admin", "satici")
ADI = {"aku": ("Akü", "Akünüz"), "inverter": ("İnverter", "İnverteriniz")}

_ddb = None


def _tablo(ad):
    global _ddb
    if _ddb is None:
        _ddb = boto3.resource("dynamodb")
    return _ddb.Table(ad)


def _ayar(ad, varsayilan):
    try:
        return float(os.environ.get(ad) or varsayilan)
    except ValueError:
        return float(varsayilan)


# ═══════════════════ Web Push (RFC 8291 + RFC 8292) ═══════════════════

def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def b64u_coz(s):
    s = str(s).strip()
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _hmac(anahtar, veri):
    return hmac.new(anahtar, veri, hashlib.sha256).digest()


def sifrele(p256dh, auth, veri, _ozel=None, _tuz=None):
    """Bildirim içeriğini alıcının anahtarıyla şifreler (aes128gcm, tek kayıt)."""
    ua_genel = b64u_coz(p256dh)
    ua_auth = b64u_coz(auth)
    ozel = _ozel or ec.generate_private_key(ec.SECP256R1())
    as_genel = ozel.public_key().public_bytes(serialization.Encoding.X962,
                                              serialization.PublicFormat.UncompressedPoint)
    ortak = ozel.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_genel))
    ikm = _hmac(_hmac(ua_auth, ortak), b"WebPush: info\x00" + ua_genel + as_genel + b"\x01")
    tuz = _tuz or os.urandom(16)
    prk = _hmac(tuz, ikm)
    cek = _hmac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = _hmac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    sifreli = AESGCM(cek).encrypt(nonce, veri + b"\x02", None)
    return tuz + struct.pack("!I", 4096) + bytes([len(as_genel)]) + as_genel + sifreli


def vapid_basligi(uc, ozel_b64, genel_b64, konu, simdi=None):
    u = urllib.parse.urlsplit(uc)
    d = int.from_bytes(b64u_coz(ozel_b64), "big")
    ozel = ec.derive_private_key(d, ec.SECP256R1())
    bas = b64u(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    yuk = b64u(json.dumps({"aud": f"{u.scheme}://{u.netloc}", "exp": int(simdi or time.time()) + 12 * 3600,
                           "sub": konu}, separators=(",", ":")).encode())
    r, s = decode_dss_signature(ozel.sign(f"{bas}.{yuk}".encode(), ec.ECDSA(hashes.SHA256())))
    imza = b64u(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
    return f"vapid t={bas}.{yuk}.{imza}, k={genel_b64}"


def gonder(abone, icerik, acil=False):
    """Döner: HTTP kodu (201/200 başarılı; 404/410 abonelik geçersiz), bağlantı hatasında 0."""
    govde = sifrele(abone["p256dh"], abone["auth"], json.dumps(icerik, ensure_ascii=False).encode("utf-8"))
    istek = urllib.request.Request(abone["endpoint"], data=govde, method="POST", headers={
        "TTL": "86400", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
        "Urgency": "high" if acil else "normal",
        "Authorization": vapid_basligi(abone["endpoint"], os.environ["VAPID_OZEL"], os.environ["VAPID_GENEL"],
                                       os.environ.get("VAPID_KONU", "mailto:destek@dennisenerji.com")),
    })
    try:
        with urllib.request.urlopen(istek, timeout=10) as y:
            return y.status
    except urllib.error.HTTPError as e:
        print(f"bildirim gonderilemedi {e.code}: {e.read()[:200]!r}")
        return e.code
    except Exception as e:
        print(f"bildirim baglanti hatasi: {type(e).__name__}: {e}")
        return 0


# ═══════════════════ Cihaz durumu ═══════════════════

def _tara(tablo, **arg):
    ogeler, devam = [], None
    while True:
        if devam:
            arg["ExclusiveStartKey"] = devam
        s = tablo.scan(**arg)
        ogeler += s.get("Items", [])
        devam = s.get("LastEvaluatedKey")
        if not devam:
            return ogeler


def _olcum_tablolari():
    sonuc = {}
    for parca in (os.environ.get("OLCUM_TABLOLARI") or "").split(","):
        if "=" in parca:
            tip, ad = parca.split("=", 1)
            sonuc[tip.strip()] = ad.strip()
    return sonuc


def son_olcum(cihaz, tablolar, hatalar):
    """Cihazın en son ölçümü (ya da None)."""
    adlar = [tablolar[cihaz.get("tip")]] if cihaz.get("tip") in tablolar else list(tablolar.values())
    en_son = None
    for ad in adlar:
        if ad in hatalar:
            continue
        try:
            y = _tablo(ad).query(KeyConditionExpression=Key("cihaz_id").eq(cihaz["cihaz_id"]),
                                 ScanIndexForward=False, Limit=1)
        except Exception as e:
            hatalar.add(ad)
            print(f"olcum tablosu okunamadi ({ad}): {type(e).__name__}: {e}")
            continue
        for o in y.get("Items", []):
            if not en_son or str(o.get("zaman", "")) > str(en_son.get("zaman", "")):
                en_son = o
    return en_son


def _zaman(s):
    try:
        z = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return z if z.tzinfo else z.replace(tzinfo=timezone.utc)   # backend UTC, eksiz yazar
    except ValueError:
        return None


def durum_hesapla(cihaz, olcum, simdi):
    suskun = timedelta(minutes=_ayar("SUSKUN_DK", 30))
    z = _zaman(olcum.get("zaman")) if olcum else None
    try:
        saglik = float(cihaz["saglik"]) if cihaz.get("saglik") is not None else None
    except (TypeError, ValueError):
        saglik = None
    try:
        sicaklik = float(olcum.get("max_sicaklik")) if olcum and olcum.get("max_sicaklik") is not None else None
    except (TypeError, ValueError):
        sicaklik = None
    return {
        "sustu": bool(z and simdi - z > suskun),
        "kritik": cihaz.get("durum") == "arizali" or (saglik is not None and saglik < _ayar("KRITIK_SAGLIK", 65)),
        "sicak": bool(sicaklik is not None and sicaklik >= _ayar("SICAK_DERECE", 55)),
        "_dk": int((simdi - z).total_seconds() // 60) if z else None,
        "_sicaklik": sicaklik,
    }


def musteri_iletisi(olay, cihaz, d):
    tip = cihaz.get("tip") if cihaz.get("tip") in ADI else "aku"
    kisa, sizin = ADI[tip]
    cid = cihaz["cihaz_id"]
    if olay == "sustu":
        sure = f"{d['_dk'] // 60} saattir" if d["_dk"] and d["_dk"] >= 120 else f"{d['_dk']} dakikadır"
        return ("Cihazınızdan veri gelmiyor",
                f"{sizin} ({cid}) {sure} veri göndermiyor. Cihazın açık ve internete bağlı olduğunu kontrol edin.")
    if olay == "geri_geldi":
        return ("Cihazınız yeniden bağlandı", f"{sizin} ({cid}) yeniden veri gönderiyor.")
    if olay == "kritik":
        return ("Cihazınız kontrol gerektiriyor",
                f"{sizin} ({cid}) için servis kontrolü gerekiyor. Uygulamadaki Destek sekmesinden bize ulaşın. "
                "Duman, yanık kokusu ya da şişme görürseniz cihazdan uzak durun.")
    return ("Cihazınız çok ısındı",
            f"{sizin} ({cid}) sıcaklığı {d['_sicaklik']:.0f} °C. Çevresinin havalandığından ve "
            "üzerinin açık olduğundan emin olun.")


PERSONEL_AD = {"sustu": "veri göndermiyor", "kritik": "müdahale gerektiriyor", "sicak": "aşırı ısındı"}


def personel_iletisi(olaylar):
    if len(olaylar) == 1:
        olay, c, d = olaylar[0]
        ek = f" ({d['_sicaklik']:.0f} °C)" if olay == "sicak" else f" ({d['_dk']} dk)" if olay == "sustu" else ""
        yol = f"/{'inverter' if c.get('tip') == 'inverter' else 'aku'}/{c['cihaz_id']}"
        return "Saha uyarısı", f"{c['cihaz_id']} {PERSONEL_AD[olay]}{ek}.", yol
    sayim = {}
    for olay, _, _ in olaylar:
        sayim[olay] = sayim.get(olay, 0) + 1
    govde = ", ".join(f"{n} cihaz {PERSONEL_AD[o]}" for o, n in sayim.items())
    return f"Saha uyarısı: {len(olaylar)} yeni durum", govde[0].upper() + govde[1:] + ".", "/arizalar"


# ═══════════════════ Ana akış ═══════════════════

def lambda_handler(event, context):
    simdi = datetime.now(timezone.utc)
    bt = _tablo(os.environ["BILDIRIM_TABLOSU"])
    aboneler = _tara(bt, FilterExpression=Attr("tur").eq("abone"))
    sonuc = {"abone": len(aboneler), "gonderilen": 0, "silinen": 0, "olay": 0}
    silinenler = set()

    def ilet(abone, baslik, govde, yol, etiket, acil=False):
        kod = gonder(abone, {"baslik": baslik, "govde": govde, "yol": yol, "etiket": etiket}, acil)
        if kod in (404, 410):            # abonelik iptal edilmiş / süresi dolmuş
            bt.delete_item(Key={"anahtar": abone["anahtar"]})
            silinenler.add(abone["anahtar"])
            sonuc["silinen"] += 1
            return False
        if 200 <= kod < 300:
            sonuc["gonderilen"] += 1
            return True
        return False

    # Yeni abonelere bir kez karşılama
    for a in aboneler:
        if not a.get("karsilandi"):
            personel = a.get("rol") in PERSONEL
            if ilet(a, "Bildirimler açık",
                    "Sahadaki cihazlarda önemli bir durum olduğunda size buradan haber vereceğiz." if personel else
                    "Cihazınızla ilgili önemli bir durumda size buradan haber vereceğiz.", "/", "karsilama"):
                bt.update_item(Key={"anahtar": a["anahtar"]}, UpdateExpression="SET karsilandi = :z",
                               ExpressionAttributeValues={":z": simdi.isoformat(timespec="seconds")})
    aboneler = [a for a in aboneler if a["anahtar"] not in silinenler]

    cihazlar = [c for c in _tara(_tablo(os.environ["CIHAZ_TABLOSU"])) if c.get("musteri_id") and c.get("cihaz_id")]
    eski = {d["anahtar"][6:]: d for d in _tara(bt, FilterExpression=Attr("tur").eq("durum"))}
    ilk = not bt.get_item(Key={"anahtar": "sistem#baslangic"}).get("Item")
    tablolar, hatalar = _olcum_tablolari(), set()

    olaylar = []   # (olay, cihaz, durum)
    for c in cihazlar:
        olcum = son_olcum(c, tablolar, hatalar)
        d = durum_hesapla(c, olcum, simdi)
        e = eski.get(c["cihaz_id"], {})
        yeni = {k: d[k] for k in ("sustu", "kritik", "sicak")}
        if olcum is None and hatalar:
            # Ölçüm okunamadıysa ölçüme dayalı durumlar bilinmiyor: eskisi korunur
            # (yoksa susan cihaz için yanlışlıkla "yeniden bağlandı" giderdi)
            yeni["sustu"], yeni["sicak"] = bool(e.get("sustu")), bool(e.get("sicak"))
        if not ilk:
            for k in ("sustu", "kritik", "sicak"):
                if yeni[k] and not e.get(k):
                    olaylar.append((k, c, d))
            if e.get("sustu") and not yeni["sustu"]:
                olaylar.append(("geri_geldi", c, d))
        if any(bool(e.get(k)) != yeni[k] for k in yeni) or not e:
            bt.put_item(Item={"anahtar": "durum#" + c["cihaz_id"], "tur": "durum", **yeni,
                              "guncelleme": simdi.isoformat(timespec="seconds")})
    if ilk:
        bt.put_item(Item={"anahtar": "sistem#baslangic", "tur": "sistem", "zaman": simdi.isoformat(timespec="seconds")})
        print(json.dumps({"bildirim": {**sonuc, "ilk_calisma": True, "cihaz": len(cihazlar)}}))
        return sonuc
    sonuc["olay"] = len(olaylar)

    # Müşteriler: yalnızca kendi cihazları
    for olay, c, d in olaylar:
        baslik, govde = musteri_iletisi(olay, c, d)
        for a in aboneler:
            if a["anahtar"] not in silinenler and a.get("rol") not in PERSONEL and a.get("musteri_id") == c["musteri_id"]:
                ilet(a, baslik, govde, f"/cihaz/{c['cihaz_id']}", f"{olay}-{c['cihaz_id']}", olay == "kritik")

    # Personel: çalışma başına tek özet (geri gelen cihazlar hariç)
    personel_olay = [o for o in olaylar if o[0] != "geri_geldi"]
    if personel_olay:
        baslik, govde, yol = personel_iletisi(personel_olay)
        for a in aboneler:
            if a["anahtar"] not in silinenler and a.get("rol") in PERSONEL:
                ilet(a, baslik, govde, yol, "saha", any(o[0] == "kritik" for o in personel_olay))

    print(json.dumps({"bildirim": sonuc}))
    return sonuc
