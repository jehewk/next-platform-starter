import { Link } from "react-router-dom";
import { AlertTriangle, BatteryCharging, Cpu } from "lucide-react";
import { Rozet, SaglikCubugu } from "../bilesenler/Rozet";
import { Iskelet, SatirIskelet, HataKutusu } from "../bilesenler/VeriDurumu";
import Harita from "./Harita";
import { useVeri } from "../api/useVeri";
import { genelOzet, mudahaleKuyrugu, musteriListesi, cihazListesi } from "../api/servis";
import { saglikDurumu, sureMetni, sayi } from "../veri/yardimci";

/**
 * Genel İzleme.
 *
 * Önceki sürümde sistem özeti, harita, kuyruk ve müşteriler ayrı ayrı
 * kutular halinde dağınık duruyordu. Burada tek bir çerçeve altında,
 * ince ayırıcı çizgilerle bölünmüş TEK bir bütün olarak gösterilir —
 * "sistem" tek bakışta okunan tek bir yüzey olmalı, birbirinden kopuk
 * kart yığını değil.
 */
export default function GenelBakis() {
  const { veri: ozet, yukleniyor: ozetYukleniyor, hata: ozetHata, yenile: ozetYenile } =
    useVeri(genelOzet);
  const { veri: isler, yukleniyor: islerYukleniyor, hata: islerHata } =
    useVeri(mudahaleKuyrugu);
  const { veri: musteriler, yukleniyor: musteriYukleniyor, hata: musteriHata } =
    useVeri(musteriListesi);
  const { veri: cihazlar } = useVeri(cihazListesi);

  const mudahale = ozet ? ozet.arizali + ozet.uyarida : null;
  const anaHataVar = ozetHata || islerHata || musteriHata;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Genel İzleme</h1>
        <p className="mt-1 text-sm text-soluk">
          Üretilen tüm ürünlerin ve sahadaki sistemlerin anlık durumu.
        </p>
      </div>

      {anaHataVar ? (
        <HataKutusu hata={anaHataVar} yenile={ozetYenile} />
      ) : (
        <div className="divide-y divide-cizgi border border-cizgi bg-panel">
          {/* ── 1. sistem özeti ── */}
          {ozetYukleniyor ? (
            <div className="p-5"><Iskelet satir={1} yukseklik="h-16" /></div>
          ) : (
            <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center border
                             ${mudahale > 0 ? "border-kritik/25 bg-kritik/5" : "border-cizgi bg-panel2"}`}
                >
                  <AlertTriangle
                    size={22} strokeWidth={1.75}
                    className={mudahale > 0 ? "text-kritik" : "text-sonuk"}
                  />
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-4xl font-semibold tabular-nums leading-none
                                      ${mudahale > 0 ? "text-kritik" : "text-metin"}`}>
                      {mudahale}
                    </span>
                    <span className="text-sm text-soluk">sistem müdahale bekliyor</span>
                  </div>
                  <p className="mt-1 text-xs text-sonuk">
                    {ozet.arizali} arızalı · {ozet.uyarida} izlemede · toplam {ozet.toplam} üründen
                  </p>
                </div>
              </div>

              <div className="flex gap-6 border-t border-cizgi pt-4 text-sm sm:border-t-0 sm:border-l sm:pl-6 sm:pt-0">
                <div>
                  <div className="text-xs text-sonuk">Sahada</div>
                  <div className="mt-0.5 font-medium tabular-nums">{ozet.sahada}</div>
                </div>
                <div>
                  <div className="text-xs text-sonuk">Depoda</div>
                  <div className="mt-0.5 font-medium tabular-nums">{ozet.depoda}</div>
                </div>
                <div>
                  <div className="text-xs text-sonuk">Aktif ürün</div>
                  <div className="mt-0.5 font-medium tabular-nums">
                    {ozet.aku} <span className="text-xs font-normal text-sonuk">akü</span>{" "}
                    {ozet.inverter} <span className="text-xs font-normal text-sonuk">inverter</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── 2. harita + müdahale kuyruğu ── */}
          <div className="grid divide-cizgi lg:grid-cols-[1fr_380px] lg:divide-x">
            <div>
              <div className="flex items-center justify-between border-b border-cizgi px-5 py-2.5">
                <h2 className="text-xs font-medium text-sonuk">Saha Haritası</h2>
                <Link to="/harita" className="text-xs text-soluk hover:text-metin">tam ekran →</Link>
              </div>
              <div className="h-[360px]"><Harita gomulu yukseklik="100%" /></div>
            </div>

            <div className="border-t border-cizgi lg:border-t-0">
              <div className="flex items-center justify-between border-b border-cizgi px-5 py-2.5">
                <h2 className="text-xs font-medium text-sonuk">Müdahale Kuyruğu</h2>
                {!islerYukleniyor && <span className="text-xs text-soluk">{isler?.length ?? 0} iş</span>}
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {islerYukleniyor ? (
                  <div className="p-4"><SatirIskelet satir={3} /></div>
                ) : isler.length === 0 ? (
                  <div className="px-5 py-14 text-center"><p className="text-sm text-soluk">Bekleyen müdahale yok.</p></div>
                ) : (
                  isler.map((is, i) => {
                    const d = saglikDurumu(is.saglik);
                    const yazi = { saglikli: "text-saglikli", uyari: "text-uyari", kritik: "text-kritik" }[d];
                    const yol = is.tip === "aku" ? `/aku/${is.id}` : `/inverter/${is.id}`;
                    return (
                      <Link key={is.id} to={yol}
                        className="block border-b border-cizgi px-4 py-3 transition-colors last:border-b-0 hover:bg-panel2">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 w-5 shrink-0 text-xs text-sonuk">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <span className="font-mono text-xs">{is.id}</span>
                              <span className="text-xs text-soluk">{is.musteriAd}</span>
                            </div>
                            <p className={`mt-1 text-xs font-medium ${yazi}`}>{is.bilesen}</p>
                            {is.kalanSaat != null && (
                              <p className={`mt-1.5 text-xs ${yazi}`}>{sureMetni(is.kalanSaat)} kaldı</p>
                            )}
                          </div>
                          <span className={`shrink-0 text-lg font-semibold tabular-nums ${yazi}`}>
                            {is.saglik}
                          </span>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ── 3. müşteriler ── */}
          <div>
            <div className="flex items-center justify-between px-5 py-2.5">
              <h2 className="text-xs font-medium text-sonuk">Müşteriler</h2>
              <Link to="/musteriler" className="text-xs text-soluk hover:text-metin">tümü →</Link>
            </div>
            {musteriYukleniyor ? (
              <div className="p-4 pt-0"><SatirIskelet satir={4} /></div>
            ) : (
              <div className="grid gap-px border-t border-cizgi bg-cizgi sm:grid-cols-2 xl:grid-cols-3">
                {musteriler.slice(0, 6).map((m) => {
                  const cm = (cihazlar || []).filter((c) => c.musteriId === m.id);
                  const sorunlu = cm.filter((c) => ["arizali", "uyari"].includes(c.durum)).length;
                  const ort = cm.length
                    ? Math.round(cm.reduce((t, c) => t + (c.saglik || 0), 0) / cm.length) : null;
                  const d = saglikDurumu(ort);
                  return (
                    <Link key={m.id} to={`/musteri/${m.id}`}
                      className="bg-panel p-4 transition-colors hover:bg-panel2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-medium">{m.ad}</h3>
                          <p className="mt-0.5 text-xs text-sonuk">{m.ilce}, {m.il} · {m.tip}</p>
                        </div>
                        <Rozet durum={d} cocuk={sorunlu ? `${sorunlu} SORUN` : "NORMAL"} />
                      </div>
                      {ort != null ? (
                        <>
                          <div className="mt-3 flex items-baseline gap-2">
                            <span className="text-xl font-semibold tabular-nums leading-none">{ort}</span>
                            <span className="text-xs text-sonuk">sistem sağlığı</span>
                          </div>
                          <div className="mt-2"><SaglikCubugu deger={ort} durum={d} /></div>
                        </>
                      ) : (
                        <p className="mt-3 text-xs text-sonuk">Henüz ölçüm yok</p>
                      )}
                      <div className="mt-3 flex gap-4 text-xs text-sonuk">
                        <span className="flex items-center gap-1.5">
                          <BatteryCharging size={13} strokeWidth={1.75} />
                          {cm.filter((c) => c.tip === "aku").length} akü
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Cpu size={13} strokeWidth={1.75} />
                          {cm.filter((c) => c.tip === "inverter").length} inverter
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
