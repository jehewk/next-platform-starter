"""Canlı lambda_function.py'ye Dennis panellerinin ihtiyaç duyduğu yamaları uygular.

    python yamala.py <girdi/lambda_function.py> <cikti/lambda_function.py>

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

Sonuç Python derleyicisinden geçirilir; hata varsa hiçbir şey yazılmaz.
Girdi dosyasına asla dokunmaz.
"""
import builtins
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


def main():
    if len(sys.argv) != 3:
        dur("kullanım: python yamala.py <girdi> <cikti>", 1)
    kaynak = Path(sys.argv[1]).read_text(encoding="utf-8")

    kaynak, a = yama_guncelle(kaynak)
    kaynak, b = yama_kayit(kaynak)
    if not (a or b):
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
