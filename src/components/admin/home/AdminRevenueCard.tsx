"use client";

import { useState } from "react";
import Link from "next/link";
import { Wallet as WalletIcon, CakeSlice, Camera, TrendingUp, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RevenueSummary } from "@/lib/actions/admin-home.actions";
import type { YeoboRevenue } from "@/lib/actions/admin-home-yeobo.actions";
import type { CashBalanceRow } from "@/lib/actions/admin-home-cash.actions";

/**
 * Kartu Omzet di Home admin: Haengbocake (POS + cake) dan Yeobo Space
 * per cabang, masing-masing hari ini & bulan ini dengan ▲▼ % vs bulan lalu
 * pada rentang tanggal yang sama (s.d. kemarin).
 *
 * LAYOUT: ≥sm tabel 3 kolom (label | hari ini | bulan ini). Di ponsel tiap
 * baris jadi blok — label di atas, dua angka berdampingan di bawahnya
 * dengan caption kecil — supaya "Rp 33.821.000 ▲13,9%" tidak terpotong.
 *
 * MODE "Bulan ini" — default PROYEKSI (run-rate), klik untuk lihat AKTUAL:
 * proyeksi (pace hari berjalan × jumlah hari sebulan) menjawab "perlu
 * ambil keputusan promo sekarang atau tidak", angka aktual menjawab
 * "apakah campaign kemarin berhasil". Keduanya butuh angka beda, jadi
 * kartu ini menampilkan satu tapi tetap 1 klik ke yang lain — bukan
 * dua widget terpisah. Visual cue (garis putus-putus, badge EST./AKTUAL,
 * warna redup vs solid) supaya orang tidak salah baca proyeksi sebagai
 * fakta.
 */

const formatRp = (n: number) =>
  "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n));

/** Hari & jumlah hari bulan berjalan, zona Jakarta (bukan clock klien). */
function jakartaMonthProgress(): { day: number; daysInMonth: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return { day: d, daysInMonth: new Date(y, m, 0).getDate() };
}

/** Proyeksi akhir bulan dari pace hari berjalan. */
function runRateProjection(monthToDate: number, day: number, daysInMonth: number): number {
  return (monthToDate / day) * daysInMonth;
}

interface MonthDelta {
  pct: number;
  title: string;
}

/**
 * `curThroughYesterday` = total bulan ini dikurangi hari ini (hari ini belum
 * lengkap, jadi dikeluarkan dari kedua sisi). null bila tidak ada pembanding
 * atau bulan lalu 0 (persen tak terdefinisi).
 */
function monthDelta(
  curThroughYesterday: number,
  prev: number | null | undefined,
  prevLabel: string | null | undefined
): MonthDelta | null {
  if (prev == null || !prevLabel || prev <= 0) return null;
  return {
    pct: ((curThroughYesterday - prev) / prev) * 100,
    title: `Dibanding ${prevLabel} (rentang tanggal yang sama, s.d. kemarin): ${formatRp(
      prev
    )} → ${formatRp(curThroughYesterday)}`,
  };
}

/**
 * Delta buat mode PROYEKSI — basisnya beda dari `monthDelta` di atas:
 * proyeksi (angka penuh, diekstrapolasi) dibandingkan ke bulan lalu PENUH
 * (bukan rentang tanggal sama s.d. kemarin), karena membandingkan proyeksi
 * penuh ke angka partial itu bukan apple-to-apple — akan selalu keliatan
 * "menang besar" walau padahal cuma efek proyeksi vs data separuh bulan.
 */
function monthDeltaProjected(
  projectedTotal: number,
  prevFull: number | null | undefined,
  prevFullLabel: string | null | undefined
): MonthDelta | null {
  if (prevFull == null || !prevFullLabel || prevFull <= 0) return null;
  return {
    pct: ((projectedTotal - prevFull) / prevFull) * 100,
    title: `Proyeksi vs ${prevFullLabel} (bulan lalu penuh): ${formatRp(
      prevFull
    )} → ~${formatRp(projectedTotal)}`,
  };
}

function DeltaPill({ d }: { d: MonthDelta }) {
  const up = d.pct >= 0;
  const rounded = Math.abs(d.pct) < 0.05 ? 0 : d.pct;
  const txt = new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "always",
  }).format(rounded);
  return (
    <span
      title={d.title}
      className={cn(
        "mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums sm:ml-1.5 sm:mt-0 sm:align-middle",
        up ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
      )}
    >
      {up ? "▲" : "▼"} {txt}%
    </span>
  );
}

function RevenueRow({
  icon,
  label,
  day,
  month,
  projected,
  canToggle,
  delta,
  href,
  onToggleMonth,
}: {
  icon: React.ReactNode;
  label: string;
  day: number;
  /** Angka yang SUDAH dipilih sesuai mode (proyeksi atau aktual) — lihat
   *  `runRateProjection` di pemanggil. */
  month: number;
  /** True = `month` adalah proyeksi run-rate, bukan angka final. */
  projected: boolean;
  /** False di tanggal 1 (data 1 hari belum cukup buat pace) — tombol
   *  toggle di-nonaktifkan supaya tidak terlihat "tidak ngefek". */
  canToggle: boolean;
  delta?: MonthDelta | null;
  /** Bila diisi, label jadi tautan (mis. ke layar POS cabang). */
  href?: string;
  onToggleMonth: () => void;
}) {
  return (
    <>
      <span className="col-span-2 sm:col-span-1 mt-2.5 sm:mt-0 flex items-center gap-2 min-w-0 text-[13px] font-medium text-foreground">
        <span className="grid place-items-center size-[22px] rounded-md shrink-0 bg-accent text-[var(--teal-600)]">
          {icon}
        </span>
        {href ? (
          <Link
            href={href}
            className="truncate underline-offset-2 hover:underline hover:text-primary"
          >
            {label}
          </Link>
        ) : (
          <span className="truncate">{label}</span>
        )}
      </span>
      <span className="min-w-0 sm:text-right tabular-nums text-[13px] sm:text-sm font-medium text-foreground">
        <span className="block sm:hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Hari ini
        </span>
        <span className="whitespace-nowrap">{formatRp(day)}</span>
      </span>
      <button
        type="button"
        onClick={onToggleMonth}
        disabled={!canToggle}
        title={
          !canToggle
            ? "Proyeksi belum tersedia di tanggal 1"
            : projected
              ? "Proyeksi akhir bulan berdasarkan pace saat ini — klik untuk lihat angka aktual bulan berjalan"
              : "Angka aktual bulan berjalan (s.d. hari ini) — klik untuk lihat proyeksi akhir bulan"
        }
        className={cn(
          "min-w-0 tabular-nums text-[13px] sm:text-sm font-medium text-left sm:text-right rounded-md -mx-1 px-1 transition",
          canToggle ? "cursor-pointer hover:bg-muted/50" : "cursor-not-allowed"
        )}
      >
        <span className="block sm:hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {projected ? "Proyeksi bulan ini" : "Bulan ini"}
        </span>
        <span
          className={cn(
            "whitespace-nowrap",
            projected
              ? "text-muted-foreground underline decoration-dashed decoration-1 underline-offset-4"
              : "text-foreground"
          )}
        >
          {projected ? "~" : ""}
          {formatRp(month)}
        </span>
        {delta && (
          <>
            <br className="sm:hidden" />
            <DeltaPill d={delta} />
          </>
        )}
      </button>
    </>
  );
}

function GroupHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-2 sm:col-span-3 mt-3 sm:mt-1 border-t border-border/60 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </div>
  );
}

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function AdminRevenueCard({
  today,
  yeobo,
  cashBalances = [],
}: {
  /** null = viewer tidak punya scope 'haengbocake' — baris POS/Cake disembunyikan. */
  today: RevenueSummary | null;
  yeobo: YeoboRevenue | null;
  /**
   * Admin-only (lihat getHaengbocakeCashBalances) — sengaja opsional,
   * bukan sekadar `[]` default nilai. Kartu ini dipakai juga di beranda
   * karyawan delegasi (canViewRevenueDashboard), yang TIDAK boleh
   * melihat saldo kas walau boleh melihat omzet; pemanggil itu cukup
   * tidak mengoper prop ini sama sekali, tidak perlu ingat kirim `[]`.
   */
  cashBalances?: CashBalanceRow[];
}) {
  const cmp = today?.monthCompare ?? null;
  const [mode, setMode] = useState<"runrate" | "actual">("runrate");
  const { day, daysInMonth } = jakartaMonthProgress();
  // Tgl 1: run-rate = month-to-date × daysInMonth (dibagi 1 hari data) —
  // matematis "benar" tapi hasilnya kebisingan murni, gampang 20-30x lipat
  // dari satu hari yang belum representatif. Di titik itu proyeksi bukan
  // cuma tidak berguna, tapi *aktif menyesatkan* dibanding cuma menunjukkan
  // apa adanya. Jadi biar user tidak melihat badge "Proyeksi" + angka
  // dikalikan 30x di tgl 1, paksa mode efektif jadi "actual" pada hari itu
  // — pilihan toggle user (`mode`) tidak diubah, cuma dianggap belum
  // berlaku sampai ada ≥2 hari data.
  const canProject = day > 1;
  const projected = mode === "runrate" && canProject;
  const toggleMode = () => setMode((m) => (m === "runrate" ? "actual" : "runrate"));
  const displayMonth = (monthToDate: number) =>
    projected ? runRateProjection(monthToDate, day, daysInMonth) : monthToDate;
  /** Basis pembanding % ikut ganti sesuai mode — lihat `monthDeltaProjected`. */
  const deltaFor = (
    monthActual: number,
    todayActual: number,
    prevPartial: number | null | undefined,
    prevPartialLabel: string | null | undefined,
    prevFull: number,
    prevFullLabel: string
  ) =>
    projected
      ? monthDeltaProjected(displayMonth(monthActual), prevFull, prevFullLabel)
      : monthDelta(monthActual - todayActual, prevPartial, prevPartialLabel);

  return (
    <div
      className="bg-card rounded-2xl border border-border/70 overflow-hidden"
      style={{
        boxShadow:
          "0 1px 2px rgba(8, 49, 46, 0.04), 0 4px 16px rgba(8, 49, 46, 0.05)",
      }}
    >
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display font-semibold text-[15px] lg:text-base text-foreground tracking-[-0.015em]">
            Omzet
          </div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">
            {cmp
              ? `Hari ini & bulan ini · ▲▼ vs ${cmp.prevLabel} bulan lalu`
              : "Hari ini & akumulasi bulan ini"}
          </div>
        </div>
        {/* Toggle mode "Bulan ini": default proyeksi run-rate (buat
            keputusan cepat "perlu promo sekarang?"), 1 klik ke angka
            aktual (buat evaluasi "campaign kemarin berhasil?"). */}
        <button
          type="button"
          onClick={toggleMode}
          disabled={!canProject}
          title={
            !canProject
              ? "Proyeksi belum tersedia di tanggal 1 — datanya baru 1 hari, belum cukup untuk dijadikan pace."
              : projected
                ? "Menampilkan proyeksi akhir bulan (pace saat ini). Klik untuk lihat angka aktual."
                : "Menampilkan angka aktual bulan berjalan. Klik untuk lihat proyeksi akhir bulan."
          }
          className={cn(
            "shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] transition",
            !canProject && "opacity-60 cursor-not-allowed",
            projected
              ? "border border-dashed border-muted-foreground/50 text-muted-foreground hover:bg-muted/50"
              : "bg-[var(--teal-600)] text-white hover:opacity-90"
          )}
        >
          {projected ? <TrendingUp size={12} /> : <CheckCircle2 size={12} />}
          {projected ? "Proyeksi" : "Aktual"}
        </button>
      </div>

      <div className="px-4 sm:px-5 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_auto_auto] gap-x-4 sm:gap-x-5 gap-y-0.5 sm:gap-y-2.5 items-baseline">
          <span className="hidden sm:block" />
          <span className="hidden sm:block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-right">
            Hari ini
          </span>
          <button
            type="button"
            onClick={toggleMode}
            disabled={!canProject}
            title={!canProject ? "Proyeksi belum tersedia di tanggal 1" : undefined}
            className={cn(
              "hidden sm:flex items-center justify-end gap-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-right transition",
              canProject ? "hover:text-foreground" : "cursor-not-allowed opacity-70"
            )}
          >
            {projected ? "Bulan ini (proyeksi)" : "Bulan ini (aktual)"}
          </button>

          {today && (
            <>
              <RevenueRow
                icon={<WalletIcon size={13} />}
                label="POS Hbc Pare"
                href="/pospare"
                day={today.posHbcPareToday}
                month={displayMonth(today.posHbcPareMonth)}
                projected={projected}
                onToggleMonth={toggleMode}
                canToggle={canProject}
                delta={deltaFor(
                  today.posHbcPareMonth,
                  today.posHbcPareToday,
                  cmp?.posHbcPare,
                  cmp?.prevLabel,
                  today.prevMonthFull.posHbcPare,
                  today.prevMonthFull.label
                )}
              />
              <RevenueRow
                icon={<WalletIcon size={13} />}
                label="POS Hbc Smg"
                href="/possemarang"
                day={today.posHbcSmgToday}
                month={displayMonth(today.posHbcSmgMonth)}
                projected={projected}
                onToggleMonth={toggleMode}
                canToggle={canProject}
                delta={deltaFor(
                  today.posHbcSmgMonth,
                  today.posHbcSmgToday,
                  cmp?.posHbcSmg,
                  cmp?.prevLabel,
                  today.prevMonthFull.posHbcSmg,
                  today.prevMonthFull.label
                )}
              />
              <RevenueRow
                icon={<CakeSlice size={13} />}
                label="Cake Hbc Pare"
                day={today.cakeHbcPareToday}
                month={displayMonth(today.cakeHbcPareMonth)}
                projected={projected}
                onToggleMonth={toggleMode}
                canToggle={canProject}
                delta={deltaFor(
                  today.cakeHbcPareMonth,
                  today.cakeHbcPareToday,
                  cmp?.cakeHbcPare,
                  cmp?.prevLabel,
                  today.prevMonthFull.cakeHbcPare,
                  today.prevMonthFull.label
                )}
              />
              <RevenueRow
                icon={<CakeSlice size={13} />}
                label="Cake Hbc Smg"
                day={today.cakeHbcSmgToday}
                month={displayMonth(today.cakeHbcSmgMonth)}
                projected={projected}
                onToggleMonth={toggleMode}
                canToggle={canProject}
                delta={deltaFor(
                  today.cakeHbcSmgMonth,
                  today.cakeHbcSmgToday,
                  cmp?.cakeHbcSmg,
                  cmp?.prevLabel,
                  today.prevMonthFull.cakeHbcSmg,
                  today.prevMonthFull.label
                )}
              />
            </>
          )}

          {cashBalances.length > 0 && (
            <>
              <GroupHead>Saldo Kas Haengbocake</GroupHead>
              <div className="col-span-2 sm:col-span-3 flex flex-wrap gap-x-6 gap-y-1.5">
                {cashBalances.map((c) => (
                  <span key={c.branch} className="inline-flex items-center gap-1.5 text-[13px]">
                    <span className="grid place-items-center size-[22px] rounded-md shrink-0 bg-accent text-[var(--teal-600)]">
                      <WalletIcon size={13} />
                    </span>
                    <span className="text-muted-foreground">{c.branch}:</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatRp(c.balance)}
                    </span>
                  </span>
                ))}
              </div>
            </>
          )}

          {yeobo && (
            <>
              <GroupHead>
                Yeobo Space · live dari yeobospace.id
                {yeobo.latestPaidAt && (
                  <span className="normal-case tracking-normal font-normal">
                    {" "}
                    (s.d. {timeLabel(yeobo.latestPaidAt)})
                  </span>
                )}
              </GroupHead>
              {yeobo.branches.map((b) => (
                <RevenueRow
                  key={b.id}
                  icon={<Camera size={13} />}
                  label={b.label}
                  day={b.today}
                  month={displayMonth(b.month)}
                  projected={projected}
                  onToggleMonth={toggleMode}
                  canToggle={canProject}
                  delta={deltaFor(
                    b.month,
                    b.today,
                    b.prevSameRange,
                    yeobo.prevLabel,
                    b.prevMonthFull,
                    yeobo.prevMonthFullLabel
                  )}
                />
              ))}
              <p className="col-span-2 sm:col-span-3 text-[10.5px] leading-snug text-muted-foreground mt-2 sm:mt-0">
                Net setelah fee Mayar 2,2% (booking + tambahan), jadi sebanding
                dengan angka bank/P&L. Tunai tidak kena fee.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
