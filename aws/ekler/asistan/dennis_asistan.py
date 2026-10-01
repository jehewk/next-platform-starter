"""Dennis Energy sohbet asistanı — POST /de/asistan.

Lambda katmanında (dennis-asistan) durur; ana lambda_function.py yalnızca bu
modülü çağırır (ekler/yamala.py, yama E).

Sağlayıcı (ASISTAN_SAGLAYICI):
  bedrock   (varsayılan) Amazon Bedrock Converse API, ör. Amazon Nova Lite.
            Lambda'daki boto3 yeter; API anahtarı yok, fatura AWS'ye gelir.
            Web araması yok.
  anthropic Claude (Anthropic SDK katmanda olmalı, ANTHROPIC_API_KEY gerekir);
            web araması yapabilir.
  gemini    Google Gemini API (ücretsiz katman; GEMINI_API_KEY). Python'un kendi
            urllib'i yeter. Web araması yok.

Uygulamalar sistem verisini GÖNDERMEZ: veri soruları tarayıcıdaki ayrıştırıcıda
yanıtlanır (ayristirici.js); buraya yalnızca genel sorular gelir.
Ana Lambda her isteği önce oturum için doğrular (oturumsuz → 401); buraya
yalnızca giriş yapmış kullanıcılar ulaşır.

İstek:   {soru, gecmis: [{rol: "kullanici"|"asistan", metin}], baglam?, panel?}
Yanıt:   {yanit}  |  {hata}

Maliyet koruması:
  · kullanıcı başına ve toplam GÜNLÜK soru sınırı (DynamoDB sayaç tablosu;
    tablo yoksa ya da erişilemiyorsa asistan kapalı kalır — sınırsız çalışmaz)
  · soru, geçmiş ve bağlam uzunluğu kırpılır; yanıt uzunluğu sınırlı
  · web araması (yalnızca anthropic) soru başına en fazla ASISTAN_WEB_ARAMA kez

Ortam değişkenleri (aws/asistan-kur.ps1 ayarlar):
  ASISTAN_SAGLAYICI, ASISTAN_MODEL, ASISTAN_KOTA_TABLOSU, ASISTAN_KULLANICI_LIMIT,
  ASISTAN_TOPLAM_LIMIT; anthropic için ayrıca ANTHROPIC_API_KEY, ASISTAN_EFFORT,
  ASISTAN_WEB_ARAMA
"""
import base64
import json
import os
import time
from datetime import datetime, timedelta, timezone

import socket
import urllib.error
import urllib.parse
import urllib.request

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, ConnectTimeoutError, ReadTimeoutError

MAKS_SORU = 2000          # karakter
MAKS_BAGLAM = 6000
MAKS_GECMIS = 12          # mesaj
MAKS_MESAJ = 4000
MAKS_CIKTI = 2048         # token; telefonda okunacak kısa yanıtlar
VARSAYILAN_MODEL = {"bedrock": "eu.amazon.nova-lite-v1:0", "anthropic": "claude-haiku-4-5",
                    "gemini": "gemini-flash-lite-latest"}
SURE = 24.0               # sn; API Gateway 29 sn'de keser
TR_SAATI = timezone(timedelta(hours=3))

SISTEM_MUSTERI = """Sen Dennis Energy'nin müşteri asistanısın. Dennis Energy, LiFePO4 akü ve inverter üreten bir Türk firmasıdır. Sana yazan kişi bir Dennis müşterisidir ve telefonundaki uygulamadan yazıyor.

Her konuda soru sorabilir: kendi sistemi, güneş enerjisi, aküler, elektrik tüketimi, faturalar, genel bilgi ya da tamamen başka konular. Hepsine elinden geldiğince yardımcı ol.

Kullanıcının sistem verisi <sistem_verisi> etiketinde gelebilir; gelmediyse ona erişimin yoktur. Kendi sistemiyle ilgili (şarj, üretim, garanti, destek talebi) bir şey sorarsa ölçüm, tarih ya da garanti bilgisi uydurma; bunu sohbette "Akümde ne kadar enerji var?", "Bugün ne kadar ürettim?", "Garantim ne zaman bitiyor?" gibi sorarak öğrenebileceğini söyle.

{GUNCEL}

Türkçe, sade ve kısa yaz; teknik bir terim gerekiyorsa kısaca açıkla. Yanıt telefonda okunacak: birkaç kısa paragraf, gerekirse "- " ile başlayan madde listesi. Başlık ve tablo kullanma.

Kod istenirse kodu ``` ile açılıp kapanan kod bloğunda ver (ilk satıra dil adı yazabilirsin); kod dışında başlık ve tablo kullanma.

Sohbet etmek isteyene samimi ve doğal karşılık ver, konuyu firmaya çekmeye çalışma. Kendin hakkında bir şey uydurma: bir dil modelisin, verileri izlemiyorsun ve sohbette yalnızca sana yazılanı görüyorsun. Kullanıcı bir hitap ya da üslup isterse ("kanka de") sohbet boyunca ona uy.

Güvenlik: akü ya da inverter kapağını açmayı, iç bağlantılara müdahaleyi veya yüksek akım/gerilim altında çalışmayı tarif etme; bunun yerine uygulamadaki Destek sekmesinden talep açmasını öner. Duman, yanık kokusu, şişme ya da aşırı ısınma gibi tehlike işaretlerinde cihazı güvenli şekilde kapatmasını, uzak durmasını ve Destek'e, acil durumda 112'ye ulaşmasını söyle.

Garanti kapsamı, fiyat, iade ve servis randevusu gibi firma kararlarını sen veremezsin; bunlar için Destek sekmesine yönlendir."""

SISTEM_URETICI = """Sen Dennis Energy üretici panelinin asistanısın. Dennis Energy, LiFePO4 akü ve inverter üreten bir Türk firmasıdır. Sana yazan kişi firmanın personelidir (üretim, kalite, servis, satış ya da yönetim).

Her konuda soru sorabilir: panel verisi, LiFePO4 hücre kimyası, BMS, SOC/SOH, hücre dengeleme, inverter ve güneş sistemleri, standartlar ve sertifikasyon (ör. IEC 62619, UN 38.3), üretim ve kalite kontrol, garanti analizi, iş, hukuk, pazar ya da tamamen başka konular. Teknik dil kullanabilirsin.

Panel verisi <sistem_verisi> etiketinde gelebilir; gelmediyse ona erişimin yoktur. Müşteri, cihaz, arıza, garanti ya da başvuru kaydıyla ilgili bir şey sorulursa sayı, isim, seri numarası ya da tarih uydurma; bunu sohbette "bugün kayıt olan müşteriler", "Ahmet'in adresi", "arızalı cihazlar", "AKU-D24-0071" gibi sorarak öğrenebileceğini ya da paneldeki ilgili sayfayı söyle.

{GUNCEL}

Türkçe, net ve kısa yaz. Gerekirse "- " ile başlayan madde listesi kullan.

Kod istenirse kodu ``` ile açılıp kapanan kod bloğunda ver (ilk satıra dil adı yazabilirsin); kod dışında başlık ve tablo kullanma.

Sohbet etmek isteyene samimi ve doğal karşılık ver, konuyu firmaya çekmeye çalışma. Kendin hakkında bir şey uydurma: bir dil modelisin, verileri izlemiyorsun ve sohbette yalnızca sana yazılanı görüyorsun. Kullanıcı bir hitap ya da üslup isterse ("kanka de") sohbet boyunca ona uy."""


GUNCEL_WEB = ("Güncel bilgi gereken sorularda (fiyatlar, mevzuat, teşvikler, standartlar, haberler) "
              "web aramasını kullan ve yanıtın sonunda kaynağın adresini ver.")
GUNCEL_YOK = ("Güncel bilgi gereken sorularda (fiyatlar, mevzuat, teşvikler, standartlar, haberler) "
              "bilgin eski olabilir; bunu kısaca belirt ve resmi kaynağa bakmasını öner.")


def _sistem(panel, web):
    metin = SISTEM_URETICI if panel == "uretici" else SISTEM_MUSTERI
    return metin.replace("{GUNCEL}", GUNCEL_WEB if web else GUNCEL_YOK)


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


def _bedrock_mesajlar(mesajlar):
    """Anthropic biçimindeki mesajları Converse biçimine çevirir (aynı roller birleştirilir)."""
    sonuc = []
    for m in mesajlar:
        parcalar = [m["content"]] if isinstance(m["content"], str) else [b["text"] for b in m["content"]]
        icerik = [{"text": p} for p in parcalar if p]
        if sonuc and sonuc[-1]["role"] == m["role"]:
            sonuc[-1]["content"].extend(icerik)
        else:
            sonuc.append({"role": m["role"], "content": icerik})
    return sonuc


_bedrock = None


def _bedrock_istemci():
    global _bedrock
    if _bedrock is None:
        _bedrock = boto3.client("bedrock-runtime", config=Config(
            connect_timeout=5, read_timeout=SURE, retries={"max_attempts": 2, "mode": "standard"}))
    return _bedrock


def _bedrock_yanitla(model, sistem, mesajlar):
    try:
        y = _bedrock_istemci().converse(
            modelId=model,
            system=[{"text": sistem}],
            messages=_bedrock_mesajlar(mesajlar),
            inferenceConfig={"maxTokens": MAKS_CIKTI, "temperature": 0.3},
        )
    except (ReadTimeoutError, ConnectTimeoutError):
        return 504, {"hata": "Yanıt çok uzun sürdü; soruyu kısaltıp tekrar deneyin."}
    except ClientError as e:
        kod = e.response.get("Error", {}).get("Code", "")
        print(f"asistan bedrock hatasi {kod}: {e}")
        if kod in ("ThrottlingException", "ServiceQuotaExceededException"):
            return 429, {"hata": "Asistan şu an yoğun; birkaç dakika sonra tekrar deneyin."}
        if kod == "ModelTimeoutException":
            return 504, {"hata": "Yanıt çok uzun sürdü; soruyu kısaltıp tekrar deneyin."}
        if kod == "AccessDeniedException":
            return 503, {"hata": "Asistan şu an kullanılamıyor."}
        return 502, {"hata": "Asistan şu an yanıt veremiyor."}

    kullanim = y.get("usage") or {}
    durum = y.get("stopReason")
    print(json.dumps({"asistan": {"model": model, "girdi": kullanim.get("inputTokens"),
                                  "cikti": kullanim.get("outputTokens"), "arama": 0, "durum": durum}}))
    icerik = ((y.get("output") or {}).get("message") or {}).get("content") or []
    metin = "".join(b.get("text", "") for b in icerik).strip()
    if durum in ("guardrail_intervened", "content_filtered"):
        return 200, {"yanit": "Bu soruya yanıt veremiyorum. Başka bir konuda yardımcı olabilirim."}
    if not metin:
        return 502, {"hata": "Asistan şu an yanıt veremiyor."}
    if durum == "max_tokens":
        metin += " …"
    return 200, {"yanit": metin}


def _gemini_yanitla(model, sistem, mesajlar):
    """Google Gemini generateContent (REST). Mesajlar Anthropic biçiminden çevrilir."""
    icerik = []
    for m in mesajlar:
        parcalar = [m["content"]] if isinstance(m["content"], str) else [b["text"] for b in m["content"]]
        rol = "model" if m["role"] == "assistant" else "user"
        p = [{"text": x} for x in parcalar if x]
        if icerik and icerik[-1]["role"] == rol:
            icerik[-1]["parts"].extend(p)
        else:
            icerik.append({"role": rol, "parts": p})
    govde = {
        "systemInstruction": {"parts": [{"text": sistem}]},
        "contents": icerik,
        "generationConfig": {"maxOutputTokens": MAKS_CIKTI, "temperature": 0.5},
    }
    model = model[len("models/"):] if model.startswith("models/") else model
    istek = urllib.request.Request(
        f"{os.environ.get('GEMINI_TABAN', 'https://generativelanguage.googleapis.com')}"
        f"/v1beta/models/{urllib.parse.quote(model)}:generateContent",
        data=json.dumps(govde).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": os.environ.get("GEMINI_API_KEY", "")})
    try:
        with urllib.request.urlopen(istek, timeout=SURE) as yanit:
            y = json.loads(yanit.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            hata = json.loads(e.read().decode("utf-8")).get("error", {})
        except Exception:
            hata = {}
        mesaj = str(hata.get("message", ""))
        print(f"asistan gemini hatasi {e.code} {hata.get('status', '')}: {mesaj}")
        if e.code == 429:
            return 429, {"hata": "Asistanın ücretsiz kullanım sınırı şu an dolu; biraz sonra tekrar deneyin."}
        if "location" in mesaj.lower():
            return 502, {"hata": "Gemini bu bölgeden kullanılamıyor."}
        if e.code in (401, 403) or "API_KEY" in mesaj or "API key" in mesaj:
            return 503, {"hata": "Asistan şu an kullanılamıyor (Gemini anahtarı)."}
        if e.code == 404:
            return 502, {"hata": "Asistan modeli bulunamadı (ASISTAN_MODEL)."}
        return 502, {"hata": f"Asistan şu an yanıt veremiyor (Gemini {e.code})."}
    except (urllib.error.URLError, socket.timeout, TimeoutError) as e:
        print(f"asistan gemini baglanti hatasi: {e}")
        if "timed out" in str(e).lower() or isinstance(e, (socket.timeout, TimeoutError)):
            return 504, {"hata": "Yanıt çok uzun sürdü; soruyu kısaltıp tekrar deneyin."}
        return 502, {"hata": "Asistana ulaşılamadı; biraz sonra tekrar deneyin."}

    aday = (y.get("candidates") or [{}])[0]
    durum = aday.get("finishReason")
    kullanim = y.get("usageMetadata") or {}
    print(json.dumps({"asistan": {"model": model, "girdi": kullanim.get("promptTokenCount"),
                                  "cikti": kullanim.get("candidatesTokenCount"), "arama": 0, "durum": durum}}))
    metin = "".join(p.get("text", "") for p in ((aday.get("content") or {}).get("parts") or [])
                    if not p.get("thought")).strip()
    engel = (y.get("promptFeedback") or {}).get("blockReason")
    if not metin and (engel or durum in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION")):
        return 200, {"yanit": "Bu soruya yanıt veremiyorum. Başka bir konuda yardımcı olabilirim."}
    if not metin:
        return 502, {"hata": "Asistan şu an yanıt veremiyor."}
    if durum == "MAX_TOKENS":
        metin += " …"
    return 200, {"yanit": metin}


def yanitla(body, event, dynamodb):
    """Döner: (http_kodu, gövde)."""
    body = body if isinstance(body, dict) else {}
    soru, mesajlar = _mesajlar(body)
    if not soru:
        return 400, {"hata": "Soru boş olamaz."}
    saglayici = _ayar("ASISTAN_SAGLAYICI", "bedrock")
    if saglayici not in VARSAYILAN_MODEL:
        return 503, {"hata": "Asistan henüz yapılandırılmadı."}
    if saglayici == "anthropic" and not os.environ.get("ANTHROPIC_API_KEY"):
        return 503, {"hata": "Asistan henüz yapılandırılmadı."}
    if saglayici == "gemini" and not os.environ.get("GEMINI_API_KEY"):
        return 503, {"hata": "Asistan henüz yapılandırılmadı."}
    engel = _kota(dynamodb, _kullanici(event))
    if engel:
        return engel[0], {"hata": engel[1]}

    model = _ayar("ASISTAN_MODEL", VARSAYILAN_MODEL[saglayici])
    if saglayici == "bedrock":
        return _bedrock_yanitla(model, _sistem(body.get("panel"), False), mesajlar)
    if saglayici == "gemini":
        return _gemini_yanitla(model, _sistem(body.get("panel"), False), mesajlar)
    return _anthropic_yanitla(model, _sistem(body.get("panel"), int(_ayar("ASISTAN_WEB_ARAMA", "3")) > 0), mesajlar)


def _anthropic_yanitla(model, sistem, mesajlar):
    import anthropic  # yalnızca bu sağlayıcıda; SDK Lambda katmanında
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
        m = str(e.message).lower()
        if "credit balance" in m or "billing" in m:
            return 502, {"hata": "Anthropic hesabında kredi yok (console.anthropic.com > Billing)."}
        if e.status_code == 404 or "model" in m and "not found" in m:
            return 502, {"hata": "Asistan modeli bulunamadı (ASISTAN_MODEL)."}
        if e.status_code == 403:
            return 502, {"hata": "Anthropic anahtarının bu işleme izni yok."}
        return 502, {"hata": f"Asistan şu an yanıt veremiyor (Anthropic {e.status_code})."}

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
