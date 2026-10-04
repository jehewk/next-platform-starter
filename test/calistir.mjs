#!/usr/bin/env node
/**
 * Tüm testleri sırayla çalıştırır. Uygulamaya dahil DEĞİLDİR.
 *
 *   node test/calistir.mjs           # hızlı testler (ayrıştırıcı + backend)
 *   node test/calistir.mjs --hepsi   # + uçtan uca tarayıcı testi (yavaş, Playwright ister)
 *
 * Her testin gerektirdiği araç yoksa (python3, Playwright) o test ATLANIR,
 * diğerleri yine çalışır; en sonda özet yazılır.
 */
import { spawnSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kok = join(dirname(fileURLToPath(import.meta.url)), "..");
const hepsi = process.argv.includes("--hepsi");

function varMi(komut) {
  try { execSync(`command -v ${komut}`, { stdio: "ignore" }); return true; } catch { return false; }
}

const python = ["python3", "python"].find(varMi);

const testler = [
  { ad: "Ayrıştırıcı (sohbet niyet çözümü)", komut: "node", arg: ["test/ayristirici.mjs"] },
  { ad: "Fizik motoru (bozulma + arıza kaynağı senaryoları)", komut: python, arg: ["test/backend/test_fizik.py"],
    atla: python ? null : "python3 bulunamadı" },
  { ad: "Backend (yetki, veri akışı, güvenlik, yük)", komut: python, arg: ["test/backend/test_backend.py"],
    atla: python ? null : "python3 bulunamadı" },
  { ad: "Uçtan uca (tarayıcı, sahte API)", komut: "node", arg: ["test/e2e.mjs"],
    atla: !hepsi ? "--hepsi verilmedi" : null },
];

const sonuclar = [];
for (const t of testler) {
  console.log(`\n\x1b[36m━━ ${t.ad} ━━\x1b[0m`);
  if (t.atla) { console.log(`  (atlandı: ${t.atla})`); sonuclar.push([t.ad, "atlandı"]); continue; }
  const r = spawnSync(t.komut, t.arg, { cwd: kok, stdio: "inherit" });
  sonuclar.push([t.ad, r.status === 0 ? "geçti" : "BAŞARISIZ"]);
}

console.log("\n\x1b[37m══════════════ ÖZET ══════════════\x1b[0m");
for (const [ad, durum] of sonuclar) {
  const renk = durum === "geçti" ? "32" : durum === "atlandı" ? "33" : "31";
  console.log(`  \x1b[${renk}m${durum.padEnd(9)}\x1b[0m ${ad}`);
}
const basarisiz = sonuclar.filter(([, d]) => d === "BAŞARISIZ").length;
process.exit(basarisiz ? 1 : 0);
