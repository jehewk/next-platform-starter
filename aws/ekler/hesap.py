# ─────────────────────────────────────────────────────────────────────────
#  EK: hesap silme, şifre sıfırlama, bildirim aboneliği (yamala.py, yama F)
#
#  Bu dosya şablondur; yamala.py aşağıdaki yer tutucuları canlı koddan
#  bulduğu değerlerle doldurup lambda_function.py'ye ekler:
#     __COGNITO__   cognito-idp istemci değişkeni (ör. cognito)
#     __HAVUZ__     kullanıcı havuzu ifadesi (ör. USER_POOL_ID)
#     __ISTEMCI__   uygulama istemcisi ifadesi (ör. COGNITO_CLIENT_ID)
#     __KAPTCHA__   /de/giris'teki kaptcha doğrulama çağrısı (body üzerinden)
#     __CIHAZ__     cihaz tablosu ifadesi (/de/cihaz/liste'nin okuduğu)
#
#  "YARDIMCILAR" bölümü lambda_handler'ın önüne, "UÇLAR" bölümü yönlendiriciye
#  ('/de/musteri/olustur' bloğunun önüne) eklenir.
#
#  Kimlik: /de/hesap/sil ve /de/bildirim/* oturum ister — ana Lambda bu yolları
#  (CIHAZ_ENDPOINTLERI dışında oldukları için) token doğrulamadan geçirmez.
#  Şifre sıfırlama uçları oturumsuzdur; yama onları CIHAZ_ENDPOINTLERI'ne ekler.
# ─────────────────────────────────────────────────────────────────────────

# ═══ YARDIMCILAR ═══
# Dennis: hesap silme / sifre sifirlama / bildirim aboneligi (aws/ekler/hesap.py)
import base64 as _de_b64
import hashlib as _de_hash
import re as _de_re

_DE_PUSH_SUNUCULARI = ('fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com',
                       'web.push.apple.com', 'notify.windows.com', 'push.apple.com')


def _de_jwt(event):
    """Authorization başlığındaki token'ın yükü (imza ana Lambda'da doğrulandı)."""
    b = {str(k).lower(): v for k, v in (event.get('headers') or {}).items()}
    t = str(b.get('authorization') or '').split(' ')[-1]
    try:
        y = t.split('.')[1]
        y += '=' * (-len(y) % 4)
        return json.loads(_de_b64.urlsafe_b64decode(y))
    except Exception:
        return {}


def _de_kullanici(event):
    """Oturum sahibinin Cognito öznitelikleri; bulunamazsa None."""
    c = _de_jwt(event)
    ad = c.get('cognito:username') or c.get('username') or c.get('sub')
    if not ad:
        return None
    try:
        u = __COGNITO__.admin_get_user(UserPoolId=__HAVUZ__, Username=ad)
    except Exception as e:
        print(f"kimlik okunamadi: {type(e).__name__}")
        return None
    oz = {a['Name']: a['Value'] for a in u.get('UserAttributes', [])}
    return {'kullanici_adi': u.get('Username') or ad, 'eposta': str(oz.get('email', '')).lower(),
            'rol': oz.get('custom:rol', ''), 'musteri_id': oz.get('custom:musteri_id', ''),
            'sub': oz.get('sub', '')}


def _de_tara(tablo, **arg):
    ogeler, devam = [], None
    while True:
        if devam:
            arg['ExclusiveStartKey'] = devam
        s = tablo.scan(**arg)
        ogeler += s.get('Items', [])
        devam = s.get('LastEvaluatedKey')
        if not devam:
            return ogeler


def _de_hesap_sil(event, body):
    """Müşteri kendi hesabını siler. Şifre yeniden sorulur (çalınan oturumla silinemesin)."""
    from boto3.dynamodb.conditions import Attr
    k = _de_kullanici(event)
    if not k:
        return 401, {'hata': 'Oturum dogrulanamadi; yeniden giris yapin'}
    if k['rol'] != 'musteri' or not k['musteri_id']:
        return 403, {'hata': 'Bu islem yalnizca musteri hesaplari icindir'}
    sifre = str(body.get('sifre') or '')
    if not sifre:
        return 400, {'hata': 'Sifrenizi girin'}
    try:
        __COGNITO__.initiate_auth(ClientId=__ISTEMCI__, AuthFlow='USER_PASSWORD_AUTH',
                                  AuthParameters={'USERNAME': k['kullanici_adi'], 'PASSWORD': sifre})
    except __COGNITO__.exceptions.NotAuthorizedException:
        return 403, {'hata': 'Sifre hatali'}
    except __COGNITO__.exceptions.TooManyRequestsException:
        return 429, {'hata': 'Cok fazla deneme; biraz sonra tekrar deneyin'}
    except Exception as e:
        print(f"hesap silme sifre dogrulama hatasi: {type(e).__name__}: {e}")
        return 502, {'hata': 'Sifre dogrulanamadi; biraz sonra tekrar deneyin'}

    mid = k['musteri_id']
    # 1) Cihazlar üreticinindir, silinmez: yalnızca müşteri bağlantısı kaldırılır
    ayrilan = 0
    try:
        t = dynamodb.Table(__CIHAZ__)
        for c in _de_tara(t, FilterExpression=Attr('musteri_id').eq(mid), ProjectionExpression='cihaz_id'):
            t.update_item(Key={'cihaz_id': c['cihaz_id']}, UpdateExpression='REMOVE musteri_id')
            ayrilan += 1
    except Exception as e:
        print(f"hesap silme cihaz ayirma hatasi: {type(e).__name__}: {e}")
        return 500, {'hata': 'Hesap silinemedi; lutfen tekrar deneyin'}
    # 2) Bildirim abonelikleri
    bt = os.environ.get('BILDIRIM_TABLOSU')
    if bt:
        try:
            t = dynamodb.Table(bt)
            for a in _de_tara(t, FilterExpression=Attr('musteri_id').eq(mid), ProjectionExpression='anahtar'):
                t.delete_item(Key={'anahtar': a['anahtar']})
        except Exception as e:
            print(f"hesap silme abonelik hatasi: {type(e).__name__}: {e}")
    # 3) Müşteri kaydı (ad, adres, telefon, e-posta)
    try:
        dynamodb.Table(DE_MUSTERI).delete_item(Key={'musteri_id': mid})
    except Exception as e:
        print(f"hesap silme kayit hatasi: {type(e).__name__}: {e}")
        return 500, {'hata': 'Hesap silinemedi; lutfen tekrar deneyin'}
    # 4) Giriş hesabı en son: önceki adımlar başarısızsa kullanıcı yeniden deneyebilsin
    try:
        __COGNITO__.admin_delete_user(UserPoolId=__HAVUZ__, Username=k['kullanici_adi'])
    except __COGNITO__.exceptions.UserNotFoundException:
        pass
    except Exception as e:
        print(f"hesap silme cognito hatasi: {type(e).__name__}: {e}")
        return 500, {'hata': 'Hesap silinemedi; lutfen tekrar deneyin'}
    print(json.dumps({'hesap_silindi': mid, 'ayrilan_cihaz': ayrilan}))
    return 200, {'ok': True}


def _de_sifre_unuttum(body):
    eposta = str(body.get('eposta') or '').strip().lower()
    if not __KAPTCHA__:
        return 400, {'hata': 'Dogrulama kodu hatali veya suresi doldu'}
    if not _de_re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', eposta):
        return 400, {'hata': 'Gecerli bir e-posta adresi girin'}
    try:
        __COGNITO__.forgot_password(ClientId=__ISTEMCI__, Username=eposta)
    except (__COGNITO__.exceptions.UserNotFoundException, __COGNITO__.exceptions.InvalidParameterException,
            __COGNITO__.exceptions.NotAuthorizedException) as e:
        # Hesabın varlığı açığa vurulmaz; doğrulanmış e-postası olmayan hesap da buraya düşer
        print(f"sifre sifirlama kodu gonderilmedi: {type(e).__name__}")
    except (__COGNITO__.exceptions.LimitExceededException, __COGNITO__.exceptions.TooManyRequestsException):
        return 429, {'hata': 'Cok fazla deneme; bir saat sonra tekrar deneyin'}
    except Exception as e:
        print(f"sifre sifirlama hatasi: {type(e).__name__}: {e}")
        return 502, {'hata': 'Kod gonderilemedi; biraz sonra tekrar deneyin'}
    return 200, {'ok': True, 'mesaj': 'Bu e-posta ile bir hesap varsa dogrulama kodu gonderildi.'}


def _de_sifre_sifirla(body):
    eposta = str(body.get('eposta') or '').strip().lower()
    kod = str(body.get('kod') or '').strip()
    yeni = str(body.get('yeni_sifre') or '')
    if not eposta or not _de_re.match(r'^\d{4,8}$', kod):
        return 400, {'hata': 'E-postaya gelen kodu girin'}
    try:
        __COGNITO__.confirm_forgot_password(ClientId=__ISTEMCI__, Username=eposta, ConfirmationCode=kod, Password=yeni)
    except (__COGNITO__.exceptions.CodeMismatchException, __COGNITO__.exceptions.UserNotFoundException):
        return 400, {'hata': 'Kod hatali'}
    except __COGNITO__.exceptions.ExpiredCodeException:
        return 400, {'hata': 'Kodun suresi doldu; yeni kod isteyin'}
    except __COGNITO__.exceptions.InvalidPasswordException:
        return 400, {'hata': 'Sifre kurallara uymuyor: en az 8 karakter, buyuk harf, kucuk harf ve rakam'}
    except (__COGNITO__.exceptions.LimitExceededException, __COGNITO__.exceptions.TooManyFailedAttemptsException,
            __COGNITO__.exceptions.TooManyRequestsException):
        return 429, {'hata': 'Cok fazla deneme; bir saat sonra tekrar deneyin'}
    except Exception as e:
        print(f"sifre sifirlama onay hatasi: {type(e).__name__}: {e}")
        return 502, {'hata': 'Sifre degistirilemedi; biraz sonra tekrar deneyin'}
    return 200, {'ok': True}


def _de_bildirim_abone(event, body, iptal=False):
    """Tarayıcı bildirim aboneliğini kaydeder/siler (aws/hazirlik-kur.ps1 tabloyu kurar)."""
    from datetime import datetime as _dt, timezone as _tz
    tablo = os.environ.get('BILDIRIM_TABLOSU')
    if not tablo:
        return 503, {'hata': 'Bildirimler henuz kurulmadi'}
    a = body.get('abonelik') or {}
    uc = str(a.get('endpoint') or '')
    sunucu = _de_re.sub(r'^https://([^/:]+).*$', r'\1', uc) if uc.startswith('https://') else ''
    if not sunucu or len(uc) > 1000 or not any(sunucu == s or sunucu.endswith('.' + s) for s in _DE_PUSH_SUNUCULARI):
        return 400, {'hata': 'Gecersiz bildirim aboneligi'}
    anahtar = 'abone#' + _de_hash.sha256(uc.encode()).hexdigest()[:40]
    t = dynamodb.Table(tablo)
    if iptal:
        t.delete_item(Key={'anahtar': anahtar})
        return 200, {'ok': True}
    k = _de_kullanici(event)
    if not k:
        return 401, {'hata': 'Oturum dogrulanamadi; yeniden giris yapin'}
    anahtarlar = a.get('keys') or {}
    p256dh, auth = str(anahtarlar.get('p256dh') or ''), str(anahtarlar.get('auth') or '')
    if not (40 <= len(p256dh) <= 200 and 10 <= len(auth) <= 100):
        return 400, {'hata': 'Gecersiz bildirim aboneligi'}
    t.put_item(Item={'anahtar': anahtar, 'tur': 'abone', 'endpoint': uc, 'p256dh': p256dh, 'auth': auth,
                     'rol': k['rol'] or 'musteri', 'musteri_id': k['musteri_id'], 'sub': k['sub'],
                     'olusturma': _dt.now(_tz.utc).replace(tzinfo=None).isoformat(timespec='seconds')})
    return 200, {'ok': True}


# ═══ UÇLAR ═══
    if path == '/de/hesap/sil' and method == 'POST':
        kod, govde = _de_hesap_sil(event, body)
        return response(kod, govde)

    if path == '/de/sifre/unuttum' and method == 'POST':
        kod, govde = _de_sifre_unuttum(body)
        return response(kod, govde)

    if path == '/de/sifre/sifirla' and method == 'POST':
        kod, govde = _de_sifre_sifirla(body)
        return response(kod, govde)

    if path == '/de/bildirim/abone' and method == 'POST':
        kod, govde = _de_bildirim_abone(event, body)
        return response(kod, govde)

    if path == '/de/bildirim/iptal' and method == 'POST':
        kod, govde = _de_bildirim_abone(event, body, iptal=True)
        return response(kod, govde)

