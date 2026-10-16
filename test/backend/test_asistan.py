#!/usr/bin/env python3
"""Asistan Lambda'sı (aws/ekler/asistan/dennis_asistan.py) testleri.

Çalıştır:
    python3 test/backend/test_asistan.py

Ağ/SDK çağrısı YOK — riskli saf mantık test edilir:
  1. KOTA (para riski) — kullanıcı/toplam günlük limit, koşullu sayaç, tablo
     yoksa/erişilemezse KAPALI kalır (sınırsız çalışmaz).
  2. GÖRSEL (SSRF/boyut riski) — tür beyaz listesi, boyut sınırı, base64, data: öneki.
  3. MESAJ kurma — geçmiş kırpma, baştaki asistan mesajını atma, görsel+bağlam blokları.
  4. BİÇİM dönüşümü — Anthropic → Bedrock/Gemini (rol birleştirme, görsel bloğu).
  5. HATA eşleme — _gemini_hatasi kod→kullanıcı mesajı.
  6. YANITLA kapıları — görsel hatası 400, boş soru 400, yapılandırılmamış 503,
     kota dolu 429, doğru sağlayıcıya yönlendirme (sağlayıcılar mock'lu).
"""
import os
import sys
import types

KOK = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(KOK, "aws", "ekler", "asistan"))

os.environ.setdefault("ASISTAN_KOTA_TABLOSU", "kota")
os.environ.setdefault("ASISTAN_KULLANICI_LIMIT", "30")
os.environ.setdefault("ASISTAN_TOPLAM_LIMIT", "2000")

import base64 as _b64
import dennis_asistan as A


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


# ═══════════════ sahte kota tablosu (koşullu sayaç semantiği) ═══════════════

class _KosulHata(Exception):
    pass


class SahteKotaTablo:
    def __init__(self, patlasin=False):
        self.sayi = {}
        self.patlasin = patlasin
        self.meta = types.SimpleNamespace(client=types.SimpleNamespace(
            exceptions=types.SimpleNamespace(ConditionalCheckFailedException=_KosulHata)))

    def update_item(self, Key, UpdateExpression, ConditionExpression=None,
                    ExpressionAttributeValues=None, **k):
        if self.patlasin:
            raise RuntimeError("tablo erişilemiyor")
        a = Key["anahtar"]
        d = ExpressionAttributeValues
        cur = self.sayi.get(a)
        # ConditionExpression: attribute_not_exists(sayi) OR sayi < :limit
        if cur is not None and not (cur < d[":limit"]):
            raise _KosulHata()
        self.sayi[a] = (cur or 0) + d[":bir"]


class SahteDynamo:
    def __init__(self, tablo):
        self._t = tablo

    def Table(self, ad):
        return self._t


def _event(sub="u1"):
    # sub taşıyan sahte JWT (yalnız payload çözülüyor)
    yuk = _b64.urlsafe_b64encode(('{"sub":"%s"}' % sub).encode()).rstrip(b"=").decode()
    return {"headers": {"Authorization": f"Bearer x.{yuk}.y"}}


# ═══════════════ 1. KOTA ═══════════════

@created("kota: kullanıcı limiti dolunca 429")
def _():
    os.environ["ASISTAN_KULLANICI_LIMIT"] = "2"
    os.environ["ASISTAN_TOPLAM_LIMIT"] = "2000"
    dyn = SahteDynamo(SahteKotaTablo())
    dogru(A._kota(dyn, "u1") is None, "1. soru izinli")
    dogru(A._kota(dyn, "u1") is None, "2. soru izinli")
    sonuc = A._kota(dyn, "u1")
    dogru(sonuc and sonuc[0] == 429, "3. soru limiti aşmalı (429)")
    dogru("hakkınız doldu" in sonuc[1], "kullanıcı limiti mesajı")


@created("kota: toplam limit dolunca 429 (farklı kullanıcılar)")
def _():
    os.environ["ASISTAN_KULLANICI_LIMIT"] = "100"
    os.environ["ASISTAN_TOPLAM_LIMIT"] = "2"
    dyn = SahteDynamo(SahteKotaTablo())
    dogru(A._kota(dyn, "a") is None)
    dogru(A._kota(dyn, "b") is None)
    sonuc = A._kota(dyn, "c")
    dogru(sonuc and sonuc[0] == 429 and "yoğun" in sonuc[1], "toplam limit 429")
    os.environ["ASISTAN_KULLANICI_LIMIT"] = "30"
    os.environ["ASISTAN_TOPLAM_LIMIT"] = "2000"


@created("kota: tablo env'i yoksa 503 (sınırsız çalışmaz)")
def _():
    eski = os.environ.pop("ASISTAN_KOTA_TABLOSU", None)
    try:
        sonuc = A._kota(SahteDynamo(SahteKotaTablo()), "u1")
        dogru(sonuc and sonuc[0] == 503, "tablo yoksa 503")
    finally:
        if eski is not None:
            os.environ["ASISTAN_KOTA_TABLOSU"] = eski


@created("kota: tablo erişilemezse 503 (kapalı kal, sınırsız değil)")
def _():
    sonuc = A._kota(SahteDynamo(SahteKotaTablo(patlasin=True)), "u1")
    dogru(sonuc and sonuc[0] == 503, "tablo patlarsa 503")


# ═══════════════ 2. GÖRSEL ═══════════════

def _b64img(n=10):
    return _b64.b64encode(b"\x89PNG" + b"x" * n).decode()


@created("görsel: geçerli PNG kabul edilir (tur, veri) döner")
def _():
    r = A._gorsel({"gorsel": {"tur": "image/png", "veri": _b64img()}})
    dogru(isinstance(r, tuple) and r[0] == "image/png", "geçerli görsel tuple dönmeli")


@created("görsel: desteklenmeyen tür reddedilir")
def _():
    r = A._gorsel({"gorsel": {"tur": "image/gif", "veri": _b64img()}})
    dogru(isinstance(r, str) and "JPEG" in r, "gif reddedilmeli")


@created("görsel: çok büyük reddedilir (boyut sınırı)")
def _():
    kocaman = "A" * (A.MAKS_GORSEL * 4 // 3 + 100)
    r = A._gorsel({"gorsel": {"tur": "image/jpeg", "veri": kocaman}})
    dogru(isinstance(r, str) and "büyük" in r, "aşırı boyut reddedilmeli")


@created("görsel: bozuk base64 reddedilir, data: öneki temizlenir")
def _():
    r = A._gorsel({"gorsel": {"tur": "image/png", "veri": "!!!gecersiz!!!"}})
    dogru(isinstance(r, str), "bozuk base64 reddedilmeli")
    r2 = A._gorsel({"gorsel": {"tur": "image/png", "veri": "data:image/png;base64," + _b64img()}})
    dogru(isinstance(r2, tuple), "data: önekli geçerli görsel kabul edilmeli")


@created("görsel: yok → None, dict değilse hata")
def _():
    dogru(A._gorsel({}) is None, "görsel yoksa None")
    dogru(isinstance(A._gorsel({"gorsel": "xyz"}), str), "dict olmayan görsel hata")


# ═══════════════ 3. MESAJ KURMA ═══════════════

@created("mesajlar: geçmiş MAKS_GECMIS ile kırpılır, baştaki asistan atılır")
def _():
    gecmis = [{"rol": "asistan", "metin": "ilk"}] + \
             [{"rol": "kullanici" if i % 2 == 0 else "asistan", "metin": f"m{i}"} for i in range(20)]
    soru, mesajlar = A._mesajlar({"soru": "test", "gecmis": gecmis})
    dogru(mesajlar[0]["role"] == "user", "ilk mesaj kullanıcı olmalı")
    dogru(len(mesajlar) <= A.MAKS_GECMIS + 1, "geçmiş kırpılmalı")
    esit(soru, "test")


@created("mesajlar: görsel var + soru yok → varsayılan görsel sorusu")
def _():
    soru, mesajlar = A._mesajlar({"_gorsel": ("image/png", "ZGF0YQ=="), "soru": ""})
    esit(soru, A.GORSEL_SORUSU, "görsel + boş soru → varsayılan soru")
    son = mesajlar[-1]["content"]
    dogru(any(b.get("type") == "image" for b in son), "görsel bloğu eklenmeli")


@created("mesajlar: bağlam <sistem_verisi> etiketiyle sarılır")
def _():
    _soru, mesajlar = A._mesajlar({"soru": "selam", "baglam": "SOC %80"})
    son = mesajlar[-1]["content"]
    dogru(any("sistem_verisi" in b.get("text", "") for b in son), "bağlam etiketlenmeli")


# ═══════════════ 4. BİÇİM DÖNÜŞÜMÜ ═══════════════

@created("bedrock dönüşümü: aynı roller birleşir, görsel bloğu çevrilir")
def _():
    msj = [{"role": "user", "content": [
        {"type": "image", "source": {"media_type": "image/png", "data": _b64img()}},
        {"type": "text", "text": "ne bu?"}]}]
    r = A._bedrock_mesajlar(msj)
    dogru(r[0]["role"] == "user", "rol korunmalı")
    dogru(any("image" in b for b in r[0]["content"]), "görsel Converse biçimine çevrilmeli")


@created("gemini dönüşümü: assistant→model, görsel inline_data olur")
def _():
    msj = [{"role": "assistant", "content": "merhaba"},
           {"role": "user", "content": [{"type": "image",
            "source": {"media_type": "image/jpeg", "data": "ZGF0YQ=="}}, {"type": "text", "text": "x"}]}]
    r = A._gemini_icerik(msj)
    esit(r[0]["role"], "model", "assistant → model")
    dogru(any("inline_data" in p for p in r[1]["parts"]), "görsel inline_data olmalı")


# ═══════════════ 5. HATA EŞLEME ═══════════════

@created("gemini hata eşleme: kod→kullanıcı mesajı")
def _():
    esit(A._gemini_hatasi(504, "")[0], 504, "timeout 504")
    esit(A._gemini_hatasi(0, "")[0], 502, "bağlantı 502")
    esit(A._gemini_hatasi(429, "")[0], 429, "oran sınırı 429")
    esit(A._gemini_hatasi(403, "API key invalid")[0], 503, "anahtar sorunu 503")
    esit(A._gemini_hatasi(400, "bad image inline")[0], 400, "görsel hatası 400")


# ═══════════════ 6. YANITLA KAPILARI ═══════════════

@created("yanitla: bozuk görsel → 400")
def _():
    kod, govde = A.yanitla({"soru": "x", "gorsel": {"tur": "image/gif", "veri": "AA=="}},
                           _event(), SahteDynamo(SahteKotaTablo()))
    esit(kod, 400, "geçersiz görsel 400")


@created("yanitla: boş soru → 400")
def _():
    kod, _g2 = A.yanitla({"soru": "   "}, _event(), SahteDynamo(SahteKotaTablo()))
    esit(kod, 400, "boş soru 400")


@created("yanitla: bilinmeyen sağlayıcı → 503")
def _():
    eski = os.environ.get("ASISTAN_SAGLAYICI")
    os.environ["ASISTAN_SAGLAYICI"] = "yokboyle"
    try:
        kod, _g2 = A.yanitla({"soru": "x"}, _event(), SahteDynamo(SahteKotaTablo()))
        esit(kod, 503, "tanımsız sağlayıcı 503")
    finally:
        if eski is None:
            os.environ.pop("ASISTAN_SAGLAYICI", None)
        else:
            os.environ["ASISTAN_SAGLAYICI"] = eski


@created("yanitla: kota dolu → 429 (sağlayıcıya gitmeden)")
def _():
    os.environ["ASISTAN_SAGLAYICI"] = "bedrock"
    os.environ["ASISTAN_KULLANICI_LIMIT"] = "1"
    os.environ["ASISTAN_TOPLAM_LIMIT"] = "2000"
    dyn = SahteDynamo(SahteKotaTablo())
    A._kota(dyn, "u1")   # sayacı tüket (limit 1 → bir sonraki istek dolu)
    cagrildi = {"x": False}
    eski = A._bedrock_yanitla
    A._bedrock_yanitla = lambda *a, **k: cagrildi.__setitem__("x", True) or (200, {"yanit": "olmaz"})
    try:
        kod, govde = A.yanitla({"soru": "x"}, _event("u1"), dyn)
        esit(kod, 429, "kota dolu → 429")
        dogru(not cagrildi["x"], "kota dolunca sağlayıcı çağrılmamalı")
    finally:
        A._bedrock_yanitla = eski
        os.environ["ASISTAN_KULLANICI_LIMIT"] = "30"


@created("yanitla: bedrock sağlayıcıya doğru yönlendirir (kota uygunsa)")
def _():
    os.environ["ASISTAN_SAGLAYICI"] = "bedrock"
    eski = A._bedrock_yanitla
    A._bedrock_yanitla = lambda model, sistem, mesajlar: (200, {"yanit": "bedrock yanıtı"})
    try:
        kod, govde = A.yanitla({"soru": "merhaba", "panel": "musteri"},
                               _event("yeni-kullanici"), SahteDynamo(SahteKotaTablo()))
        esit(kod, 200)
        esit(govde["yanit"], "bedrock yanıtı", "bedrock'a yönlenmeli")
    finally:
        A._bedrock_yanitla = eski


# ═══════════════ çalıştır ═══════════════
if __name__ == "__main__":
    print("Asistan Lambda'sı testleri\n" + "=" * 40)
    if _k:
        print(f"\n{len(_k)} başarısız:")
        for ad, h in _k:
            print(f"  - {ad}: {h}")
        sys.exit(1)
    print(f"\n{_g} test geçti.")
    sys.exit(0)
