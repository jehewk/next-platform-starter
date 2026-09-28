# ─────────────────────────────────────────────────────────────────────────
#  EK: POST /de/musteri/guncelle — üretici panelindeki "Müşteriyi düzenle"
#
#  lambda_function.py'ye iki yere eklenir:
#
#  1) ROL_IZIN sözlüğüne (DEVIR §3):
#         '/de/musteri/guncelle': ['uretici', 'admin'],
#
#  2) Yönlendiricide, '/de/musteri/olustur' bloğunun hemen altına
#     aşağıdaki blok (girinti: diğer `if path == ...` bloklarıyla aynı).
#
#  Yalnızca izinli alanlar değişir; musteri_id, kayit_durumu, olusturma
#  gibi alanlara dokunulmaz. Koordinat boş gönderilirse silinir (harita
#  koordinatsız müşteriyi zaten göstermez — DEVIR §13.3).
# ─────────────────────────────────────────────────────────────────────────

    if path == '/de/musteri/guncelle' and method == 'POST':
        musteri_id = str(body.get('musteri_id', '')).strip()
        if not musteri_id:
            return response(400, {'hata': 'musteri_id gerekli'})

        tablo = dynamodb.Table(DE_MUSTERI)
        mevcut = tablo.get_item(Key={'musteri_id': musteri_id}).get('Item')
        if not mevcut:
            return response(404, {'hata': 'Musteri bulunamadi'})

        METIN = ('ad', 'tip', 'il', 'ilce', 'adres', 'telefon', 'email')
        ayarla, sil, degerler, adlar = [], [], {}, {}
        for alan in METIN:
            if alan in body:
                deger = str(body[alan] or '').strip()
                if alan == 'ad' and not deger:
                    return response(400, {'hata': 'Ad bos olamaz'})
                if alan == 'email':
                    deger = deger.lower()
                ayarla.append(f'#{alan} = :{alan}')
                adlar[f'#{alan}'] = alan
                degerler[f':{alan}'] = deger

        for alan, alt, ust in (('lat', -90, 90), ('lng', -180, 180)):
            if alan not in body:
                continue
            ham = body[alan]
            if ham is None or ham == '':
                sil.append(f'#{alan}')
                adlar[f'#{alan}'] = alan
                continue
            try:
                sayi = Decimal(str(ham))
            except Exception:
                return response(400, {'hata': f'{alan} sayi olmali'})
            if not (alt <= sayi <= ust):
                return response(400, {'hata': f'{alan} aralik disi'})
            ayarla.append(f'#{alan} = :{alan}')
            adlar[f'#{alan}'] = alan
            degerler[f':{alan}'] = sayi

        if not ayarla and not sil:
            return response(400, {'hata': 'Degisecek alan yok'})

        ifade = ''
        if ayarla:
            ifade += 'SET ' + ', '.join(ayarla)
        if sil:
            ifade += (' ' if ifade else '') + 'REMOVE ' + ', '.join(sil)
        arg = {'Key': {'musteri_id': musteri_id}, 'UpdateExpression': ifade,
               'ExpressionAttributeNames': adlar}
        if degerler:
            arg['ExpressionAttributeValues'] = degerler
        tablo.update_item(**arg)
        return response(200, {'ok': True, 'musteri_id': musteri_id})
