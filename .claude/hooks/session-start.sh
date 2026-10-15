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
for t in test_fizik test_backend test_guvenlik dogruluk dogruluk_zor tersine; do
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

if [ "$basarisiz" -eq 0 ]; then
  echo "Tüm test katmanları geçti (doğruluk + zor + tersine + birim/güvenlik)."
else
  echo "UYARI: bazı test katmanları başarısız — yukarıya bak."
fi
exit 0
