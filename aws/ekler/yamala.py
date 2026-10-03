"""Canlı lambda_function.py'ye Dennis panellerinin ihtiyaç duyduğu yamaları uygular.

    python yamala.py <girdi/lambda_function.py> <cikti/lambda_function.py>
    python yamala.py --olcum-tablosu <lambda_function.py>   (ölçüm tablosunu JSON yazar)

Çıkış kodları:
    0  en az bir yama uygulandı (çıktı yazıldı)
    3  tüm yamalar zaten var — değişiklik gerekmiyor (çıktı yazılmaz)
    4  dosya beklenen yapıda değil — HİÇBİR ŞEY yazılmaz
    1  beklenmeyen hata — HİÇBİR ŞEY yazılmaz

Yamalar (her biri bağımsız; zaten varsa atlanır):

 A) /de/musteri/guncelle ucu
  · ROL_IZIN sözlüğüne, '/de/musteri/olustur' ile AYNI rollerle
    '/de/musteri/guncelle' girişi ekler (olustur yoksa ['uretici', 'admin']).
  · musteri_guncelle.py'deki işleyici bloğunu, '/de/musteri/olustur'
    bloğunun hemen ÖNÜNE, aynı girintiyle ekler.

 B) Kayıt başvurusunda Cognito öznitelikleri
  · Havuz given_name, family_name, phone_number'ı zorunlu tuttuğunda sign_up
    bunlar olmadan reddedilir ("Kayit olusturulamadi"). /de/musteri/kayit
    işleyicisindeki sign_up'a ad → given_name, soyad → family_name,
    telefon → phone_number (E.164, ör. +905551234567) eklenir.
  · Geçersiz telefon, kayıt yazılmadan önce 400 ile reddedilir.
  · telefon_e164() yardımcısı lambda_handler'ın önüne eklenir.

 C) Otomatik onay
  · Kayıt başarılı olunca, üreticinin "Onayla" düğmesinin yaptığı iş hemen
    yapılır: Cognito hesabı onaylanır (admin_confirm_sign_up) ve müşteri
    kaydı onaylı duruma geçer. Havuz kimliği ve onaylı durum değeri canlı
    /de/kayit/karar işleyicisinden okunur; bulunamazsa yama uygulanmaz.
  · Lambda ortam değişkeni OTOMATIK_ONAY=0 yapılırsa eski akış (üretici
    onayı) geri gelir; kod değişikliği gerekmez.
  · Onay başarısız olursa başvuru "onay_bekliyor" olarak kalır ve üretici
    panelindeki Başvurular sayfasından elle onaylanabilir.

 D) Ölçüm kayıtlarına TTL (maliyet-koruma.ps1 ile birlikte)
  · Ölçüm tablosu /de/cihaz/gecmis işleyicisinin okuduğu tablodur. Bu tabloya
    yazılan her kayda (put_item, batch_writer) boto3 olay kancasıyla
    "silinme" alanı (şimdi + OLCUM_SAKLAMA_GUN gün, epoch) eklenir; DynamoDB
    TTL eski ölçümleri ücretsiz siler. Ölçüm yazan koda dokunulmaz.
  · OLCUM_SAKLAMA_GUN tanımlı değilse ya da 0 ise hiçbir şey eklenmez.
  · Ölçüm tablosu cihaz listesiyle aynı tabloysa (cihaz kayıtları silinirdi)
    yama uygulanmaz.

 E) Sohbet asistanı ucu: POST /de/asistan
  · Yanıtı Lambda katmanındaki dennis_asistan modülü üretir (aws/asistan-kur.ps1).
    Katman yoksa ya da modül yüklenemezse uç 503 döner; Lambda'nın geri
    kalanı etkilenmez.

 F) Hesap uçları (ekler/hesap.py): POST /de/hesap/sil, /de/sifre/unuttum,
    /de/sifre/sifirla, /de/bildirim/abone, /de/bildirim/iptal
  · Cognito istemcisi, havuz ve uygulama istemcisi ifadeleri, kaptcha
    doğrulama çağrısı ve cihaz tablosu canlı koddan okunur.
  · Şifre sıfırlama uçları CIHAZ_ENDPOINTLERI'ne (oturumsuz uçlar) eklenir.

 G) E-posta doğrulandı işareti
  · Her admin_confirm_sign_up çağrısının ardından email_verified=true atanır;
    Cognito "şifremi unuttum" kodunu yalnızca doğrulanmış e-postaya gönderir.

 H) KVKK onayı (kayıt)
  · Aydınlatma metni onayı (kvkk_aydinlatma) olmayan kayıt 400 ile reddedilir.
  · Onay zamanı, metin sürümü ve yurt dışı aktarım açık rızası müşteri
    kaydına yazılır (ispat yükü veri sorumlusundadır).

Sonuç Python derleyicisinden geçirilir; hata varsa hiçbir şey yazılmaz.
Girdi dosyasına asla dokunmaz.
"""
import builtins
import json
import re
import sys
from pathlib import Path

# Türkçe Windows konsolu (cp1254/cp857) bazı harfleri bozuk gösterir; iletiler ASCII yazılır.
_TR = str.maketrans("çğıöşüÇĞİÖŞÜâ", "cgiosuCGIOSUa")


def print(*a, **k):
    builtins.print(*(str(x).translate(_TR) for x in a), **k)

EK = Path(__file__).with_name("musteri_guncelle.py")
YOL = "/de/musteri/guncelle"


def dur(mesaj, kod=4):
    print(f"YAMA: {mesaj}")
    sys.exit(kod)


TELEFON_YARDIMCI = '''

def telefon_e164(t):
    """Cognito phone_number E.164 ister: '0555 123 45 67' -> '+905551234567'."""
    t = str(t or '').strip()
    rakam = ''.join(c for c in t if c.isdigit())
    if t.startswith('+'):
        e = '+' + rakam
    elif rakam.startswith('00'):
        e = '+' + rakam[2:]
    elif len(rakam) == 12 and rakam.startswith('90'):
        e = '+' + rakam
    elif len(rakam) == 11 and rakam.startswith('0'):
        e = '+90' + rakam[1:]
    elif len(rakam) == 10:
        e = '+90' + rakam
    else:
        return None
    return e if 9 <= len(e) <= 16 else None

'''


def yama_guncelle(kaynak):
    """A) /de/musteri/guncelle. Döner: (yeni_kaynak, uygulandi_mi)."""
    if re.search(r"""if\s+path\s*==\s*['"]%s['"]""" % re.escape(YOL), kaynak):
        print("YAMA: müşteri düzenleme ucu zaten var.")
        return kaynak, False

    for gerekli in ("DE_MUSTERI", "Decimal", "def response", "dynamodb"):
        if gerekli not in kaynak:
            dur(f"'{gerekli}' bulunamadı; dosya beklenen yapıda değil, yama uygulanmadı.")

    ek = EK.read_text(encoding="utf-8")
    bas = ek.index("    if path == '/de/musteri/guncelle'")
    blok = ek[bas:].rstrip() + "\n\n"

    capa = re.search(
        r"""^([ \t]*)if\s+path\s*==\s*['"]/de/musteri/olustur['"]\s+and\s+method\s*==\s*['"]POST['"]\s*:""",
        kaynak, re.M)
    if not capa:
        dur("'/de/musteri/olustur' işleyicisi bulunamadı; ekleme yeri belirlenemedi.")
    girinti = capa.group(1)
    satirlar = []
    for s in blok.splitlines():
        if s.strip():
            if not s.startswith("    "):
                dur("ek dosyasının girintisi beklenmedik.", 1)
            s = girinti + s[4:]
        satirlar.append(s)
    blok = "\n".join(satirlar) + "\n"
    kaynak = kaynak[:capa.start()] + blok + kaynak[capa.start():]

    rol = re.search(r"""^([ \t]*)['"]/de/musteri/olustur['"]\s*:\s*(\[[^\]]*\])\s*,?[^\n]*$""", kaynak, re.M)
    sozluk = re.search(r"^ROL_IZIN\s*=\s*\{[ \t]*$", kaynak, re.M)
    if rol:
        satir = f"{rol.group(1)}'{YOL}': {rol.group(2)},\n"
        yer = kaynak.index("\n", rol.end()) + 1
        kaynak = kaynak[:yer] + satir + kaynak[yer:]
        print(f"YAMA: rol izni eklendi (olustur ile ayni): {rol.group(2)}")
    elif sozluk:
        sonraki = re.search(r"^([ \t]+)\S", kaynak[sozluk.end() + 1:], re.M)
        g = sonraki.group(1) if sonraki else "    "
        yer = sozluk.end() + 1
        kaynak = kaynak[:yer] + f"{g}'{YOL}': ['uretici', 'admin'],\n" + kaynak[yer:]
        print("YAMA: rol izni eklendi: ['uretici', 'admin']")
    else:
        print("YAMA: UYARI - ROL_IZIN sozlugu bulunamadi; rol kontrolu eklenmedi.")
    print("YAMA: musteri duzenleme ucu eklendi.")
    return kaynak, True


def yama_kayit(kaynak):
    """B) Kayıtta given_name / family_name / phone_number. Döner: (yeni_kaynak, uygulandi_mi)."""
    capa = re.search(
        r"""^([ \t]*)if\s+path\s*==\s*['"]/de/musteri/kayit['"]\s+and\s+method\s*==\s*['"]POST['"]\s*:[^\n]*\n""",
        kaynak, re.M)
    if not capa:
        dur("'/de/musteri/kayit' işleyicisi bulunamadı; kayıt yaması uygulanamadı.")
    girinti = capa.group(1)
    # İşleyicinin sonu: aynı ya da daha az girintili bir sonraki kod satırı
    son = re.compile(r"^(?!%s[ \t])[ \t]*\S" % re.escape(girinti), re.M).search(kaynak, capa.end())
    bas, bit = capa.end(), (son.start() if son else len(kaynak))
    blok = kaynak[bas:bit]

    if "given_name" in blok and "phone_number" in blok:
        print("YAMA: kayit oznitelikleri zaten var.")
        return kaynak, False

    ua = re.search(r"^[^\n]*sign_up\((?:.|\n)*?UserAttributes\s*=\s*\[[ \t]*\n([ \t]*)", blok, re.M)
    if not ua:
        dur("kayıt işleyicisinde 'sign_up(... UserAttributes=[' bulunamadı; kayıt yaması uygulanamadı.")
    g = ua.group(1)
    for alan in ("ad", "soyad", "telefon"):
        if f"body['{alan}']" not in blok and f'body["{alan}"]' not in blok and f"'{alan}'" not in blok:
            dur(f"kayıt işleyicisi '{alan}' alanını kullanmıyor; yapı beklenenden farklı.")
    ekler = (f"{g}{{'Name': 'given_name',   'Value': str(body['ad']).strip()}},\n"
             f"{g}{{'Name': 'family_name',  'Value': str(body['soyad']).strip()}},\n"
             f"{g}{{'Name': 'phone_number', 'Value': telefon_e164(body['telefon'])}},\n")
    blok = blok[:ua.end() - len(g)] + ekler + blok[ua.end() - len(g):]

    # Telefon kontrolü: eksik alan kontrolünden hemen sonra, kayıt yazılmadan önce
    ek = re.search(r"^([ \t]*)if\s+eksik\s*:[ \t]*\n([ \t]*)return\s+response\([^\n]*\n", blok, re.M)
    if ek:
        k, ic = ek.group(1), ek.group(2)
        kontrol = (f"{k}if not telefon_e164(body.get('telefon')):\n"
                   f"{ic}return response(400, {{'hata': 'Telefon numarasi gecersiz (ornek: 0555 123 45 67)'}})\n")
        blok = blok[:ek.end()] + kontrol + blok[ek.end():]
    else:
        print("YAMA: UYARI - eksik alan kontrolu bulunamadi; telefon on kontrolu eklenmedi.")

    kaynak = kaynak[:bas] + blok + kaynak[bit:]

    if "def telefon_e164" not in kaynak:
        h = re.search(r"^def\s+lambda_handler\s*\(", kaynak, re.M)
        if not h:
            dur("'def lambda_handler' bulunamadı; kayıt yaması uygulanamadı.")
        kaynak = kaynak[:h.start()] + TELEFON_YARDIMCI.lstrip("\n") + "\n" + kaynak[h.start():]
    print("YAMA: kayit basvurusuna given_name, family_name, phone_number eklendi.")
    return kaynak, True


class YamaAtla(Exception):
    """Bu yama uygulanamadı; diğer yamalar yine uygulanır."""


OnayAtla = YamaAtla


def blok_bul(kaynak, yol):
    """path == yol işleyicisi: (baş, bit, girinti) ya da None."""
    capa = re.search(
        r"""^([ \t]*)if\s+path\s*==\s*['"]%s['"][^\n]*:[^\n]*\n""" % re.escape(yol), kaynak, re.M)
    if not capa:
        return None
    g = capa.group(1)
    son = re.compile(r"^(?!%s[ \t])[ \t]*\S" % re.escape(g), re.M).search(kaynak, capa.end())
    return capa.end(), (son.start() if son else len(kaynak)), g


def yama_otomatik_onay(kaynak):
    """C) Kayıt başvurusu anında onaylanır. Döner: (yeni_kaynak, uygulandi_mi)."""
    if "OTOMATIK_ONAY" in kaynak:
        print("YAMA: otomatik onay zaten var.")
        return kaynak, False

    k = blok_bul(kaynak, "/de/kayit/karar")
    if not k:
        raise OnayAtla("'/de/kayit/karar' işleyicisi bulunamadı; otomatik onay uygulanamadı.")
    karar = kaynak[k[0]:k[1]]

    # Havuz kimliği: karar işleyicisindeki admin_confirm_sign_up çağrısından
    m = re.search(r"admin_confirm_sign_up\((?:[^()]|\([^()]*\))*?UserPoolId\s*=\s*([^,\)\n]+)", karar, re.S)
    if not m:
        raise OnayAtla("onay işleyicisinde admin_confirm_sign_up(UserPoolId=...) bulunamadı; otomatik onay uygulanamadı.")
    havuz = m.group(1).strip()
    istemci = re.search(r"""^(\w+)\s*=\s*boto3\.client\(\s*['"]cognito-idp['"]""", kaynak, re.M)
    cagri = re.search(r"(\w+)\.admin_confirm_sign_up\(", karar)
    cognito = cagri.group(1) if cagri else (istemci.group(1) if istemci else None)
    if not cognito:
        raise OnayAtla("Cognito istemci değişkeni bulunamadı; otomatik onay uygulanamadı.")

    # Onaylı durum değeri: karar işleyicisindeki dizgelerden
    adaylar = [d for d in re.findall(r"""['"]([a-z_]+)['"]""", karar)
               if re.search(r"onay|aktif", d) and d not in ("onay", "onay_bekliyor", "karar")]
    if not adaylar:
        raise OnayAtla("onay işleyicisinde onaylı durum değeri (ör. 'onaylandi') bulunamadı; otomatik onay uygulanamadı.")
    onayli = adaylar[0]

    k2 = blok_bul(kaynak, "/de/musteri/kayit")
    if not k2:
        raise OnayAtla("'/de/musteri/kayit' işleyicisi bulunamadı; otomatik onay uygulanamadı.")
    blok = kaynak[k2[0]:k2[1]]
    # Başarılı yanıt: sign_up'tan SONRAKİ ilk "return response(200"
    su = blok.find("sign_up(")
    ret = re.compile(r"^([ \t]*)return\s+response\(\s*200\b", re.M).search(blok, su if su >= 0 else 0)
    if su < 0 or not ret:
        raise OnayAtla("kayıt işleyicisinde sign_up sonrası başarılı yanıt bulunamadı; otomatik onay uygulanamadı.")
    g = ret.group(1)
    i = g + "    "
    for gerekli in ("musteri_id", "eposta"):
        if not re.search(r"^\s*%s\s*=" % gerekli, blok[:ret.start()], re.M):
            raise OnayAtla(f"kayıt işleyicisinde '{gerekli}' değişkeni yok; otomatik onay uygulanamadı.")
    ek = (f"{g}# Otomatik onay (OTOMATIK_ONAY=0 ile kapatılır): üreticinin Onayla düğmesiyle aynı iş\n"
          f"{g}if os.environ.get('OTOMATIK_ONAY', '1') == '1':\n"
          f"{i}try:\n"
          f"{i}    {cognito}.admin_confirm_sign_up(UserPoolId={havuz}, Username=eposta)\n"
          f"{i}    dynamodb.Table(DE_MUSTERI).update_item(\n"
          f"{i}        Key={{'musteri_id': musteri_id}},\n"
          f"{i}        UpdateExpression='SET kayit_durumu = :d',\n"
          f"{i}        ExpressionAttributeValues={{':d': '{onayli}'}})\n"
          f"{i}    return response(200, {{'musteri_id': musteri_id, 'otomatik_onay': True,\n"
          f"{i}                           'mesaj': 'Hesabiniz acildi. Giris yapabilirsiniz.'}})\n"
          f"{i}except Exception as e:\n"
          f"{i}    # Basvuru onay_bekliyor kalir; uretici panelden elle onaylayabilir\n"
          f"{i}    print(f\"otomatik onay hatasi: {{e}}\")\n")
    blok = blok[:ret.start()] + ek + blok[ret.start():]
    kaynak = kaynak[:k2[0]] + blok + kaynak[k2[1]:]
    if not re.search(r"^import\s+[^\n]*\bos\b|^import os\b", kaynak, re.M):
        kaynak = "import os\n" + kaynak
    print(f"YAMA: otomatik onay eklendi (havuz: {havuz}, onayli durum: '{onayli}').")
    return kaynak, True


TABLO_IFADESI = r"""Table\(\s*([A-Za-z_][A-Za-z0-9_]*|'[^'\n]*'|"[^"\n]*")\s*\)"""


def tablo_ifadeleri(kaynak, yol):
    k = blok_bul(kaynak, yol)
    return re.findall(TABLO_IFADESI, kaynak[k[0]:k[1]]) if k else []


def olcum_tablosu(kaynak):
    """/de/cihaz/gecmis işleyicisinin okuduğu tablo ifadesi ve çözümü."""
    ifadeler = tablo_ifadeleri(kaynak, "/de/cihaz/gecmis")
    if not ifadeler:
        raise YamaAtla("'/de/cihaz/gecmis' işleyicisinde Table(...) bulunamadı; ölçüm tablosu belirlenemedi.")
    ifade = ifadeler[0]
    if ifade in tablo_ifadeleri(kaynak, "/de/cihaz/liste"):
        raise YamaAtla(f"ölçüm tablosu ({ifade}) cihaz listesiyle aynı; TTL cihaz kayıtlarını silerdi, uygulanmadı.")
    sonuc = {"ifade": ifade, "deger": None, "ortam": None, "varsayilan": None}
    sag = ifade
    if not ifade[0] in "'\"":
        m = re.search(r"^%s\s*=\s*([^\n#]+)" % re.escape(ifade), kaynak, re.M)
        sag = m.group(1).strip() if m else ""
    if sag[:1] in ("'", '"'):
        sonuc["deger"] = sag.strip("'\"")
    else:
        m = re.match(r"""os\.(?:environ\.get|getenv)\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"])?\s*\)""", sag) \
            or re.match(r"""os\.environ\[\s*['"]([^'"]+)['"]\s*\]""", sag)
        if m:
            sonuc["ortam"] = m.group(1)
            sonuc["varsayilan"] = m.group(2) if m.re.groups > 1 else None
    return sonuc


def yama_olcum_ttl(kaynak):
    """D) Ölçüm tablosuna yazılan kayıtlara TTL alanı. Döner: (yeni_kaynak, uygulandi_mi)."""
    if "def _olcum_ttl" in kaynak:
        print("YAMA: olcum TTL kancasi zaten var.")
        return kaynak, False
    tablo = olcum_tablosu(kaynak)["ifade"]
    kaynak_var = re.search(r"""^(\w+)\s*=\s*boto3\.resource\(\s*['"]dynamodb['"]""", kaynak, re.M)
    if not kaynak_var:
        raise YamaAtla("modül düzeyinde boto3.resource('dynamodb') bulunamadı; TTL kancası eklenmedi.")
    h = re.search(r"^def\s+lambda_handler\s*\(", kaynak, re.M)
    if not h:
        raise YamaAtla("'def lambda_handler' bulunamadı; TTL kancası eklenmedi.")
    d = kaynak_var.group(1)
    kanca = f'''# Olcum kayitlarina TTL (aws/maliyet-koruma.ps1): {tablo} tablosuna yazilan
# her kayda silinme zamani eklenir; DynamoDB eski olcumleri ucretsiz siler.
# OLCUM_SAKLAMA_GUN tanimsiz ya da 0 ise kapali.
def _olcum_ttl(params, **kwargs):
    try:
        gun = int(os.environ.get('OLCUM_SAKLAMA_GUN', '0') or 0)
        if gun <= 0:
            return
        alan = os.environ.get('OLCUM_TTL_ALANI', 'silinme')
        import time as _zaman
        son = int(_zaman.time()) + gun * 86400
        tablo = {tablo}
        if params.get('TableName') == tablo and isinstance(params.get('Item'), dict):
            params['Item'].setdefault(alan, son)
        for ad, istekler in (params.get('RequestItems') or {{}}).items():
            if ad == tablo:
                for istek in istekler:
                    kayit = (istek.get('PutRequest') or {{}}).get('Item')
                    if isinstance(kayit, dict):
                        kayit.setdefault(alan, son)
    except Exception as e:
        print(f"olcum ttl hatasi: {{e}}")


try:  # kanca kurulamazsa Lambda yine calisir, yalnizca TTL eklenmez
    for _olay in ('PutItem', 'BatchWriteItem'):
        {d}.meta.client.meta.events.register('provide-client-params.dynamodb.' + _olay, _olcum_ttl)
except Exception as _e:
    print(f"olcum ttl kancasi kurulamadi: {{_e}}")


'''
    kaynak = kaynak[:h.start()] + kanca + kaynak[h.start():]
    if not re.search(r"^import\s+[^\n]*\bos\b", kaynak, re.M):
        kaynak = "import os\n" + kaynak
    print(f"YAMA: olcum TTL kancasi eklendi (tablo: {tablo}).")
    return kaynak, True


def yama_asistan(kaynak):
    """E) /de/asistan ucu. Döner: (yeni_kaynak, uygulandi_mi)."""
    if re.search(r"""if\s+path\s*==\s*['"]/de/asistan['"]""", kaynak):
        print("YAMA: asistan ucu zaten var.")
        return kaynak, False
    h = re.search(r"^def\s+lambda_handler\s*\(\s*(\w+)", kaynak, re.M)
    d = re.search(r"""^(\w+)\s*=\s*boto3\.resource\(\s*['"]dynamodb['"]""", kaynak, re.M)
    capa = re.search(
        r"""^([ \t]*)if\s+path\s*==\s*['"]/de/musteri/olustur['"]\s+and\s+method\s*==\s*['"]POST['"]\s*:""",
        kaynak, re.M)
    if not (h and d and capa):
        raise YamaAtla("lambda_handler, boto3.resource('dynamodb') ya da /de/musteri/olustur bulunamadı.")
    if not re.search(r"^\s*body\s*=", kaynak[h.end():], re.M):
        raise YamaAtla("işleyicide 'body' değişkeni bulunamadı.")
    g = capa.group(1)
    blok = (f"{g}if path == '/de/asistan' and method == 'POST':\n"
            f"{g}    try:\n"
            f"{g}        import dennis_asistan  # Lambda katmani (aws/asistan-kur.ps1)\n"
            f"{g}    except Exception as e:\n"
            f"{g}        print(f\"asistan yuklenemedi: {{e}}\")\n"
            f"{g}        return response(503, {{'hata': 'Asistan su an kullanilamiyor'}})\n"
            f"{g}    kod, govde = dennis_asistan.yanitla(body, {h.group(1)}, {d.group(1)})\n"
            f"{g}    return response(kod, govde)\n\n")
    kaynak = kaynak[:capa.start()] + blok + kaynak[capa.start():]
    print("YAMA: asistan ucu (/de/asistan) eklendi.")
    return kaynak, True


HESAP_EK = Path(__file__).with_name("hesap.py")
HESAP_YOLLARI = ("/de/hesap/sil", "/de/sifre/unuttum", "/de/sifre/sifirla", "/de/bildirim/abone", "/de/bildirim/iptal")
ACIK_YOLLAR = ("/de/sifre/unuttum", "/de/sifre/sifirla")


def cognito_bilgisi(kaynak):
    """(istemci değişkeni, havuz ifadesi, uygulama istemcisi ifadesi) — bulunamazsa YamaAtla."""
    istemci = re.search(r"""^(\w+)\s*=\s*boto3\.client\(\s*['"]cognito-idp['"]""", kaynak, re.M)
    if not istemci:
        raise YamaAtla("modül düzeyinde boto3.client('cognito-idp') bulunamadı.")
    havuz = re.search(r"admin_confirm_sign_up\((?:[^()]|\([^()]*\))*?UserPoolId\s*=\s*([^,\)\n]+)", kaynak, re.S)
    if not havuz:
        raise YamaAtla("admin_confirm_sign_up(UserPoolId=...) bulunamadı; havuz belirlenemedi.")
    uygulama = None
    for yol in ("/de/giris", "/de/musteri/kayit", "/de/token/yenile"):
        k = blok_bul(kaynak, yol)
        m = k and re.search(r"ClientId\s*=\s*([^,\)\n]+)", kaynak[k[0]:k[1]])
        if m:
            uygulama = m.group(1).strip()
            break
    if not uygulama:
        raise YamaAtla("ClientId=... bulunamadı; uygulama istemcisi belirlenemedi.")
    return istemci.group(1), havuz.group(1).strip(), uygulama


def yama_hesap(kaynak):
    """F) Hesap silme, şifre sıfırlama, bildirim aboneliği. Döner: (yeni_kaynak, uygulandi_mi)."""
    eksik = [y for y in HESAP_YOLLARI if not re.search(r"""if\s+path\s*==\s*['"]%s['"]""" % re.escape(y), kaynak)]
    if not eksik:
        print("YAMA: hesap uclari zaten var.")
        return kaynak, False
    if len(eksik) != len(HESAP_YOLLARI):
        raise YamaAtla(f"hesap uçlarının bir kısmı zaten var ({', '.join(sorted(set(HESAP_YOLLARI) - set(eksik)))}); elle bakılmalı.")
    cognito, havuz, uygulama = cognito_bilgisi(kaynak)

    g = blok_bul(kaynak, "/de/giris")
    kap = g and re.search(r"""(\w*kaptcha\w*)\(\s*body\.get\(\s*['"]kaptcha_token['"][^()]*\)\s*,"""
                          r"""\s*body\.get\(\s*['"]kaptcha_cevap['"][^()]*\)\s*\)""", kaynak[g[0]:g[1]])
    if not kap:
        raise YamaAtla("/de/giris işleyicisinde kaptcha doğrulama çağrısı bulunamadı.")
    cihaz = (tablo_ifadeleri(kaynak, "/de/cihaz/liste") or ["'dennis-cihazlar'"])[0]

    h = re.search(r"^def\s+lambda_handler\s*\(\s*(\w+)", kaynak, re.M)
    capa = re.search(
        r"""^([ \t]*)if\s+path\s*==\s*['"]/de/musteri/olustur['"]\s+and\s+method\s*==\s*['"]POST['"]\s*:""",
        kaynak, re.M)
    if not (h and capa):
        raise YamaAtla("lambda_handler ya da /de/musteri/olustur bulunamadı.")
    for gerekli in ("DE_MUSTERI", "def response", "dynamodb"):
        if gerekli not in kaynak:
            raise YamaAtla(f"'{gerekli}' bulunamadı.")

    ek = HESAP_EK.read_text(encoding="utf-8")
    yardimci = ek[ek.index("# ═══ YARDIMCILAR ═══"):ek.index("# ═══ UÇLAR ═══")]
    yardimci = yardimci.split("\n", 1)[1]
    uclar = ek[ek.index("# ═══ UÇLAR ═══"):].split("\n", 1)[1].rstrip() + "\n\n"
    for yer, deger in (("__COGNITO__", cognito), ("__HAVUZ__", havuz), ("__ISTEMCI__", uygulama),
                       ("__KAPTCHA__", kap.group(0)), ("__CIHAZ__", cihaz)):
        yardimci = yardimci.replace(yer, deger)
    olay = h.group(1)
    if olay != "event":
        uclar = re.sub(r"\bevent\b", olay, uclar)
    gir = capa.group(1)
    uclar = "\n".join((gir + s[4:]) if s.strip() else s for s in uclar.splitlines()) + "\n"
    kaynak = kaynak[:capa.start()] + uclar + kaynak[capa.start():]
    h = re.search(r"^def\s+lambda_handler\s*\(", kaynak, re.M)
    kaynak = kaynak[:h.start()] + yardimci.rstrip() + "\n\n\n" + kaynak[h.start():]
    for modul in ("os", "json"):
        if not re.search(r"^import\s+[^\n]*\b%s\b" % modul, kaynak, re.M):
            kaynak = f"import {modul}\n" + kaynak

    # Şifre sıfırlama oturumsuz uçlardır
    ac = re.search(r"^CIHAZ_ENDPOINTLERI\s*=\s*\(", kaynak, re.M)
    if not ac:
        raise YamaAtla("CIHAZ_ENDPOINTLERI bulunamadı; şifre sıfırlama uçları oturumsuz açılamadı.")
    # Açılış parantezinin hemen ardına eklenir: tek satırlık, çok satırlık ve yorumlu demetlerde geçerli
    ekler = "".join(f"\n    '{y}'," for y in ACIK_YOLLAR)
    kaynak = kaynak[:ac.end()] + ekler + kaynak[ac.end():]
    print(f"YAMA: hesap uclari eklendi (cognito: {cognito}, havuz: {havuz}, istemci: {uygulama}, cihaz tablosu: {cihaz}).")
    return kaynak, True


def yama_eposta_dogrula(kaynak):
    """G) admin_confirm_sign_up sonrası email_verified=true. Döner: (yeni_kaynak, uygulandi_mi)."""
    desen = re.compile(r"^([ \t]*)(\w+)\.admin_confirm_sign_up\(\s*UserPoolId\s*=\s*([^,\n]+?)\s*,\s*Username\s*=\s*([^\n]+?)\)[ \t]*\n", re.M)
    parcalar, son, sayi = [], 0, 0
    for m in desen.finditer(kaynak):
        sonraki = "\n".join(kaynak[m.end():].split("\n", 4)[:4])   # sonraki dört satır
        parcalar.append(kaynak[son:m.end()])
        son = m.end()
        if "email_verified" in sonraki:
            continue
        g, ist, havuz, ad = m.groups()
        parcalar.append(f"{g}try:  # sifremi unuttum kodu yalnizca dogrulanmis e-postaya gider\n"
                        f"{g}    {ist}.admin_update_user_attributes(UserPoolId={havuz}, Username={ad},\n"
                        f"{g}        UserAttributes=[{{'Name': 'email_verified', 'Value': 'true'}}])\n"
                        f"{g}except Exception as _e:\n"
                        f"{g}    print(f\"email_verified atanamadi: {{_e}}\")\n")
        sayi += 1
    if not parcalar:
        raise YamaAtla("admin_confirm_sign_up(UserPoolId=..., Username=...) çağrısı bulunamadı.")
    if not sayi:
        print("YAMA: e-posta dogrulama zaten var.")
        return kaynak, False
    kaynak = "".join(parcalar) + kaynak[son:]
    print(f"YAMA: {sayi} onay noktasina email_verified eklendi.")
    return kaynak, True


def yama_kvkk(kaynak):
    """H) Kayıtta KVKK aydınlatma onayı zorunlu; onay kayda yazılır. Döner: (yeni_kaynak, uygulandi_mi)."""
    if "kvkk_aydinlatma" in kaynak:
        print("YAMA: KVKK onayi zaten var.")
        return kaynak, False
    k = blok_bul(kaynak, "/de/musteri/kayit")
    if not k:
        raise YamaAtla("'/de/musteri/kayit' işleyicisi bulunamadı.")
    blok = kaynak[k[0]:k[1]]
    ek = re.search(r"^([ \t]*)if\s+eksik\s*:[ \t]*\n([ \t]*)return\s+response\([^\n]*\n", blok, re.M)
    if not ek:
        raise YamaAtla("kayıt işleyicisinde eksik alan kontrolü bulunamadı.")
    g, ic = ek.group(1), ek.group(2)
    kontrol = (f"{g}if body.get('kvkk_aydinlatma') is not True:\n"
               f"{ic}return response(400, {{'hata': 'Kayit icin Aydinlatma Metni onayi gerekli'}})\n")
    blok = blok[:ek.end()] + kontrol + blok[ek.end():]
    su = blok.find("sign_up(")
    hedef = re.compile(r"^([ \t]*)(?:# Otomatik onay|return\s+response\(\s*200\b)", re.M).search(blok, su if su >= 0 else 0)
    if su < 0 or not hedef or not re.search(r"^\s*musteri_id\s*=", blok[:hedef.start()], re.M):
        raise YamaAtla("kayıt işleyicisinde sign_up sonrası başarılı yanıt ya da musteri_id bulunamadı.")
    g = hedef.group(1)
    yaz = (f"{g}# KVKK: onay zamani, metin surumu ve yurt disi aktarim acik rizasi (ispat icin)\n"
           f"{g}try:\n"
           f"{g}    dynamodb.Table(DE_MUSTERI).update_item(\n"
           f"{g}        Key={{'musteri_id': musteri_id}},\n"
           f"{g}        UpdateExpression='SET kvkk_aydinlatma = :z, kvkk_surum = :s, yurtdisi_riza = :y',\n"
           f"{g}        ExpressionAttributeValues={{':z': datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec='seconds'),\n"
           f"{g}                                   ':s': str(body.get('kvkk_surum') or '')[:20],\n"
           f"{g}                                   ':y': body.get('yurtdisi_riza') is True}})\n"
           f"{g}except Exception as e:\n"
           f"{g}    print(f\"kvkk onayi yazilamadi: {{e}}\")\n")
    blok = blok[:hedef.start()] + yaz + blok[hedef.start():]
    kaynak = kaynak[:k[0]] + blok + kaynak[k[1]:]
    if not re.search(r"^from\s+datetime\s+import\s+[^\n]*\bdatetime\b[^\n]*\btimezone\b|^from\s+datetime\s+import\s+[^\n]*\btimezone\b[^\n]*\bdatetime\b", kaynak, re.M):
        kaynak = "from datetime import datetime, timezone\n" + kaynak
    print("YAMA: KVKK onayi kayda eklendi.")
    return kaynak, True


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--olcum-tablosu":
        try:
            builtins.print(json.dumps(olcum_tablosu(Path(sys.argv[2]).read_text(encoding="utf-8"))))
        except YamaAtla as e:
            print(f"YAMA: {e}")
            sys.exit(4)
        return
    if len(sys.argv) != 3:
        dur("kullanım: python yamala.py <girdi> <cikti>", 1)
    kaynak = Path(sys.argv[1]).read_text(encoding="utf-8")

    kaynak, a = yama_guncelle(kaynak)
    kaynak, b = yama_kayit(kaynak)
    atlananlar = []
    uygulandi = [a, b]
    for ad, yama in (("otomatik onay", yama_otomatik_onay), ("olcum TTL", yama_olcum_ttl),
                     ("asistan ucu", yama_asistan), ("hesap uclari", yama_hesap),
                     ("e-posta dogrulama", yama_eposta_dogrula), ("KVKK onayi", yama_kvkk)):
        try:
            kaynak, u = yama(kaynak)
            uygulandi.append(u)
        except YamaAtla as e:
            atlananlar.append(ad)
            print(f"YAMA: UYARI - {ad} UYGULANMADI: {e}")
    if not any(uygulandi):
        if atlananlar:
            dur(f"{', '.join(atlananlar)} uygulanamadi; diger yamalar zaten var. Hicbir sey yazilmadi.")
        dur("tum yamalar zaten var, degisiklik gerekmiyor.", 3)

    try:
        compile(kaynak, "lambda_function.py", "exec")
    except SyntaxError as e:
        dur(f"yamalı dosya derlenmedi ({e}); hiçbir şey yazılmadı.")

    Path(sys.argv[2]).write_text(kaynak, encoding="utf-8")
    print(f"YAMA: tamam -> {sys.argv[2]}")


if __name__ == "__main__":
    # Türkçe Windows konsolu (cp1254) bazı karakterleri yazamaz; çıktı yüzünden
    # yama asla çökmesin — yazılamayan karakter "?" olur.
    for akis in (sys.stdout, sys.stderr):
        try:
            akis.reconfigure(errors="replace")
        except Exception:
            pass
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        print(f"YAMA: beklenmeyen hata ({type(e).__name__}: {e}); hiçbir şey yazılmadı.")
        sys.exit(1)
