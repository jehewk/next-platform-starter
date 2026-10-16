#!/bin/bash
# Dennis Energy — oturum başı fizik motoru test geçidi.
# Testler saf Python (stdlib, numpy yok) → kurulum gerekmez, sadece koşulur.
# Oturumu ASLA bloke etmez (exit 0); sonucu görünür kılar.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}"
PY="$(command -v python3 || command -v python || true)"

if [ -z "$PY" ]; then
  echo "Dennis test geçidi: python3 bulunamadı, atlandı."
  exit 0
fi

export PYTHONDONTWRITEBYTECODE=1

echo "Dennis fizik motoru test katmanları:"
basarisiz=0
for t in test_fizik test_backend test_guvenlik test_bildirim test_asistan dogruluk dogruluk_zor tersine; do
  dosya="test/backend/$t.py"
  [ -f "$dosya" ] || continue
  cikti="$("$PY" "$dosya" 2>&1)"
  if [ $? -eq 0 ]; then
    ozet="$(printf '%s\n' "$cikti" | grep -E 'test geçti|HEPSİ TAMAM|GENEL|değişmez ihlali yok|davranışlar doğru' | tail -1)"
    echo "  ✓ $t  ${ozet:-ok}"
  else
    echo "  ✗ $t BAŞARISIZ:"
    printf '%s\n' "$cikti" | tail -6 | sed 's/^/      /'
    basarisiz=1
  fi
done

# Frontend saf-mantık testleri (düz Node .mjs; runner/kurulum gerekmez)
NODE="$(command -v node || true)"
if [ -n "$NODE" ]; then
  for m in test/ayristirici.mjs test/frontend-birim.mjs; do
    [ -f "$m" ] || continue
    cikti="$("$NODE" "$m" 2>&1)"
    if [ $? -eq 0 ]; then
      ozet="$(printf '%s\n' "$cikti" | grep -E 'geçti|başarısız' | tail -1)"
      echo "  ✓ $(basename "$m")  ${ozet:-ok}"
    else
      echo "  ✗ $(basename "$m") BAŞARISIZ:"
      printf '%s\n' "$cikti" | tail -6 | sed 's/^/      /'
      basarisiz=1
    fi
  done
fi

# panel-musteri vitest (yalnız bağımlılık kuruluysa; taze container'da atlanır)
if [ -n "$NODE" ] && [ -x panel-musteri/node_modules/.bin/vitest ]; then
  cikti="$(cd panel-musteri && node_modules/.bin/vitest run 2>&1)"
  if [ $? -eq 0 ]; then
    echo "  ✓ panel-musteri vitest  $(printf '%s\n' "$cikti" | grep -E 'Tests ' | tail -1 | tr -s ' ')"
  else
    echo "  ✗ panel-musteri vitest BAŞARISIZ:"
    printf '%s\n' "$cikti" | tail -8 | sed 's/^/      /'
    basarisiz=1
  fi
fi

if [ "$basarisiz" -eq 0 ]; then
  echo "Tüm test katmanları geçti (fizik + backend + frontend)."
else
  echo "UYARI: bazı test katmanları başarısız — yukarıya bak."
fi
exit 0
