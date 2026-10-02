import { AlertTriangle } from "lucide-react";
import { LateCheckoutDialog } from "@/components/attendance/LateCheckoutDialog";
import { formatTime } from "@/lib/utils/date";
import type { MissedCheckout } from "@/lib/actions/attendance.actions";

/** "2026-09-15" → "Sel, 15 Sep". Tanggal-saja, diurai manual (hindari geser UTC). */
function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Peringatan di beranda: ada hari yang sudah lewat dengan sign in tapi
 * belum sign out. Hari seperti itu tidak dihitung sebagai hari kerja
 * (mengurangi gaji prorata) dan, untuk slip berbasis kehadiran, mengunci
 * konfirmasi slip. Tiap baris punya tombol isi sign out langsung — tanpa
 * pindah halaman. Menghilang sendiri saat tidak ada yang tertinggal.
 */
export function MissedCheckoutCard({
  items,
  affectsPay,
  workEndTime,
  isFlexibleSchedule,
  timezone,
}: {
  items: MissedCheckout[];
  /** Basis gaji memakai kehadiran? Kalau tidak (flat/deliverables), hari
   *  tanpa sign out tidak mengubah nominal — jangan menakut-nakuti. */
  affectsPay: boolean;
  workEndTime?: string;
  isFlexibleSchedule?: boolean;
  timezone?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-foreground bg-warning/40 px-4 py-3 shadow-hard-sm space-y-2.5">
      <div className="flex items-start gap-3">
        <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-card shrink-0">
          <AlertTriangle size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-sm">
            {items.length === 1
              ? "Kamu lupa sign out di 1 hari"
              : `Kamu lupa sign out di ${items.length} hari`}
          </p>
          {affectsPay ? (
            <p className="text-xs text-muted-foreground">
              Hari berikut ada sign in tapi belum sign out, jadi{" "}
              <strong>tidak dihitung sebagai hari kerja</strong> dan mengurangi
              gajimu. Isi jam pulangnya sekarang. Kalau slip gaji bulan itu
              sudah terbit, kabari admin supaya dihitung ulang.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Hari berikut ada sign in tapi belum sign out. Isi jam pulangnya
              supaya catatan absenmu lengkap.
            </p>
          )}
        </div>
      </div>

      <ul className="space-y-1.5">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex items-center justify-between gap-3 rounded-xl border-2 border-border bg-card px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                {dayLabel(it.date)}
              </span>
              <span className="block text-[11px] text-muted-foreground tabular-nums">
                Sign in {formatTime(it.checkedInAt, timezone)}
              </span>
            </span>
            <LateCheckoutDialog
              attendanceLogId={it.id}
              date={it.date}
              checkedInAt={it.checkedInAt}
              workEndTime={workEndTime}
              isFlexibleSchedule={isFlexibleSchedule}
              timezone={timezone}
              triggerLabel="Isi sign out"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
