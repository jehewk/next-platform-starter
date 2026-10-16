"""Saldırgan güvenlik test bataryası — yamala'lı mock backend'e karşı.

Amaç: sistemi övmek değil, HATA ÇIKARMAK. Yetki aşımı (IDOR), JWT/kimlik
kurcalama, bozuk/dev gövde, enjeksiyon, cihaz anahtarı baypası gibi
saldırıları dener. Kıran bir kontrol = gerçek açık.

Çalıştır:  python3 test_guvenlik.py
"""
import test_backend as T
from test_backend import es, ok, istek, yukle, tohum, MUS, URE


def test_bozuk_govde():
    """Bozuk / tip-karışık gövde 400 dönmeli, asla 500/çökme olmamalı."""
    mod, dyn, cog, _ = yukle(); tohum(dyn, cog)
    for ham in ('{bozuk json', '[]', '"sadece metin"', '123', 'null', 'true', ''):
        k, _ = istek(mod, '/de/giris', ham=ham)   # CIHAZ_ENDPOINT: kimlik istemez
        assert k in (400, 401), f"bozuk gövde '{ham[:12]}' -> {k} (400 beklenir, 500 OLMAZ)"
    ok("bozuk/tip-karışık gövde güvenli reddediliyor (500 yok)")


def test_idor_cihaz():
    """Müşteri, BAŞKA müşterinin cihazına hiçbir uçtan erişememeli."""
    mod, dyn, cog, _ = yukle(); tohum(dyn, cog)
    # AKU-2 -> MST-2'nin; MUS = MST-1
    for yol in ('/de/cihaz/detay', '/de/cihaz/gecmis'):
        k, _ = istek(mod, yol, token=MUS, method='GET', sorgu={'cihaz_id': 'AKU-2'})
        es(k, 404, f"IDOR: {yol} başka cihaz")
    # Depodaki (müşterisiz) cihaz da görünmemeli
    es(istek(mod, '/de/cihaz/detay', token=MUS, method='GET', sorgu={'cihaz_id': 'AKU-9'})[0], 404, "depodaki cihaz")
    ok("IDOR: müşteri başkasının/depodaki cihazına erişemiyor")


def test_cihaz_id_enjeksiyon():
    """cihaz_id'de garip/enjeksiyon karakterleri çökertmemeli (boto3 parametreli)."""
    mod, dyn, cog, _ = yukle(); tohum(dyn, cog)
    for cid in ("AKU-1' OR '1'='1", 'AKU-1"; DROP', '../../etc', '\x00\x01', 'A' * 5000):
        k, _ = istek(mod, '/de/cihaz/detay', token=URE, method='GET', sorgu={'cihaz_id': cid})
        assert k in (200, 404), f"enjeksiyon cihaz_id -> {k} (404/200 beklenir, 500 OLMAZ)"
    ok("cihaz_id enjeksiyon denemeleri güvenli (çökme yok)")


def test_cihaz_anahtar_baypas():
    """Cihaz ölçümü yalnız doğru anahtarla yazılır; yanlış/boş/eksik -> 403, kayıt yok."""
    mod, dyn, cog, tablolar = yukle(); tohum(dyn, cog)
    AKU = tablolar['dennis-aku-verileri']
    once = len(AKU.scan().get('Items', []))
    for gov in ({'cihaz_id': 'AKU-1', 'anahtar': 'YANLIS'},
                {'cihaz_id': 'AKU-1'},
                {'cihaz_id': 'AKU-1', 'anahtar': ''},
                {'cihaz_id': 'YOK', 'anahtar': 'GIZLI-1'},
                {'anahtar': 'GIZLI-1'}):
        es(istek(mod, '/de/aku/veri', gov)[0], 403, f"anahtar baypas {gov}")
    es(len(AKU.scan().get('Items', [])), once, "yetkisiz denemede kayıt yazılmamalı")
    ok("cihaz anahtarı baypası engelleniyor, yetkisiz kayıt yazılmıyor")


def test_kurulum_kod_spoof():
    """IDOR: müşteri, gövdeye BAŞKA musteri_id yazarak onun adına eşleşme kodu
    ÜRETEMEMELI. Kod, OTURUM SAHİBİNİN kimliğine bağlanmalı."""
    mod, dyn, cog, tablolar = yukle(); tohum(dyn, cog)
    E = tablolar['dennis-eslesmeler']
    # MUS = MST-1; saldırgan gövdeye MST-2 yazıyor
    k, g = istek(mod, '/de/kurulum/basla', {'musteri_id': 'MST-2'}, token=MUS)
    es(k, 200, g)
    kayit = E.get_item(Key={'kod': g['eslesme_kodu']})['Item']
    es(kayit['musteri_id'], 'MST-1', "SPOOF: kod başka müşteriye (MST-2) bağlandı!")
    ok("kurulum/basla: kod yalnız oturum sahibine bağlanıyor (gövde spoof'u etkisiz)")


def test_asiri_yuk_govde():
    """Aşırı büyük gövde (çok hücre) çökertmemeli / 500 vermemeli."""
    mod, dyn, cog, _ = yukle(); tohum(dyn, cog)
    dev = {'cihaz_id': 'AKU-1', 'anahtar': 'GIZLI-1', 'hucreler': [3300] * 20000}
    k, _ = istek(mod, '/de/aku/veri', dev)
    assert k in (200, 400, 413), f"aşırı gövde -> {k} (işlenebilmeli, 500 OLMAZ)"
    ok("aşırı büyük gövde güvenli işleniyor (çökme yok)")


if __name__ == '__main__':
    for test in (test_bozuk_govde, test_idor_cihaz, test_cihaz_id_enjeksiyon,
                 test_cihaz_anahtar_baypas, test_kurulum_kod_spoof, test_asiri_yuk_govde):
        print(f"\n{test.__name__}")
        test()
    print(f"\nHEPSİ TAMAM ({len(T.GECEN)} kontrol)")
