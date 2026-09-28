"""lambda_function.py'ye /de/musteri/guncelle ucunu ekler.

    python yamala.py <girdi/lambda_function.py> <cikti/lambda_function.py>

Çıkış kodları:
    0  yama uygulandı (çıktı yazıldı)
    3  uç zaten var — değişiklik gerekmiyor (çıktı yazılmaz)
    4  dosya beklenen yapıda değil — HİÇBİR ŞEY yazılmaz
    1  beklenmeyen hata — HİÇBİR ŞEY yazılmaz

Ne yapar:
  · ROL_IZIN sözlüğüne, '/de/musteri/olustur' ile AYNI rollerle
    '/de/musteri/guncelle' girişi ekler (olustur yoksa ['uretici', 'admin']).
  · musteri_guncelle.py'deki işleyici bloğunu, '/de/musteri/olustur'
    bloğunun hemen ÖNÜNE, aynı girintiyle ekler.
  · Sonucu Python derleyicisinden geçirir; hata varsa yazmaz.
Girdi dosyasına asla dokunmaz.
"""
import re
import sys
from pathlib import Path

EK = Path(__file__).with_name("musteri_guncelle.py")
YOL = "/de/musteri/guncelle"


def dur(mesaj, kod=4):
    print(f"YAMA: {mesaj}")
    sys.exit(kod)


def main():
    if len(sys.argv) != 3:
        dur("kullanım: python yamala.py <girdi> <cikti>", 1)
    kaynak = Path(sys.argv[1]).read_text(encoding="utf-8")

    if re.search(r"""if\s+path\s*==\s*['"]%s['"]""" % re.escape(YOL), kaynak):
        dur("uç zaten var, yama gerekmiyor.", 3)

    for gerekli in ("DE_MUSTERI", "Decimal", "def response", "dynamodb"):
        if gerekli not in kaynak:
            dur(f"'{gerekli}' bulunamadı; dosya beklenen yapıda değil, yama uygulanmadı.")

    # ── işleyici bloğu ──────────────────────────────────────────────────
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

    # ── rol izni ────────────────────────────────────────────────────────
    rol = re.search(r"""^([ \t]*)['"]/de/musteri/olustur['"]\s*:\s*(\[[^\]]*\])\s*,?[^\n]*$""", kaynak, re.M)
    sozluk = re.search(r"^ROL_IZIN\s*=\s*\{[ \t]*$", kaynak, re.M)
    if rol:
        satir = f"{rol.group(1)}'{YOL}': {rol.group(2)},\n"
        yer = kaynak.index("\n", rol.end()) + 1
        kaynak = kaynak[:yer] + satir + kaynak[yer:]
        print(f"YAMA: rol izni eklendi (olustur ile aynı): {rol.group(2)}")
    elif sozluk:
        sonraki = re.search(r"^([ \t]+)\S", kaynak[sozluk.end() + 1:], re.M)
        g = sonraki.group(1) if sonraki else "    "
        yer = sozluk.end() + 1
        kaynak = kaynak[:yer] + f"{g}'{YOL}': ['uretici', 'admin'],\n" + kaynak[yer:]
        print("YAMA: rol izni eklendi: ['uretici', 'admin']")
    else:
        print("YAMA: UYARI — ROL_IZIN sözlüğü bulunamadı; rol kontrolü eklenmedi.")

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
