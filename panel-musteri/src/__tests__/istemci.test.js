// #7 (çekirdek) — istemci.js 401 akışı: token süresi dolunca sessizce yenile+
// tekrar dene; yenileme de başarısızsa oturumu kapat ve "tekrar giriş" hatası.
// Bu akış bozulursa kullanıcı ya durduk yere atılır ya da süresi dolmuş oturumla kalır.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/oturum.js", () => ({
  oturumOku: vi.fn(() => ({ erisim: "E", yenile: "Y" })),
  tokenYenile: vi.fn(),
  oturumSil: vi.fn(),
}));
import { oturumOku, tokenYenile, oturumSil } from "../api/oturum.js";
import { api, ApiHatasi } from "../api/istemci.js";

function yanit(status, govde) {
  return { status, ok: status >= 200 && status < 300, json: async () => govde };
}

beforeEach(() => vi.clearAllMocks());

describe("istemci 401 yenileme akışı", () => {
  it("401 → tokenYenile → tekrar dene başarılı", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(yanit(401, {}))
      .mockResolvedValueOnce(yanit(200, { veri: 42 }));
    tokenYenile.mockResolvedValue();
    const r = await api.get("/x");
    expect(r.veri).toBe(42);
    expect(tokenYenile).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(oturumSil).not.toHaveBeenCalled();
  });

  it("401 + yenileme başarısız → oturumSil + 401 hatası", async () => {
    global.fetch = vi.fn().mockResolvedValue(yanit(401, {}));
    tokenYenile.mockRejectedValue(new Error("yenilenemedi"));
    await expect(api.get("/x")).rejects.toMatchObject({ durum: 401 });
    expect(oturumSil).toHaveBeenCalledTimes(1);
  });

  it("oturum yoksa istek gönderilmez (401)", async () => {
    oturumOku.mockReturnValueOnce(null);
    global.fetch = vi.fn();
    await expect(api.get("/x")).rejects.toBeInstanceOf(ApiHatasi);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("ağ hatası → durum 0 (bağlantı mesajı)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("network"));
    await expect(api.get("/x")).rejects.toMatchObject({ durum: 0 });
  });
});
