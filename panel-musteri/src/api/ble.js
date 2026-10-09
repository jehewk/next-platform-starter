// Cihaz kurulumu için BLE yardımcısı (Capacitor native + web Bluetooth).
//
// Firmware (firmware/esp32-saha) ile sözleşme:
//   servis  6e400001-...   yaz 6e400002-... (telefon->cihaz)  bildir 6e400003-... (cihaz->telefon)
//   Yaz   : {"ssid","sifre","kod"} (UTF-8 JSON)
//   Bildir: {"durum":"baglaniyor|wifi|kayit|tamam|hata","mesaj":"..."}
//
// @capacitor-community/bluetooth-le hem native (iOS/Android) hem web'de
// (Android Chrome — Web Bluetooth) çalışır. iOS Safari (PWA) Web Bluetooth
// desteklemez; mağaza (native) sürümünde sorun olmaz.

import { BleClient, textToDataView, dataViewToText } from "@capacitor-community/bluetooth-le";

export const BLE_SERVIS = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const YAZ = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const BILDIR = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

/** Cihazı bulur ve bağlanır. Döner: deviceId. Kullanıcı BLE seçicisinden cihazı seçer. */
export async function cihazaBaglan(kopunca) {
  await BleClient.initialize({ androidNeverForLocation: true });
  const cihaz = await BleClient.requestDevice({
    services: [BLE_SERVIS],
    optionalServices: [BLE_SERVIS],
    namePrefix: "Dennis",
  });
  await BleClient.connect(cihaz.deviceId, (id) => { if (kopunca) kopunca(id); });
  return cihaz.deviceId;
}

/** Cihazın bildirdiği durum JSON'larını cb'ye iletir. */
export async function durumDinle(deviceId, cb) {
  await BleClient.startNotifications(deviceId, BLE_SERVIS, BILDIR, (v) => {
    try { cb(JSON.parse(dataViewToText(v))); } catch { /* bozuk paket yok say */ }
  });
}

/** WiFi bilgisi + eşleşme kodunu cihaza yazar. */
export async function bilgiGonder(deviceId, ssid, sifre, kod) {
  const json = JSON.stringify({ ssid, sifre, kod });
  await BleClient.write(deviceId, BLE_SERVIS, YAZ, textToDataView(json));
}

/** Cihazdan çevredeki 2.4 GHz ağ listesini ister (yanıt durumDinle'den "ag"/"aglar_son" gelir). */
export async function aglariTara(deviceId) {
  await BleClient.write(deviceId, BLE_SERVIS, YAZ, textToDataView(JSON.stringify({ komut: "tara" })));
}

export async function baglantiyiKapat(deviceId) {
  try { await BleClient.stopNotifications(deviceId, BLE_SERVIS, BILDIR); } catch { /* yok say */ }
  try { await BleClient.disconnect(deviceId); } catch { /* yok say */ }
}

/** Bu platform BLE destekliyor mu (iOS Safari/PWA desteklemez)? */
export function bleDestekli() {
  if (typeof window === "undefined") return false;
  if (window.Capacitor?.isNativePlatform?.()) return true;      // native uygulama
  return typeof navigator !== "undefined" && !!navigator.bluetooth; // Android Chrome
}
