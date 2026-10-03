"""Testler için örnek backend — gerçek inverterai-api Lambda'sının YAPISINI temsil eder.

Gerçek lambda_function.py AWS'dedir ve bu depoda yoktur. Bu dosya, güvenlik ve veri
akışı testlerinin üzerinde çalışabilmesi için backend'in DEVIR.md'de tanımlı davranışını
(kimlik kapısı, ROL_IZIN rol denetimi, müşteri süzmesi, cihaz ölçümü alımı ve türetilmiş
alanlar) yeniden üretir. Testler buna aws/ekler/yamala.py'nin GERÇEK yamalarını uygular;
böylece hem yamalar hem de yamalanmış backend'in davranışı sınanır.

Burada doğrulanan kurallar gerçek backend'de de geçerli olmalıdır:
  · CIHAZ_ENDPOINTLERI dışındaki her yol oturum ister (oturumsuz → 401)
  · ROL_IZIN'deki yollar yalnızca o rollere açıktır (müşteri → 403)
  · Müşteri oturumunda okuma uçları kullanici['musteri_id'] ile süzülür
  · Cihaz ölçümü cihaz anahtarıyla doğrulanır; türetilmiş alanlar sunucuda hesaplanır
"""
import json
import os
import re
from decimal import Decimal
from datetime import datetime, timezone

import boto3

dynamodb = boto3.resource('dynamodb')
cognito = boto3.client('cognito-idp')
DE_MUSTERI = 'dennis-musteriler'
DE_CIHAZ = 'dennis-cihazlar'
DE_AKU = 'dennis-aku-verileri'
DE_INVERTER = 'dennis-inverter-verileri'
COGNITO_CLIENT_ID = os.environ.get('COGNITO_CLIENT_ID', 'test-istemci')
USER_POOL_ID = os.environ.get('USER_POOL_ID', 'eu-central-1_6Y1AK5Z3q')

# Kimlik gerektirmeyen uçlar (cihaz/üretim anahtarı ya da kaptcha ile doğrulanır)
CIHAZ_ENDPOINTLERI = (
    '/de/aku/veri', '/de/inverter/veri',
    '/de/musteri/kayit', '/de/kaptcha', '/de/giris', '/de/token/yenile',
)

# Yol → izinli roller (listede olmayan yol her oturuma açıktır, müşteri süzmesiyle)
ROL_IZIN = {
    '/de/musteri/olustur': ['admin', 'uretici', 'satici'],
    '/de/kayit/karar': ['admin', 'uretici'],
    '/de/kayit/liste': ['admin', 'uretici'],
    '/de/garanti/guncelle': ['admin', 'uretici'],
    '/de/parti/liste': ['admin', 'uretici'],
}


def response(kod, govde):
    return {'statusCode': kod, 'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps(govde, default=str)}


def kaptcha_dogrula(token, cevap):
    # Gerçekte sunucuda imzalı token denetlenir; testte sabit kod
    return bool(token) and str(cevap).lower() == 'k4tm9'


def _cihaz_dogrula(cihaz_id, anahtar):
    c = dynamodb.Table(DE_CIHAZ).get_item(Key={'cihaz_id': cihaz_id}).get('Item')
    return c if c and anahtar and c.get('anahtar') == anahtar else None


def _kullanici(event):
    """Oturum sahibi. Gerçek backend gibi Authorization'daki JWT'nin claim'lerinden
    rolü ve müşteri kimliğini okur (custom:rol, custom:musteri_id)."""
    import base64
    b = {str(k).lower(): v for k, v in (event.get('headers') or {}).items()}
    t = str(b.get('authorization') or '').replace('Bearer ', '')
    try:
        y = t.split('.')[1]
        y += '=' * (-len(y) % 4)
        c = json.loads(base64.urlsafe_b64decode(y))
    except Exception:
        return None
    if not c.get('cognito:username') and not c.get('sub'):
        return None
    return {'rol': c.get('custom:rol', ''), 'musteri_id': c.get('custom:musteri_id', ''),
            'kullanici_adi': c.get('cognito:username') or c.get('sub'), 'sub': c.get('sub', '')}


def _say(x):
    return Decimal(str(x))


def _tara(tablo, **arg):
    """Tabloyu sayfalayarak TAMAMEN tarar. scan tek sayfa döndürür; büyük tabloda
    LastEvaluatedKey izlenmezse pano eksik sayar (DEVIR §9 notu)."""
    ogeler, devam = [], None
    while True:
        if devam:
            arg['ExclusiveStartKey'] = devam
        s = tablo.scan(**arg)
        ogeler += s.get('Items', [])
        devam = s.get('LastEvaluatedKey')
        if not devam:
            return ogeler


def lambda_handler(event, context):
    path = event.get('path', '').replace('/prod', '')
    method = event.get('httpMethod')
    try:
        body = json.loads(event.get('body') or '{}')
    except (ValueError, TypeError):
        return response(400, {'hata': 'Gecersiz istek govdesi'})
    if not isinstance(body, dict):
        return response(400, {'hata': 'Gecersiz istek govdesi'})

    # ── Kimlik kapısı ──
    kullanici = None
    if path not in CIHAZ_ENDPOINTLERI:
        kullanici = _kullanici(event)
        if not kullanici:
            return response(401, {'hata': 'Yetkisiz erisim - gecerli oturum gerekli'})
        izinli = ROL_IZIN.get(path)
        if izinli is not None and kullanici['rol'] not in izinli:
            return response(403, {'hata': 'Bu islem icin yetkiniz yok'})
    musteri = kullanici['musteri_id'] if (kullanici and kullanici['rol'] == 'musteri') else None

    # ── Cihaz ölçümü alımı (DEVIR §4): anahtar doğrula, türetilmiş alanları hesapla ──
    if path == '/de/aku/veri' and method == 'POST':
        c = _cihaz_dogrula(body.get('cihaz_id', ''), body.get('anahtar', ''))
        if not c:
            return response(403, {'hata': 'Cihaz dogrulanamadi'})
        hucreler = [int(h) for h in (body.get('hucreler') or [])]
        sicakliklar = [int(s) for s in (body.get('sicakliklar') or [])]
        zaman = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        kayit = {'cihaz_id': c['cihaz_id'], 'zaman': zaman,
                 'soc': _say(body.get('soc', 0)), 'akim': _say(body.get('akim', 0)),
                 'gerilim': _say(body.get('gerilim', 0)), 'cevrim': _say(body.get('cevrim', 0)),
                 'hucreler': [_say(h) for h in hucreler], 'sicakliklar': [_say(s) for s in sicakliklar],
                 'hata_kodlari': body.get('hata_kodlari', [])}
        if hucreler:
            kayit['max_hucre_mv'] = _say(max(hucreler))
            kayit['min_hucre_mv'] = _say(min(hucreler))
            kayit['hucre_farki_mv'] = _say(max(hucreler) - min(hucreler))
            kayit['min_hucre_no'] = min(range(len(hucreler)), key=lambda i: hucreler[i]) + 1
        if sicakliklar:
            kayit['max_sicaklik'] = _say(max(t for t in sicakliklar))
        dynamodb.Table(DE_AKU).put_item(Item=kayit)
        guncelle = {'son_veri': zaman}
        if body.get('saglik') is not None:
            guncelle['saglik'] = _say(body['saglik'])
        ifade = 'SET ' + ', '.join(f'#{k} = :{k}' for k in guncelle)
        dynamodb.Table(DE_CIHAZ).update_item(
            Key={'cihaz_id': c['cihaz_id']}, UpdateExpression=ifade,
            ExpressionAttributeNames={f'#{k}': k for k in guncelle},
            ExpressionAttributeValues={f':{k}': v for k, v in guncelle.items()})
        return response(200, {'ok': True})

    if path == '/de/inverter/veri' and method == 'POST':
        c = _cihaz_dogrula(body.get('cihaz_id', ''), body.get('anahtar', ''))
        if not c:
            return response(403, {'hata': 'Cihaz dogrulanamadi'})
        zaman = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        dynamodb.Table(DE_INVERTER).put_item(Item={
            'cihaz_id': c['cihaz_id'], 'zaman': zaman,
            'gunluk_kwh': _say(body.get('gunluk_kwh', 0)), 'igbt': _say(body.get('igbt', 0)),
            'sogutucu': _say(body.get('sogutucu', 0))})
        dynamodb.Table(DE_CIHAZ).update_item(
            Key={'cihaz_id': c['cihaz_id']}, UpdateExpression='SET son_veri = :z',
            ExpressionAttributeValues={':z': zaman})
        return response(200, {'ok': True})

    # ── Pano okumaları (müşteri oturumunda kendi verisiyle süzülür) ──
    if path == '/de/cihaz/liste' and method == 'GET':
        hepsi = _tara(dynamodb.Table(DE_CIHAZ))
        if musteri:
            hepsi = [c for c in hepsi if c.get('musteri_id') == musteri]
        for c in hepsi:
            c.pop('anahtar', None)   # cihaz anahtarı panoya gitmez
        return response(200, {'cihazlar': hepsi})

    if path == '/de/cihaz/detay' and method == 'GET':
        cid = (event.get('queryStringParameters') or {}).get('cihaz_id', '')
        c = dynamodb.Table(DE_CIHAZ).get_item(Key={'cihaz_id': cid}).get('Item')
        if not c or (musteri and c.get('musteri_id') != musteri):
            return response(404, {'hata': 'Cihaz bulunamadi'})
        c.pop('anahtar', None)
        tablo = DE_AKU if c.get('tip') == 'aku' else DE_INVERTER
        son = dynamodb.Table(tablo).query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('cihaz_id').eq(cid),
            ScanIndexForward=False, Limit=1).get('Items', [])
        return response(200, {'cihaz': c, 'son_olcum': son[0] if son else None})

    if path == '/de/cihaz/gecmis' and method == 'GET':
        q = event.get('queryStringParameters') or {}
        cid = q.get('cihaz_id', '')
        c = dynamodb.Table(DE_CIHAZ).get_item(Key={'cihaz_id': cid}).get('Item')
        if not c or (musteri and c.get('musteri_id') != musteri):
            return response(404, {'hata': 'Cihaz bulunamadi'})
        tablo = DE_AKU if c.get('tip') == 'aku' else DE_INVERTER
        olcumler = dynamodb.Table(tablo).query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('cihaz_id').eq(cid)).get('Items', [])
        return response(200, {'olcumler': olcumler})

    if path == '/de/ozet' and method == 'GET':
        cihazlar = _tara(dynamodb.Table(DE_CIHAZ))
        if musteri:
            cihazlar = [c for c in cihazlar if c.get('musteri_id') == musteri]
        say = lambda f: sum(1 for c in cihazlar if f(c))
        return response(200, {'ozet': {
            'toplam': len(cihazlar), 'sahada': say(lambda c: c.get('musteri_id')),
            'arizali': say(lambda c: c.get('durum') == 'arizali'),
            'uyarida': say(lambda c: c.get('durum') == 'uyari')}})

    if path == '/de/musteri/liste' and method == 'GET':
        hepsi = _tara(dynamodb.Table(DE_MUSTERI))
        if musteri:
            hepsi = [m for m in hepsi if m.get('musteri_id') == musteri]
        return response(200, {'musteriler': hepsi})

    # ── yamala.py'nin ekleyeceği uçların dayandığı yerler ──
    if path == '/de/musteri/olustur' and method == 'POST':
        return response(200, {})

    if path == '/de/musteri/kayit' and method == 'POST':
        zorunlu = ['ad', 'soyad', 'eposta', 'sifre', 'telefon', 'il', 'ilce', 'adres', 'urun']
        eksik = [a for a in zorunlu if not str(body.get(a, '')).strip()]
        if eksik:
            return response(400, {'hata': 'Eksik alan: ' + ', '.join(eksik)})
        if body['urun'] not in ('aku', 'inverter', 'ikisi'):
            return response(400, {'hata': 'Gecersiz urun secimi'})
        eposta = str(body['eposta']).strip().lower()
        import random
        musteri_id = 'MST-' + ''.join(random.choices('0123456789', k=4))
        dynamodb.Table(DE_MUSTERI).put_item(Item={'musteri_id': musteri_id, 'email': eposta,
                                                   'telefon': str(body['telefon']).strip()})
        try:
            cognito.sign_up(
                ClientId=COGNITO_CLIENT_ID, Username=eposta, Password=body['sifre'],
                UserAttributes=[
                    {'Name': 'email', 'Value': eposta},
                    {'Name': 'custom:rol', 'Value': 'musteri'},
                    {'Name': 'custom:musteri_id', 'Value': musteri_id},
                ])
        except Exception as e:
            dynamodb.Table(DE_MUSTERI).delete_item(Key={'musteri_id': musteri_id})
            print(f"kayit hatasi: {e}")
            return response(400, {'hata': 'Kayit olusturulamadi'})
        return response(200, {'musteri_id': musteri_id, 'mesaj': 'ok'})

    if path == '/de/kayit/karar' and method == 'POST':
        mid = body.get('musteri_id')
        m = dynamodb.Table(DE_MUSTERI).get_item(Key={'musteri_id': mid}).get('Item')
        if not m:
            return response(404, {'hata': 'Basvuru bulunamadi'})
        if body.get('karar') == 'onay':
            cognito.admin_confirm_sign_up(UserPoolId=USER_POOL_ID, Username=m['email'])
            dynamodb.Table(DE_MUSTERI).update_item(Key={'musteri_id': mid},
                UpdateExpression='SET kayit_durumu = :d', ExpressionAttributeValues={':d': 'onaylandi'})
        return response(200, {'tamam': True})

    if path == '/de/giris' and method == 'POST':
        if not kaptcha_dogrula(body.get('kaptcha_token', ''), body.get('kaptcha_cevap', '')):
            return response(400, {'hata': 'Dogrulama kodu hatali veya suresi doldu'})
        return response(200, {'erisim': 'x', 'yenile': 'y', 'eposta': body.get('eposta')})

    return response(404, {'hata': 'Bulunamadi'})
