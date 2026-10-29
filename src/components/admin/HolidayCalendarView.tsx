"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ExternalLink, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { syncOfficialHolidays } from "@/lib/actions/holidays.actions";
import { HOLIDAY_SOURCES, holidaysOfYear, isNationalHoliday } from "@/lib/holidays/indonesia";
import { workingDaysInMonth } from "@/lib/scorecard/working-days";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const dateFmt = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
const pad =(n: number) => String(n).padStart(2, "0");

/**
 * Kalender tanggal merah nasional (bukan cuti bersama) 2026 & 2027 untuk superadmin: kalender 12 bulan, daftar dengan hari,
 * sumber SKB, dan pencocokan dengan tabel `national_holidays` (dipakai absensi). Jumlah hari kerja per bulan menunjukkan
 * dampaknya ke target omzet scorecard (Senin–Sabtu dikurangi tanggal merah).
 */
export function HolidayCalendarView({ dbDates, today }: { dbDates: string[]; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const years = HOLIDAY_SOURCES.map((s) => s.year);
  const [year, setYear] = useState(years.includes(Number(today.slice(0, 4))) ? Number(today.slice(0, 4)) : years[0]);
  const source = HOLIDAY_SOURCES.find((s) => s.year === year)!;
  const holidays = holidaysOfYear(year);
  const nameOf = new Map(holidays.map((h) => [h.date, h.name]));

  const db = new Set(dbDates.filter((d) => d.startsWith(`${year}-`)));
  const missing = holidays.filter((h) => !db.has(h.date));
  const extra = [...db].filter((d) => !nameOf.has(d)).sort();
  const onWorkdays = holidays.filter((h) => new Date(`${h.date}T00:00:00Z`).getUTCDay() !== 0).length;

  function sync() {
    start(async () => {
      const r = await syncOfficialHolidays();
      if ("error" in r) return void toast.error(r.error);
      toast.success(r.inserted > 0 ? `${r.inserted} tanggal ditambahkan ke database absensi` : "Database sudah sama dengan daftar resmi");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border-2 border-foreground bg-card p-1" role="tablist" aria-label="Tahun">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              role="tab"
              aria-selected={y === year}
              onClick={() => setYear(y)}
              className={cn("min-w-24 rounded-lg px-4 py-1.5 text-sm font-bold transition", y === year ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {y}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground">
          <strong className="text-foreground">{source.expectedDays} hari</strong> libur nasional · cuti bersama tidak termasuk tanggal merah
        </span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
          {MONTHS.map((label, m) => (
            <MonthCard key={label} year={year} month={m} label={label} today={today} nameOf={nameOf} />
          ))}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="font-display text-sm font-bold">Sumber & validasi</h2>
            <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">
              {source.skb}, ditetapkan {new Date(`${source.signed}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.
            </p>
            <a href={source.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline">
              Dokumen resmi Setneg <ExternalLink size={12} />
            </a>
            <ul className="mt-3 space-y-1.5 text-[12.5px]">
              <li className="flex items-start gap-2">
                <Check size={14} className="mt-0.5 shrink-0 text-success" />
                <span>
                  {holidays.length} tanggal = {source.expectedDays} hari sesuai pengumuman resmi (Idulfitri dihitung dua hari).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check size={14} className="mt-0.5 shrink-0 text-success" />
                <span>
                  {onWorkdays} dari {holidays.length} tanggal jatuh pada Senin–Sabtu; sisanya Minggu, jadi tidak mengurangi hari kerja.
                </span>
              </li>
              {missing.length === 0 ? (
                <li className="flex items-start gap-2">
                  <Check size={14} className="mt-0.5 shrink-0 text-success" />
                  <span>Database absensi memuat semua {holidays.length} tanggal.</span>
                </li>
              ) : (
                <li className="flex items-start gap-2 text-warning">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                  <span>Database absensi belum memuat {missing.length} tanggal: {missing.map((h) => shortFmt.format(new Date(`${h.date}T00:00:00Z`))).join(", ")}.</span>
                </li>
              )}
              {extra.length > 0 && (
                <li className="flex items-start gap-2 text-muted-foreground">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                  <span>Tambahan manual di database (bukan dari SKB): {extra.join(", ")}.</span>
                </li>
              )}
            </ul>
            {missing.length > 0 && (
              <Button size="sm" className="mt-3 gap-1.5" onClick={sync} disabled={pending}>
                <RefreshCw size={13} className={pending ? "animate-spin" : undefined} /> Sinkronkan ke database
              </Button>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card">
            <h2 className="border-b border-border px-4 py-2.5 font-display text-sm font-bold">Daftar tanggal merah {year}</h2>
            <ul className="divide-y divide-border">
              {holidays.map((h) => (
                <li key={h.date} className="flex items-baseline justify-between gap-3 px-4 py-1.5 text-[12.5px]">
                  <span className="font-semibold tabular-nums">{dateFmt.format(new Date(`${h.date}T00:00:00Z`))}</span>
                  <span className="text-right text-muted-foreground">{h.name}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function MonthCard({ year, month, label, today, nameOf }: { year: number; month: number; label: string; today: string; nameOf: Map<string, string> }) {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Senin = 0
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const monthIso = `${year}-${pad(month + 1)}-01`;
  const inMonth = [...nameOf.keys()].filter((d) => d.startsWith(monthIso.slice(0, 7))).length;

  return (
    <section className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <h3 className="font-display text-[13px] font-bold">{label}</h3>
        <span className="text-[10.5px] text-muted-foreground" title="Hari kerja Senin–Sabtu dikurangi tanggal merah">
          {workingDaysInMonth(monthIso)} hari kerja{inMonth > 0 ? ` · ${inMonth} libur` : ""}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
        {DOW.map((d, i) => (
          <span key={d} className={cn("pb-0.5 text-[9.5px] font-semibold uppercase tracking-wide", i === 6 ? "text-destructive/70" : "text-muted-foreground")}>
            {d}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day == null) return <span key={i} />;
          const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
          const holiday = isNationalHoliday(iso);
          const sunday = i % 7 === 6;
          return (
            <span
              key={i}
              title={holiday ? nameOf.get(iso) : undefined}
              className={cn(
                "flex aspect-square items-center justify-center rounded-md tabular-nums",
                holiday ? "bg-destructive font-bold text-white" : sunday ? "text-destructive/70" : "text-foreground",
                iso === today && "ring-2 ring-foreground ring-offset-1 ring-offset-card"
              )}
            >
              {day}
            </span>
          );
        })}
      </div>
    </section>
  );
}
