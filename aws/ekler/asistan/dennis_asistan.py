"""Dennis Energy sohbet asistanı — POST /de/asistan.

Lambda katmanında (dennis-asistan) Anthropic SDK ile birlikte durur; ana
lambda_function.py yalnızca bu modülü çağırır (ekler/yamala.py, yama E).
Ana Lambda her isteği önce oturum için doğrular (oturumsuz → 401); buraya
yalnızca giriş yapmış kullanıcılar ulaşır.

İstek:   {soru, gecmis: [{rol: "kullanici"|"asistan", metin}], baglam?, panel?}
Yanıt:   {yanit}  |  {hata}

Maliyet koruması:
  · kullanıcı başına ve toplam GÜNLÜK soru sınırı (DynamoDB sayaç tablosu;
    tablo yoksa ya da erişilemiyorsa asistan kapalı kalır — sınırsız çalışmaz)
  · soru, geçmiş ve bağlam uzunluğu kırpılır; yanıt uzunluğu sınırlı
  · web araması soru başına en fazla ASISTAN_WEB_ARAMA kez

Ortam değişkenleri (aws/asistan-kur.ps1 ayarlar):
  ANTHROPIC_API_KEY, ASISTAN_MODEL, ASISTAN_EFFORT, ASISTAN_KOTA_TABLOSU,
  ASISTAN_KULLANICI_LIMIT, ASISTAN_TOPLAM_LIMIT, ASISTAN_WEB_ARAMA
"""
import base64
import json
import os
import time
from datetime import datetime, timedelta, timezone

import anthropic

MAKS_SORU = 2000          # karakter
MAKS_BAGLAM = 6000
MAKS_GECMIS = 12          # mesaj
MAKS_MESAJ = 4000
MAKS_CIKTI = 2048         # token; telefonda okunacak kısa yanıtlar
SURE = 24.0               # sn; API Gateway 29 sn'de keser
TR_SAATI = timezone(timedelta(hours=3))

SISTEM_MUSTERI = """Sen Dennis Energy'nin müşteri asistanısın. Dennis Energy, LiFePO4 akü ve inverter üreten bir Türk firmasıdır. Sana yazan kişi bir Dennis müşterisidir ve telefonundaki uygulamadan yazıyor.

Her konuda soru sorabilir: kendi sistemi, güneş enerjisi, aküler, elektrik tüketimi, faturalar, genel bilgi ya da tamamen başka konular. Hepsine elinden geldiğince yardımcı ol.

Kullanıcının kendi sistem verisi <sistem_verisi> etiketinde gelebilir. Sistemiyle ilgili sorularda yalnızca bu veriye dayan; veri yoksa ya da henüz cihazı yoksa bunu kısaca söyle ve genel bilgiyle yardımcı ol. Ölçüm, tarih ya da garanti bilgisi uydurma.

Güncel bilgi gereken sorularda (fiyatlar, mevzuat, teşvikler, haberler) web aramasını kullan ve yanıtın sonunda kaynağın adresini ver.

Türkçe, sade ve kısa yaz; teknik bir terim gerekiyorsa kısaca açıkla. Yanıt telefonda okunacak: birkaç kısa paragraf, gerekirse "- " ile başlayan madde listesi. Başlık, tablo ve kod bloğu kullanma.

Güvenlik: akü ya da inverter kapağını açmayı, iç bağlantılara müdahaleyi veya yüksek akım/gerilim altında çalışmayı tarif etme; bunun yerine uygulamadaki Destek sekmesinden talep açmasını öner. Duman, yanık kokusu, şişme ya da aşırı ısınma gibi tehlike işaretlerinde cihazı güvenli şekilde kapatmasını, uzak durmasını ve Destek'e, acil durumda 112'ye ulaşmasını söyle.

Garanti kapsamı, fiyat, iade ve servis randevusu gibi firma kararlarını sen veremezsin; bunlar için Destek sekmesine yönlendir."""

SISTEM_URETICI = """Sen Dennis Energy üretici panelinin asistanısın. Dennis Energy, LiFePO4 akü ve inverter üreten bir Türk firmasıdır. Sana yazan kişi firmanın personelidir (üretim, kalite, servis, satış ya da yönetim).

Her konuda soru sorabilir: panel verisi, LiFePO4 hücre kimyası, BMS, SOC/SOH, hücre dengeleme, inverter ve güneş sistemleri, standartlar ve sertifikasyon (ör. IEC 62619, UN 38.3), üretim ve kalite kontrol, garanti analizi, iş, hukuk, pazar ya da tamamen başka konular. Teknik dil kullanabilirsin.

Panelin özet verisi <sistem_verisi> etiketinde gelebilir. Sistemle ilgili sorularda yalnızca bu veriye dayan; özet soruyu yanıtlamaya yetmiyorsa bunu söyle ve panelde hangi sayfaya bakılacağını öner. Sayı, seri numarası ya da tarih uydurma.

Güncel bilgi gereken sorularda (mevzuat, standart revizyonları, hammadde fiyatları, rakipler, haberler) web aramasını kullan ve yanıtın sonunda kaynak adreslerini ver.

Türkçe, net ve kısa yaz. Gerekirse "- " ile başlayan madde listesi kullan; başlık, tablo ve kod bloğu kullanma."""


def _ayar(ad, varsayilan):
    return os.environ.get(ad) or varsayilan


def _kullanici(event):
    """Oturum sahibinin kimliği (ana Lambda token'ı zaten doğruladı)."""
    basliklar = {str(k).lower(): v for k, v in (event.get("headers") or {}).items()}
    token = str(basliklar.get("authorization") or "").split(" ")[-1]
    try:
        yuk = token.split(".")[1]
        yuk += "=" * (-len(yuk) % 4)
        d = json.loads(base64.urlsafe_b64decode(yuk))
        return str(d.get("sub") or d.get("username") or "bilinmiyor")
    except Exception:
        return "bilinmiyor"


def _sayac(tablo, anahtar, limit, silinme):
    """Sayacı 1 artırır; limit doluysa False. Koşullu yazım, yarış durumunda da doğru sayar."""
    try:
        tablo.update_item(
            Key={"anahtar": anahtar},
            UpdateExpression="ADD sayi :bir SET silinme = :s",
            ConditionExpression="attribute_not_exists(sayi) OR sayi < :limit",
            ExpressionAttributeValues={":bir": 1, ":s": silinme, ":limit": limit},
        )
        return True
    except tablo.meta.client.exceptions.ConditionalCheckFailedException:
        return False


def _kota(dynamodb, kullanici):
    """Döner: None (izin var) ya da (http_kodu, hata)."""
    ad = os.environ.get("ASISTAN_KOTA_TABLOSU")
    if not ad:
        return 503, "Asistan henüz yapılandırılmadı."
    gun = datetime.now(TR_SAATI).strftime("%Y-%m-%d")
    silinme = int(time.time()) + 3 * 86400
    tablo = dynamodb.Table(ad)
    try:
        if not _sayac(tablo, f"k#{kullanici}#{gun}", int(_ayar("ASISTAN_KULLANICI_LIMIT", "20")), silinme):
            return 429, "Bugünkü soru hakkınız doldu; yarın tekrar sorabilirsiniz."
        if not _sayac(tablo, f"toplam#{gun}", int(_ayar("ASISTAN_TOPLAM_LIMIT", "2000")), silinme):
            return 429, "Asistan bugün yoğun; lütfen yarın tekrar deneyin."
    except Exception as e:
        # Sayaç çalışmıyorsa sınırsız çalışmak yerine kapalı kal
        print(f"asistan kota hatasi: {e}")
        return 503, "Asistan şu an kullanılamıyor."
    return None


def _mesajlar(body):
    mesajlar = []
    for m in (body.get("gecmis") or [])[-MAKS_GECMIS:]:
        if not isinstance(m, dict):
            continue
        rol = "assistant" if m.get("rol") == "asistan" else "user"
        metin = str(m.get("metin") or "").strip()[:MAKS_MESAJ]
        if not metin:
            continue
        if not mesajlar and rol == "assistant":
            continue  # ilk mesaj kullanıcıdan olmalı
        mesajlar.append({"role": rol, "content": metin})

    soru = str(body.get("soru") or "").strip()[:MAKS_SORU]
    icerik = []
    baglam = str(body.get("baglam") or "").strip()[:MAKS_BAGLAM]
    if baglam:
        icerik.append({"type": "text", "text": f"<sistem_verisi>\n{baglam}\n</sistem_verisi>"})
    icerik.append({"type": "text", "text": soru})
    mesajlar.append({"role": "user", "content": icerik})
    return soru, mesajlar


def _istek(model, sistem, mesajlar):
    istek = {
        "model": model,
        "max_tokens": MAKS_CIKTI,
        "system": sistem,
        "messages": mesajlar,
        "cache_control": {"type": "ephemeral"},  # sohbetin önceki kısmı önbellekten okunur
    }
    haiku = model.startswith("claude-haiku")
    if not haiku:
        istek["output_config"] = {"effort": _ayar("ASISTAN_EFFORT", "low")}
    arama = int(_ayar("ASISTAN_WEB_ARAMA", "3"))
    if arama > 0:
        istek["tools"] = [{
            "type": "web_search_20250305" if haiku else "web_search_20260209",
            "name": "web_search",
            "max_uses": arama,
            "user_location": {"type": "approximate", "country": "TR", "timezone": "Europe/Istanbul"},
        }]
    # Güvenlik sınıflandırıcısı reddederse istek sunucu tarafında uygun modele aktarılır
    if model in ("claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"):
        istek["betas"] = ["server-side-fallback-2026-07-01"]
        istek["fallbacks"] = "default"
    return istek


def _metin(yanit):
    parcalar, kaynaklar = [], []
    for blok in yanit.content:
        if blok.type != "text":
            continue
        parcalar.append(blok.text)
        for a in getattr(blok, "citations", None) or []:
            url = getattr(a, "url", None)
            if url and url not in kaynaklar:
                kaynaklar.append(url)
    metin = "".join(parcalar).strip()
    if kaynaklar and not any(u in metin for u in kaynaklar):
        metin += "\n\nKaynaklar:\n" + "\n".join(f"- {u}" for u in kaynaklar[:4])
    return metin


def yanitla(body, event, dynamodb):
    """Döner: (http_kodu, gövde)."""
    soru, mesajlar = _mesajlar(body if isinstance(body, dict) else {})
    if not soru:
        return 400, {"hata": "Soru boş olamaz."}
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return 503, {"hata": "Asistan henüz yapılandırılmadı."}
    engel = _kota(dynamodb, _kullanici(event))
    if engel:
        return engel[0], {"hata": engel[1]}

    model = _ayar("ASISTAN_MODEL", "claude-haiku-4-5")
    sistem = SISTEM_URETICI if body.get("panel") == "uretici" else SISTEM_MUSTERI
    istek = _istek(model, sistem, mesajlar)
    istemci = anthropic.Anthropic(max_retries=1)
    son = time.monotonic() + SURE
    try:
        yanit = None
        for _ in range(3):  # web araması uzarsa pause_turn ile devam edilir
            kalan = son - time.monotonic()
            if kalan < 4:
                break
            yanit = istemci.with_options(timeout=kalan).beta.messages.create(**istek)
            if yanit.stop_reason != "pause_turn":
                break
            istek["messages"] = mesajlar + [{"role": "assistant", "content": yanit.content}]
        if yanit is None:
            return 504, {"hata": "Yanıt çok uzun sürdü; soruyu kısaltıp tekrar deneyin."}
    except anthropic.APITimeoutError:
        return 504, {"hata": "Yanıt çok uzun sürdü; soruyu kısaltıp tekrar deneyin."}
    except anthropic.APIConnectionError as e:
        print(f"asistan baglanti hatasi: {e}")
        return 502, {"hata": "Asistana ulaşılamadı; biraz sonra tekrar deneyin."}
    except anthropic.AuthenticationError:
        print("asistan: ANTHROPIC_API_KEY gecersiz")
        return 503, {"hata": "Asistan şu an kullanılamıyor."}
    except anthropic.RateLimitError:
        return 429, {"hata": "Asistan şu an yoğun; birkaç dakika sonra tekrar deneyin."}
    except anthropic.APIStatusError as e:
        print(f"asistan api hatasi {e.status_code}: {e.message}")
        return 502, {"hata": "Asistan şu an yanıt veremiyor."}

    kullanim = yanit.usage
    arama = getattr(getattr(kullanim, "server_tool_use", None), "web_search_requests", 0) or 0
    print(json.dumps({"asistan": {"model": yanit.model, "girdi": kullanim.input_tokens,
                                  "cikti": kullanim.output_tokens, "arama": arama,
                                  "durum": yanit.stop_reason}}))

    if yanit.stop_reason == "refusal":
        return 200, {"yanit": "Bu soruya yanıt veremiyorum. Başka bir konuda yardımcı olabilirim."}
    metin = _metin(yanit)
    if yanit.stop_reason == "pause_turn" or not metin:
        return 504, {"hata": "Yanıt çok uzun sürdü; soruyu kısaltıp tekrar deneyin."}
    if yanit.stop_reason == "max_tokens":
        metin += " …"
    return 200, {"yanit": metin}
