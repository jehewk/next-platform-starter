"""Dennis Energy fizik motoru paketi.

fizik  — akü/inverter bozulma mekanizmaları (saf fizik, model yok)
kaynak — arıza kaynağı sınıflandırması (garanti kararı için kanıt)

Bu paket, canlı lambda_function.py içine gömülü motorun sürümlenmiş kaynağıdır.
Buradaki her değişiklik canlı koda taşınmalı; testler ikisini senkron tutar.
"""
from . import fizik
from . import kaynak

__all__ = ["fizik", "kaynak"]
