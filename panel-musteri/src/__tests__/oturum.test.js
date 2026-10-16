// #7 — oturum.js: giriş token'ları saklar, tokenYenile erişimi tazeler.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/istemci.js", () => ({ acikPost: vi.fn() }));
import { acikPost } from "../api/istemci.js";
import { girisYap, oturumOku, oturumSil, tokenYenile } from "../api/oturum.js";

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("oturum", () => {
  it("girisYap token'ları sessionStorage'a yazar", async () => {
    acikPost.mockResolvedValue({ erisim: "E1", yenile: "Y1", eposta: "a@b.com" });
    await girisYap("a@b.com", "parola", "ktoken", "kcevap");
    const o = oturumOku();
    expect(o.erisim).toBe("E1");
    expect(o.yenile).toBe("Y1");
    expect(o.eposta).toBe("a@b.com");
  });

  it("tokenYenile erişim token'ını tazeler, yenileme token'ını korur", async () => {
    sessionStorage.setItem("de_oturum", JSON.stringify({ erisim: "ESKI", yenile: "Y1", eposta: "a@b.com" }));
    acikPost.mockResolvedValue({ erisim: "YENI" });
    await tokenYenile();
    const o = oturumOku();
    expect(o.erisim).toBe("YENI");
    expect(o.yenile).toBe("Y1");
  });

  it("oturum yokken tokenYenile hata verir", async () => {
    await expect(tokenYenile()).rejects.toThrow();
  });

  it("oturumSil oturumu temizler", () => {
    sessionStorage.setItem("de_oturum", JSON.stringify({ erisim: "E" }));
    oturumSil();
    expect(oturumOku()).toBeNull();
  });

  it("bozuk sessionStorage içeriği null döner (çökmez)", () => {
    sessionStorage.setItem("de_oturum", "{bozuk json");
    expect(oturumOku()).toBeNull();
  });
});
