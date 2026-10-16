// #10 — servis.js dönüştürücüleri (backend snake_case → sayfa camelCase).
// Saf dönüşüm; ağ yok. akuDetayUyarla iş-kritik (hücre V, min/max/ortalama).
import { describe, it, expect } from "vitest";
import { akuDetayUyarla, inverterDetayUyarla } from "../api/servis.js";

describe("akuDetayUyarla", () => {
  it("ölçüm yoksa veriYok=true, diziler boş", () => {
    const r = akuDetayUyarla({ kapasiteAh: 100 });
    expect(r.veriYok).toBe(true);
    expect(r.hucreler).toEqual([]);
    expect(r.toplamKapasiteAh).toBe(100);
  });

  it("hücre mV'leri V'ye çevrilir; en yüksek/düşük/ortalama doğru", () => {
    const r = akuDetayUyarla({ sonOlcum: { hucreler: [3300, 3400, 3200, 3300] } });
    expect(r.veriYok).toBe(false);
    expect(r.hucreler).toHaveLength(4);
    expect(r.hucreler[0].gerilim).toBeCloseTo(3.3, 3);
    expect(r.enYuksek.deger).toBeCloseTo(3.4, 3);
    expect(r.enDusuk.deger).toBeCloseTo(3.2, 3);
  });
});

describe("inverterDetayUyarla", () => {
  it("ölçüm yoksa tüm alanlar null (çökmez)", () => {
    const r = inverterDetayUyarla({});
    expect(r.igbt).toBeNull();
    expect(r.thd).toBeNull();
  });
  it("ölçüm alanlarını snake_case'ten eşler", () => {
    const r = inverterDetayUyarla({ sonOlcum: { igbt: 55, dc_gerilim: 400, thd: 2.1 } });
    expect(r.igbt).toBe(55);
    expect(r.dcV).toBe(400);
    expect(r.thd).toBe(2.1);
  });
});
