"""Backend testleri: yamala.py'nin GERÇEK yamalarını örnek backend'e uygular, sonra
bellekteki AWS ile API / güvenlik / veri akışı / dayanıklılık / yük senaryolarını sınar.

    python3 test/backend/test_backend.py

Doğrulananlar:
  A. Kimlik ve yetki — oturumsuz 401, müşteri üretici ucunda 403, müşteri süzmesi,
     cihaz anahtarının panoya sızmaması
  B. Veri akışı — cihaz ölçümü doğru tabloya yazılır, türetilmiş alanlar hesaplanır,
     pano uçları veriyi doğru yerden okur
  C. Hesap uçları (yama F) — hesap silme / şifremi unuttum / bildirim kimlik kapısından geçer
  D. Dayanıklılık — bozuk gövde, eksik alan, enjeksiyon dizgeleri, tip uyumsuzluğu çökmez
  E. Yük — çok sayıda cihaz ve ölçümde sayfalama ve toplama doğru
"""
import base64
import json
import os
import re
import sys
import tempfile
from pathlib import Path

KOK = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
import sahte_aws  # noqa: E402

GECEN = []


def ok(ad):
    GECEN.append(ad)
    print(f"  ✓ {ad}")


def es(a, b, mesaj=""):
    if a != b:
        raise AssertionError(f"{mesaj}\n  beklenen: {b!r}\n  gelen:    {a!r}")


def yamali_backend():
    """ornek-backend.py'ye gerçek yamaları uygular ve kaynağı döndürür."""
    sys.path.insert(0, str(KOK / "aws" / "ekler"))
    import yamala
    kaynak = (Path(__file__).parent / "ornek-backend.py").read_text(encoding="utf-8")
    kaynak, _ = yamala.yama_guncelle(kaynak)
    kaynak, _ = yamala.yama_kayit(kaynak)
    # olcum TTL tek ölçüm tablolu backend'e göre yazılmıştır; bu örnek akü/inverter
    # ölçümlerini ayrı tablolarda tutar, o yüzden burada atlanabilir (güvenlik/veri
    # akışıyla ilgisi yok; TTL kancası ayrıca maliyet testlerinde sınanır).
    for ad, f, atlanabilir in (
            ("otomatik onay", yamala.yama_otomatik_onay, False), ("olcum TTL", yamala.yama_olcum_ttl, True),
            ("asistan", yamala.yama_asistan, False), ("hesap", yamala.yama_hesap, False),
            ("eposta", yamala.yama_eposta_dogrula, False), ("kvkk", yamala.yama_kvkk, False)):
        try:
            kaynak, _ = f(kaynak)
        except yamala.YamaAtla as e:
            if not atlanabilir:
                raise SystemExit(f"YAMA ATLANDI ({ad}): {e}  — örnek backend yapısı yamayla uyumlu değil")
    compile(kaynak, "yamali", "exec")   # yama sonrası derlenmeli
    return kaynak


def yukle():
    """Yamalı backend'i sahte AWS ile belleğe yükler. Döner: (modul, dynamo, cognito, tablolar)."""
    tablolar = {
        'dennis-musteriler': sahte_aws.SahteTablo('musteri_id'),
        'dennis-cihazlar': sahte_aws.SahteTablo('cihaz_id'),
        'dennis-aku-verileri': sahte_aws.SahteTablo('cihaz_id', 'zaman'),
        'dennis-inverter-verileri': sahte_aws.SahteTablo('cihaz_id', 'zaman'),
        'dennis-bildirim': sahte_aws.SahteTablo('anahtar'),
    }
    dyn, cog = sahte_aws.kur(tablolar)
    os.environ.update(USER_POOL_ID='HAVUZ', COGNITO_CLIENT_ID='IST', BILDIRIM_TABLOSU='dennis-bildirim')
    import types
    mod = types.ModuleType('yamali_backend')
    exec(compile(yamali_backend(), 'yamali_backend', 'exec'), mod.__dict__)
    return mod, dyn, cog, tablolar


def istek(mod, yol, govde=None, token=None, method='POST', sorgu=None, ham=None):
    ev = {'path': yol, 'httpMethod': method,
          'body': ham if ham is not None else json.dumps(govde or {}),
          'headers': {'Authorization': f'Bearer {token}'} if token else {},
          'queryStringParameters': sorgu or {}}
    y = mod.lambda_handler(ev, None)
    govde_json = json.loads(y['body']) if y.get('body') else {}
    return y['statusCode'], govde_json


def tohum(dyn, cog):
    """İki müşteri, cihazlar (anahtarlı) ve Cognito kullanıcıları."""
    M, C = dyn.t['dennis-musteriler'], dyn.t['dennis-cihazlar']
    M.put_item({'musteri_id': 'MST-1', 'ad': 'Ali', 'email': 'ali@x.com', 'adres': 'Adana', 'telefon': '0555'})
    M.put_item({'musteri_id': 'MST-2', 'ad': 'Veli', 'email': 'veli@x.com'})
    C.put_item({'cihaz_id': 'AKU-1', 'tip': 'aku', 'musteri_id': 'MST-1', 'durum': 'aktif', 'saglik': 92, 'anahtar': 'GIZLI-1'})
    C.put_item({'cihaz_id': 'INV-1', 'tip': 'inverter', 'musteri_id': 'MST-1', 'durum': 'uyari', 'saglik': 70, 'anahtar': 'GIZLI-2'})
    C.put_item({'cihaz_id': 'AKU-2', 'tip': 'aku', 'musteri_id': 'MST-2', 'durum': 'arizali', 'saglik': 44, 'anahtar': 'GIZLI-3'})
    C.put_item({'cihaz_id': 'AKU-9', 'tip': 'aku', 'musteri_id': None, 'durum': 'depoda', 'anahtar': 'GIZLI-9'})
    cog.kullanicilar = {
        'ali@x.com': {'sifre': 'Ali12345', 'oz': {'sub': 'S1', 'email': 'ali@x.com',
            'custom:rol': 'musteri', 'custom:musteri_id': 'MST-1'}},
        'uretim@x.com': {'sifre': 'Uret1234', 'oz': {'sub': 'SU', 'email': 'uretim@x.com', 'custom:rol': 'uretici'}}}


def jwt(kullanici_adi='u@x', rol='', mid='', sub='s'):
    """Cognito kimlik tokenı taklidi: claim'ler base64 yükte (imza doğrulanmaz)."""
    yuk = {'cognito:username': kullanici_adi, 'sub': sub}
    if rol:
        yuk['custom:rol'] = rol
    if mid:
        yuk['custom:musteri_id'] = mid
    return 'h.' + base64.urlsafe_b64encode(json.dumps(yuk).encode()).decode().rstrip('=') + '.s'


MUS = jwt('ali@x.com', 'musteri', 'MST-1', 'S1')
MUS2 = jwt('veli@x.com', 'musteri', 'MST-2', 'S2')
URE = jwt('uretim@x.com', 'uretici', '', 'SU')


# ═══════════════════ A. Kimlik ve yetki ═══════════════════

def test_yetki():
    mod, dyn, cog, _ = yukle()
    tohum(dyn, cog)

    for yol, method in (('/de/cihaz/liste', 'GET'), ('/de/ozet', 'GET'), ('/de/musteri/liste', 'GET'),
                        ('/de/kayit/karar', 'POST'), ('/de/hesap/sil', 'POST'), ('/de/bildirim/abone', 'POST')):
        k, _ = istek(mod, yol, method=method)
        es(k, 401, f"oturumsuz {yol}")
    ok("oturumsuz her korumalı uç 401")

    # Müşteri üretici-only uçlara erişemez (ROL_IZIN)
    for yol in ('/de/musteri/olustur', '/de/kayit/karar', '/de/kayit/liste', '/de/garanti/guncelle', '/de/parti/liste'):
        k, _ = istek(mod, yol, {}, token=MUS)
        es(k, 403, f"müşteri {yol}")
    ok("müşteri üretici-only uçlarda 403")

    # Üretici hepsini görür, müşteri yalnız kendi cihazlarını
    k, g = istek(mod, '/de/cihaz/liste', token=URE, method='GET')
    es(k, 200); es(len({c['cihaz_id'] for c in g['cihazlar']}), 4, "üretici tüm cihazlar")
    k, g = istek(mod, '/de/cihaz/liste', token=MUS, method='GET')
    es({c['cihaz_id'] for c in g['cihazlar']}, {'AKU-1', 'INV-1'}, "müşteri yalnız kendi cihazları")
    ok("müşteri cihaz listesinde yalnız kendi cihazları, üretici hepsi")

    # Başka müşterinin cihazına erişilemez
    es(istek(mod, '/de/cihaz/detay', token=MUS, method='GET', sorgu={'cihaz_id': 'AKU-2'})[0], 404, "başka cihaz detay")
    es(istek(mod, '/de/cihaz/gecmis', token=MUS, method='GET', sorgu={'cihaz_id': 'AKU-2'})[0], 404, "başka cihaz geçmiş")
    es(istek(mod, '/de/cihaz/detay', token=MUS, method='GET', sorgu={'cihaz_id': 'AKU-9'})[0], 404, "depodaki cihaz")
    ok("müşteri başkasının / depodaki cihazına erişemez (404)")

    # Müşteri listesi yalnız kendi kaydı
    k, g = istek(mod, '/de/musteri/liste', token=MUS, method='GET')
    es([m['musteri_id'] for m in g['musteriler']], ['MST-1'], "müşteri kendi kaydı")
    ok("müşteri yalnız kendi müşteri kaydını görür")

    # Cihaz anahtarı (sır) panoya sızmaz
    k, g = istek(mod, '/de/cihaz/liste', token=URE, method='GET')
    assert all('anahtar' not in c for c in g['cihazlar']), "cihaz anahtarı sızdı!"
    k, g = istek(mod, '/de/cihaz/detay', token=URE, method='GET', sorgu={'cihaz_id': 'AKU-1'})
    assert 'anahtar' not in g['cihaz'], "detayda anahtar sızdı!"
    ok("cihaz anahtarı (sır) listede ve detayda gösterilmiyor")


# ═══════════════════ B. Veri akışı ═══════════════════

def test_veri_akisi():
    mod, dyn, cog, tablolar = yukle()
    tohum(dyn, cog)
    AKU = tablolar['dennis-aku-verileri']

    # Yanlış/eksik anahtar → 403, hiç kayıt yazılmaz
    es(istek(mod, '/de/aku/veri', {'cihaz_id': 'AKU-1', 'anahtar': 'YANLIS', 'hucreler': [3300]})[0], 403, "yanlış anahtar")
    es(istek(mod, '/de/aku/veri', {'cihaz_id': 'AKU-1', 'hucreler': [3300]})[0], 403, "anahtarsız")
    es(istek(mod, '/de/aku/veri', {'cihaz_id': 'YOK', 'anahtar': 'x', 'hucreler': [3300]})[0], 403, "olmayan cihaz")
    es(len(AKU.ogeler), 0, "reddedilen ölçüm yazılmamalı")
    ok("cihaz ölçümü yanlış anahtarla reddedilir, kayıt yazılmaz")

    # Doğru anahtar → ölçüm aku tablosuna, türetilmiş alanlar hesaplanır
    hucreler = [3300, 3305, 3298, 3400, 3302, 3299, 3230, 3301]   # 7. hücre düşük
    k, g = istek(mod, '/de/aku/veri', {'cihaz_id': 'AKU-1', 'anahtar': 'GIZLI-1',
        'hucreler': hucreler, 'sicakliklar': [28, 30, 42, -40], 'soc': 83, 'akim': -12.5, 'saglik': 71})
    es(k, 200, g)
    es(len(AKU.ogeler), 1, "ölçüm yazıldı")
    kayit = list(AKU.ogeler.values())[0]
    es(kayit['cihaz_id'], 'AKU-1')
    es(int(kayit['hucre_farki_mv']), 170, "hücre farkı = max-min")
    es(int(kayit['min_hucre_no']), 7, "en düşük hücre numarası")
    es(int(kayit['max_hucre_mv']), 3400); es(int(kayit['min_hucre_mv']), 3230)
    es(int(kayit['max_sicaklik']), 42, "en yüksek sıcaklık (-40 bağlı değil ama max doğru)")
    ok("akü ölçümü doğru tabloya yazılır; hücre farkı / min hücre no / sıcaklık hesaplanır")

    # Cihaz kaydı güncellenir (son_veri + saglik)
    c = dyn.t['dennis-cihazlar'].get_item(Key={'cihaz_id': 'AKU-1'})['Item']
    assert c.get('son_veri'), "son_veri güncellenmedi"
    es(int(c['saglik']), 71, "sağlık güncellendi")
    ok("ölçüm cihazın son_veri ve sağlık alanını günceller")

    # İnverter ölçümü kendi tablosuna
    istek(mod, '/de/inverter/veri', {'cihaz_id': 'INV-1', 'anahtar': 'GIZLI-2', 'gunluk_kwh': 24.6, 'igbt': 58})
    es(len(tablolar['dennis-inverter-verileri'].ogeler), 1, "inverter ölçümü")
    es(len(AKU.ogeler), 1, "inverter ölçümü akü tablosuna gitmemeli")
    ok("inverter ölçümü inverter tablosuna yazılır (akü tablosuna karışmaz)")

    # Pano son ölçümü ve geçmişi doğru yerden okur
    for i, soc in enumerate((60, 70, 80)):
        AKU.put_item({'cihaz_id': 'AKU-1', 'zaman': f'2027-01-0{i+1}T00:00:00', 'soc': soc, 'hucre_farki_mv': 20 + i})
    k, g = istek(mod, '/de/cihaz/detay', token=MUS, method='GET', sorgu={'cihaz_id': 'AKU-1'})
    es(g['son_olcum']['zaman'], '2027-01-03T00:00:00', "en yeni ölçüm döner (zaman sıralı)")
    k, g = istek(mod, '/de/cihaz/gecmis', token=MUS, method='GET', sorgu={'cihaz_id': 'AKU-1'})
    assert len(g['olcumler']) >= 3, "geçmiş ölçümler"
    ok("detay en yeni ölçümü, geçmiş tüm ölçümleri doğru cihazdan döndürür")

    # Özet sayıları
    k, g = istek(mod, '/de/ozet', token=URE, method='GET')
    es(g['ozet'], {'toplam': 4, 'sahada': 3, 'arizali': 1, 'uyarida': 1}, "üretici özeti")
    k, g = istek(mod, '/de/ozet', token=MUS, method='GET')
    es(g['ozet']['toplam'], 2, "müşteri özeti yalnız kendi cihazları")
    ok("özet sayıları doğru; müşteri özeti kendi cihazlarıyla sınırlı")


# ═══════════════════ C. Hesap uçları yama sonrası ═══════════════════

def test_hesap_entegrasyon():
    mod, dyn, cog, tablolar = yukle()
    tohum(dyn, cog)
    ali = jwt('ali@x.com', 'musteri', 'MST-1', 'S1')

    # Şifremi unuttum oturumsuz çalışır (yama ACIK_YOLLAR'a ekledi)
    k, g = istek(mod, '/de/sifre/unuttum', {'eposta': 'ali@x.com', 'kaptcha_token': 'kt', 'kaptcha_cevap': 'k4tm9'})
    es(k, 200, g); es(cog.son_kod[1], 'ali@x.com')
    # Hesabın varlığı açığa vurulmaz
    es(istek(mod, '/de/sifre/unuttum', {'eposta': 'yok@x.com', 'kaptcha_token': 'kt', 'kaptcha_cevap': 'k4tm9'}),
       (k, g), "hesap varlığı sızdı")
    ok("şifremi unuttum oturumsuz ve hesap varlığını açığa vurmuyor (yama F+ACIK_YOLLAR)")

    # Hesap silme oturum + doğru rol + şifre ister; cihazı ayırır, kaydı siler
    es(istek(mod, '/de/hesap/sil', {'sifre': 'Ali12345'})[0], 401, "oturumsuz silme")
    es(istek(mod, '/de/hesap/sil', {'sifre': 'Ali12345'}, token=URE)[0], 403, "üretici silme (musteri değil)")
    es(istek(mod, '/de/hesap/sil', {'sifre': 'YANLIS'}, token=ali)[0], 403, "yanlış şifre")
    assert 'MST-1' in dyn.t['dennis-musteriler'].ogeler, "yanlış şifrede silinmemeli"
    k, g = istek(mod, '/de/hesap/sil', {'sifre': 'Ali12345'}, token=ali)
    es(k, 200, g)
    assert 'MST-1' not in dyn.t['dennis-musteriler'].ogeler, "müşteri kaydı silinmedi"
    assert 'ali@x.com' not in cog.kullanicilar, "cognito hesabı silinmedi"
    c = dyn.t['dennis-cihazlar'].get_item(Key={'cihaz_id': 'AKU-1'})['Item']
    assert 'musteri_id' not in c or not c.get('musteri_id'), "cihaz müşteriden ayrılmadı"
    assert 'AKU-1' in dyn.t['dennis-cihazlar'].ogeler, "cihaz kaydı silinmemeli (üreticinin)"
    ok("hesap silme: şifreyle, yalnız müşteri; kayıt+hesap silinir, cihaz ayrılır ama kalır")


# ═══════════════════ C2. Bildirim aboneliği güvenliği (SSRF) ═══════════════════

def test_bildirim_ssrf():
    mod, dyn, cog, tablolar = yukle()
    tohum(dyn, cog)
    iyi = {'endpoint': 'https://fcm.googleapis.com/fcm/send/abc', 'keys': {'p256dh': 'B' * 87, 'auth': 'A' * 22}}

    es(istek(mod, '/de/bildirim/abone', {'abonelik': iyi})[0], 401, "oturumsuz abone")
    k, g = istek(mod, '/de/bildirim/abone', {'abonelik': iyi}, token=MUS)
    es(k, 200, g)
    o = list(dyn.t['dennis-bildirim'].ogeler.values())[0]
    es(o['musteri_id'], 'MST-1'); es(o['rol'], 'musteri')
    ok("bildirim aboneliği oturumla kaydedilir, müşteri kimliği damgalanır")

    # Yalnızca bilinen push sunucuları (SSRF önlemi): içeriden adres, http, benzer alan reddedilir
    for kotu in ('https://169.254.169.254/latest/meta-data',   # bulut metadata (SSRF hedefi)
                 'https://10.0.0.5/x', 'http://fcm.googleapis.com/x',  # http
                 'https://fcm.googleapis.com.saldirgan.com/x',   # benzer alan
                 'https://evil.example.com/x', 'ftp://fcm.googleapis.com/x'):
        k, _ = istek(mod, '/de/bildirim/abone', {'abonelik': {'endpoint': kotu, 'keys': iyi['keys']}}, token=MUS)
        es(k, 400, f"SSRF/geçersiz hedef kabul edildi: {kotu}")
    ok("bildirim aboneliği yalnızca bilinen push sunucularını kabul eder (SSRF engellenir)")

    # Geçersiz/eksik anahtarlar reddedilir
    es(istek(mod, '/de/bildirim/abone', {'abonelik': {'endpoint': iyi['endpoint'], 'keys': {'p256dh': 'x', 'auth': 'y'}}}, token=MUS)[0], 400)
    ok("eksik/kısa şifreleme anahtarları reddedilir")


# ═══════════════════ D. Dayanıklılık ═══════════════════

def test_dayaniklilik():
    mod, dyn, cog, tablolar = yukle()
    tohum(dyn, cog)

    # Bozuk JSON gövde → 400, çökme yok
    es(istek(mod, '/de/giris', ham='{bozuk json')[0], 400, "bozuk json")
    es(istek(mod, '/de/giris', ham='[1,2,3]')[0], 400, "dizi gövde")
    es(istek(mod, '/de/giris', ham='null')[0], 400, "null gövde")
    ok("bozuk / dizi / null gövde 400 ile reddedilir, çökmez")

    # Eksik zorunlu alan
    k, g = istek(mod, '/de/musteri/kayit', {'ad': 'Ayşe'})
    es(k, 400); assert 'Eksik' in g['hata']
    ok("eksik zorunlu alan kayıtta 400")

    # Enjeksiyon benzeri dizgeler: kayıt olur, çökmez, süzme hâlâ doğru
    kotu_ad = "'; DROP TABLE x; <script>alert(1)</script> {{7*7}}"
    dyn.t['dennis-musteriler'].put_item({'musteri_id': 'MST-X', 'ad': kotu_ad})
    dyn.t['dennis-cihazlar'].put_item({'cihaz_id': 'AKU-X', 'tip': 'aku', 'musteri_id': 'MST-X', 'durum': 'aktif', 'anahtar': 'k'})
    k, g = istek(mod, '/de/cihaz/liste', token=jwt('x@x', 'musteri', 'MST-X', 'SX'), method='GET')
    es([c['cihaz_id'] for c in g['cihazlar']], ['AKU-X'], "enjeksiyon dizgesi süzmeyi bozmadı")
    # Dizge olduğu gibi saklanır (yorumlanmaz)
    k, g = istek(mod, '/de/musteri/liste', token=jwt('x@x', 'musteri', 'MST-X', 'SX'), method='GET')
    es(g['musteriler'][0]['ad'], kotu_ad, "dizge olduğu gibi")
    ok("enjeksiyon benzeri dizgeler veri olarak saklanır, süzmeyi ve çalışmayı bozmaz")

    # Ölçümde tip uyumsuzluğu / uç değerler çökmez
    k, _ = istek(mod, '/de/aku/veri', {'cihaz_id': 'AKU-1', 'anahtar': 'GIZLI-1', 'hucreler': [], 'sicakliklar': []})
    es(k, 200, "boş hücre listesi")
    k, _ = istek(mod, '/de/aku/veri', {'cihaz_id': 'AKU-1', 'anahtar': 'GIZLI-1', 'hucreler': [3300, 3310], 'soc': 10**9})
    es(k, 200, "çok büyük soc")
    ok("boş ölçüm listesi ve uç değerler çökmeden işlenir")

    # Bilinmeyen uç → 404
    es(istek(mod, '/de/olmayan/uc', {}, token=URE)[0], 404, "bilinmeyen uç")
    ok("bilinmeyen uç 404")


# ═══════════════════ E. Yük / çökme simülasyonu ═══════════════════

def test_yuk():
    # Sayfalamayı zorla: tablolar küçük sayfalarla döner, kodun hepsini okuması gerekir
    tablolar = {
        'dennis-musteriler': sahte_aws.SahteTablo('musteri_id', sayfa=3),
        'dennis-cihazlar': sahte_aws.SahteTablo('cihaz_id', sayfa=5),
        'dennis-aku-verileri': sahte_aws.SahteTablo('cihaz_id', 'zaman'),
        'dennis-inverter-verileri': sahte_aws.SahteTablo('cihaz_id', 'zaman'),
        'dennis-bildirim': sahte_aws.SahteTablo('anahtar', sayfa=4),
    }
    dyn, cog = sahte_aws.kur(tablolar)
    os.environ.update(USER_POOL_ID='HAVUZ', COGNITO_CLIENT_ID='IST', BILDIRIM_TABLOSU='dennis-bildirim')
    import types
    mod = types.ModuleType('yb2')
    exec(compile(yamali_backend(), 'yb2', 'exec'), mod.__dict__)

    M, C, AKU = dyn.t['dennis-musteriler'], dyn.t['dennis-cihazlar'], dyn.t['dennis-aku-verileri']
    N = 60
    for i in range(N):
        mid = f'M{i:03d}'
        M.put_item({'musteri_id': mid, 'ad': f'Müşteri {i}', 'email': f'm{i}@x.com'})
        durum = 'arizali' if i % 7 == 0 else 'aktif'
        C.put_item({'cihaz_id': f'AKU-{i:03d}', 'tip': 'aku', 'musteri_id': mid, 'durum': durum, 'saglik': 90, 'anahtar': f'k{i}'})
    # Bir cihaza 200 günlük ölçüm
    for g in range(200):
        AKU.put_item({'cihaz_id': 'AKU-000', 'zaman': f'2026-{(g//30)+1:02d}-{(g%30)+1:02d}T00:00:00', 'hucre_farki_mv': 20 + g})

    # Özet: scan sayfalamalı; kod LastEvaluatedKey izlemiyorsa sayı YANLIŞ çıkar
    k, g = istek(mod, '/de/ozet', token=URE, method='GET')
    es(g['ozet']['toplam'], N, "sayfalama altında özet tüm cihazları saymalı")
    es(g['ozet']['arizali'], len([i for i in range(N) if i % 7 == 0]), "arızalı sayısı")
    ok(f"{N} cihaz, sayfalı scan: özet doğru toplandı (ilk sayfayla yetinmedi)")

    # Geçmiş 200 ölçüm tek cihazdan, zaman sıralı
    k, g = istek(mod, '/de/cihaz/gecmis', token=jwt('m0@x', 'musteri', 'M000', 'MS0'), method='GET', sorgu={'cihaz_id': 'AKU-000'})
    es(len(g['olcumler']), 200, "200 ölçüm")
    ok("tek cihazdan 200 ölçüm sorunsuz okunur")

    # Müşteri yük altında da yalnız kendi cihazını görür
    k, g = istek(mod, '/de/cihaz/liste', token=jwt('m5@x', 'musteri', 'M005', 'MS5'), method='GET')
    es([c['cihaz_id'] for c in g['cihazlar']], ['AKU-005'], "yük altında izolasyon")
    ok("yük altında müşteri izolasyonu korunuyor")


if __name__ == '__main__':
    for test in (test_yetki, test_veri_akisi, test_hesap_entegrasyon, test_bildirim_ssrf, test_dayaniklilik, test_yuk):
        print(f"\n{test.__name__}")
        test()
    print(f"\nHEPSİ TAMAM ({len(GECEN)} kontrol)")
