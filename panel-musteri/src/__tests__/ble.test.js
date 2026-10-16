// #3 — ble.js: cihaz kurulumu BLE sözleşmesi. Capacitor paketi mock'lanır;
// firmware ile anlaşılan JSON şekli ({ssid,sifre,kod} / {komut:"tara"}) ve
// bildirim JSON çözümü doğrulanır. (Gerçek donanım akışı e2e/sahada test edilir.)
import { describe, it, expect, vi, beforeEach } from "vitest";

const yazilanlar = [];
let bildirimHandler = null;

vi.mock("@capacitor-community/bluetooth-le", () => ({
  BleClient: {
    initialize: vi.fn(async () => {}),
    requestDevice: vi.fn(async () => ({ deviceId: "DEV-1", name: "Dennis AKU-1" })),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    write: vi.fn(async (_id, _s, _c, dv) => { yazilanlar.push(dv._t); }),
    startNotifications: vi.fn(async (_id, _s, _c, cb) => { bildirimHandler = cb; }),
    stopNotifications: vi.fn(async () => {}),
  },
  textToDataView: (s) => ({ _t: s }),
  dataViewToText: (v) => v._t,
}));

import {
  cihazaBaglan, bilgiGonder, aglariTara, durumDinle, baglantiyiKapat, bleDestekli,
} from "../api/ble.js";

beforeEach(() => { yazilanlar.length = 0; bildirimHandler = null; vi.clearAllMocks(); });

describe("ble.js BLE sözleşmesi", () => {
  it("cihazaBaglan deviceId döner", async () => {
    const id = await cihazaBaglan();
    expect(id).toBe("DEV-1");
  });

  it("bilgiGonder {ssid,sifre,kod} JSON yazar", async () => {
    await bilgiGonder("DEV-1", "EvAgi", "parola123", "AKU-1");
    expect(yazilanlar).toHaveLength(1);
    const j = JSON.parse(yazilanlar[0]);
    expect(j).toEqual({ ssid: "EvAgi", sifre: "parola123", kod: "AKU-1" });
  });

  it("aglariTara {komut:'tara'} yazar", async () => {
    await aglariTara("DEV-1");
    expect(JSON.parse(yazilanlar[0])).toEqual({ komut: "tara" });
  });

  it("durumDinle geçerli JSON'u cb'ye iletir, bozuk paketi yok sayar", async () => {
    const alinan = [];
    await durumDinle("DEV-1", (d) => alinan.push(d));
    bildirimHandler({ _t: '{"durum":"tamam","mesaj":"ok"}' });
    bildirimHandler({ _t: "bozuk-json{" });   // çökmemeli, yok sayılmalı
    expect(alinan).toHaveLength(1);
    expect(alinan[0].durum).toBe("tamam");
  });

  it("baglantiyiKapat hata atmaz (stop/disconnect sarılı)", async () => {
    await expect(baglantiyiKapat("DEV-1")).resolves.toBeUndefined();
  });

  it("bleDestekli: navigator.bluetooth yoksa false", () => {
    const eski = globalThis.navigator;
    // jsdom navigator'ında bluetooth yok → false beklenir
    expect(bleDestekli()).toBe(false);
    globalThis.navigator = eski;
  });
});
