"""Bellekte çalışan sahte DynamoDB + Cognito (backend testleri için).

Gerçek boto3 yerine kullanılır; kalıcı altyapı gerektirmeden Lambda kodunun
davranışını sınar. boto3.dynamodb.conditions (Key/Attr) gerçeğinden kullanılır.
"""
import copy
import re
import sys
import types

import boto3.dynamodb.conditions as kosullar
from boto3.dynamodb.conditions import Attr, Key  # noqa: F401 (testler kullanır)


class SahteTablo:
    def __init__(self, hash_key, range_key=None, sayfa=None):
        self.hash_key, self.range_key = hash_key, range_key
        self.ogeler = {}
        self.sayfa = sayfa   # None: tek sayfada tümü (DynamoDB <1MB gibi). Sayı: sayfalama zorlar.

    def _anahtar(self, item):
        return (item[self.hash_key], item.get(self.range_key)) if self.range_key else item[self.hash_key]

    def put_item(self, Item):
        self.ogeler[self._anahtar(Item)] = copy.deepcopy(Item)

    def get_item(self, Key):
        a = self._anahtar(Key)
        return {'Item': copy.deepcopy(self.ogeler[a])} if a in self.ogeler else {}

    def delete_item(self, Key):
        self.ogeler.pop(self._anahtar(Key), None)

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues=None,
                    ExpressionAttributeNames=None, ConditionExpression=None, **k):
        a = self._anahtar(Key)
        o = self.ogeler.setdefault(a, dict(Key))
        adlar = ExpressionAttributeNames or {}
        for parca in re.split(r'\s+(?=SET|REMOVE)', UpdateExpression.strip()):
            if parca.upper().startswith('SET'):
                for atama in parca[3:].split(','):
                    sol, sag = [x.strip() for x in atama.split('=')]
                    o[adlar.get(sol, sol)] = ExpressionAttributeValues[sag]
            elif parca.upper().startswith('REMOVE'):
                for alan in parca[6:].split(','):
                    o.pop(adlar.get(alan.strip(), alan.strip()), None)

    def _suz(self, ifade, oge):
        return _kosul_dogru(ifade, oge) if ifade is not None else True

    def scan(self, FilterExpression=None, ExclusiveStartKey=None, ProjectionExpression=None, **k):
        secili = [o for o in self.ogeler.values() if self._suz(FilterExpression, o)]
        anahtarlar = [self._anahtar(o) for o in secili]
        if ExclusiveStartKey is None:
            bas = 0
        else:
            hedef = self._anahtar(ExclusiveStartKey)
            bas = anahtarlar.index(hedef) + 1 if hedef in anahtarlar else len(secili)
        n = self.sayfa or len(secili) or 1          # sayfa=None: tümü tek sayfada
        dilim = [copy.deepcopy(o) for o in secili[bas:bas + n]]
        sonuc = {'Items': dilim}
        if bas + n < len(secili):
            o = secili[bas + n - 1]
            son = {self.hash_key: o[self.hash_key]}
            if self.range_key:
                son[self.range_key] = o[self.range_key]
            sonuc['LastEvaluatedKey'] = son
        return sonuc

    def query(self, KeyConditionExpression, ScanIndexForward=True, Limit=None, **k):
        hk = KeyConditionExpression._values[1]
        esl = [copy.deepcopy(o) for o in self.ogeler.values() if o[self.hash_key] == hk]
        if self.range_key:
            esl.sort(key=lambda o: o[self.range_key], reverse=not ScanIndexForward)
        return {'Items': esl[:Limit] if Limit else esl}


def _kosul_dogru(ifade, oge):
    """Attr(...).eq/gt/lt ve & | birleşimlerini değerlendirir (testlerin kullandığı kadarı)."""
    if isinstance(ifade, kosullar.And):
        return all(_kosul_dogru(v, oge) for v in ifade._values)
    if isinstance(ifade, kosullar.Or):
        return any(_kosul_dogru(v, oge) for v in ifade._values)
    ad = ifade._values[0].name
    deger = oge.get(ad)
    if isinstance(ifade, kosullar.Equals):
        return deger == ifade._values[1]
    if isinstance(ifade, kosullar.NotEquals):
        return deger != ifade._values[1]
    if isinstance(ifade, kosullar.GreaterThan):
        return deger is not None and deger > ifade._values[1]
    if isinstance(ifade, kosullar.LessThan):
        return deger is not None and deger < ifade._values[1]
    raise NotImplementedError(type(ifade).__name__)



class SahteDynamo:
    def __init__(self, tablolar):
        self.t = tablolar
        kayitci = types.SimpleNamespace(register=lambda *a, **k: None)
        self.meta = types.SimpleNamespace(client=types.SimpleNamespace(
            meta=types.SimpleNamespace(events=kayitci),
            exceptions=types.SimpleNamespace(ConditionalCheckFailedException=type('C', (Exception,), {}))))

    def Table(self, ad):
        if ad not in self.t:
            raise KeyError(f"sahte tabloda yok: {ad}")
        return self.t[ad]


class CognitoHata(Exception):
    pass


_COG_ADLARI = ['NotAuthorizedException', 'TooManyRequestsException', 'UserNotFoundException',
               'InvalidParameterException', 'LimitExceededException', 'CodeMismatchException',
               'ExpiredCodeException', 'InvalidPasswordException', 'TooManyFailedAttemptsException',
               'UsernameExistsException']


class SahteCognito:
    def __init__(self):
        self.exceptions = types.SimpleNamespace(**{a: type(a, (CognitoHata,), {}) for a in _COG_ADLARI})
        self.kullanicilar = {}   # kullanici_adi -> {'sifre', 'oz': {...}}
        self.cagrilar = []
        self.hata = {}           # cagri_adi -> istisna adı
        self.son_kod = None
        self.guncellenen = None

    def _c(self, ad):
        self.cagrilar.append(ad)
        if ad in self.hata:
            raise getattr(self.exceptions, self.hata[ad])()

    def admin_get_user(self, UserPoolId, Username):
        self._c('admin_get_user')
        for ad, k in self.kullanicilar.items():
            if Username in (ad, k['oz'].get('sub')):
                return {'Username': ad, 'UserAttributes': [{'Name': n, 'Value': v} for n, v in k['oz'].items()]}
        raise self.exceptions.UserNotFoundException()

    def initiate_auth(self, ClientId, AuthFlow, AuthParameters):
        self._c('initiate_auth')
        k = self.kullanicilar.get(AuthParameters['USERNAME'])
        if not k or k['sifre'] != AuthParameters['PASSWORD']:
            raise self.exceptions.NotAuthorizedException()
        return {'AuthenticationResult': {'IdToken': 'x'}}

    def admin_delete_user(self, UserPoolId, Username):
        self._c('admin_delete_user')
        self.kullanicilar.pop(Username, None)

    def forgot_password(self, ClientId, Username):
        self._c('forgot_password')
        if Username not in self.kullanicilar:
            raise self.exceptions.UserNotFoundException()
        self.son_kod = ('123456', Username)

    def confirm_forgot_password(self, ClientId, Username, ConfirmationCode, Password):
        self._c('confirm_forgot_password')
        if ConfirmationCode != '123456':
            raise self.exceptions.CodeMismatchException()
        if len(Password) < 8:
            raise self.exceptions.InvalidPasswordException()
        self.kullanicilar[Username]['sifre'] = Password

    def sign_up(self, ClientId, Username, Password, UserAttributes):
        self._c('sign_up')
        if Username in self.kullanicilar:
            raise self.exceptions.UsernameExistsException()
        oz = {a['Name']: a['Value'] for a in UserAttributes}
        self.kullanicilar[Username] = {'sifre': Password, 'oz': oz}

    def admin_confirm_sign_up(self, UserPoolId, Username):
        self._c('admin_confirm_sign_up')

    def admin_update_user_attributes(self, UserPoolId, Username, UserAttributes):
        self._c('admin_update_user_attributes')
        self.guncellenen = (Username, UserAttributes)
        if Username in self.kullanicilar:
            self.kullanicilar[Username]['oz'].update({a['Name']: a['Value'] for a in UserAttributes})


def kur(tablolar, cognito=None):
    """boto3'ü sahtelerle değiştirir. Döner: (dynamo, cognito)."""
    dyn = SahteDynamo(tablolar)
    cog = cognito or SahteCognito()
    sahte = types.ModuleType('boto3')
    sahte.resource = lambda *a, **k: dyn
    sahte.client = lambda *a, **k: cog
    sahte.dynamodb = sys.modules.get('boto3.dynamodb')
    if sahte.dynamodb is None:
        import boto3.dynamodb as _bd
        sahte.dynamodb = _bd
    sys.modules['boto3'] = sahte
    sys.modules['boto3.dynamodb'] = sahte.dynamodb
    sys.modules['boto3.dynamodb.conditions'] = kosullar
    return dyn, cog
