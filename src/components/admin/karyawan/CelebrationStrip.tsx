import Link from "next/link";
import { Cake, Award } from "lucide-react";
import type { EmployeeMonitoringRow } from "@/lib/actions/employee-monitoring.actions";

const WINDOW_DAYS = 14;

function when(days: number): string {
  if (days === 0) return "hari ini";
  if (days === 1) return "besok";
  return `${days} hari lagi`;
}

/** Ulang tahun dan anniversary kerja dalam dua minggu ke depan. Kosong = tidak tampil. */
export function CelebrationStrip({ rows }: { rows: EmployeeMonitoringRow[] }) {
  const events = rows
    .flatMap((r) => {
      const name = r.nickname || r.fullName;
      const out: { key: string; id: string; name: string; days: number; kind: "ultah" | "anniv" }[] = [];
      if (r.daysToBirthday != null && r.daysToBirthday <= WINDOW_DAYS) {
        out.push({ key: `${r.id}-b`, id: r.id, name, days: r.daysToBirthday, kind: "ultah" });
      }
      if (r.daysToAnniversary != null && r.daysToAnniversary <= WINDOW_DAYS && r.yearsOfService > 0) {
        out.push({ key: `${r.id}-a`, id: r.id, name, days: r.daysToAnniversary, kind: "anniv" });
      }
      return out;
    })
    .sort((a, b) => a.days - b.days);

  if (events.length === 0) return null;
  const shown = events.slice(0, 6);

  return (
    <section
      aria-label="Segera dirayakan"
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-celebration-upcoming px-4 py-2.5 text-sm"
    >
      <span className="font-medium text-foreground">Segera dirayakan</span>
      {shown.map((e) => (
        <Link
          key={e.key}
          href={`/admin/karyawan/${e.id}`}
          className="inline-flex items-center gap-1.5 text-foreground hover:underline"
        >
          {e.kind === "ultah" ? (
            <Cake size={14} aria-label="Ulang tahun" className="text-primary" />
          ) : (
            <Award size={14} aria-label="Anniversary kerja" className="text-primary" />
          )}
          {e.name}
          <span className={e.days === 0 ? "font-medium text-primary" : "text-muted-foreground"}>{when(e.days)}</span>
        </Link>
      ))}
      <Link href="/admin/celebrations" className="ml-auto text-muted-foreground hover:text-foreground">
        {events.length > shown.length ? `+${events.length - shown.length} lainnya` : "Monitoring"}
      </Link>
    </section>
  );
}
