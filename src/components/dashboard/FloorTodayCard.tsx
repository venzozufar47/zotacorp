import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { cn } from "@/lib/utils";
import type { ClockedInEmployee } from "@/lib/actions/admin-home.actions";

/**
 * Roster "Masuk hari ini" yang muncul di dashboard karyawan. Roster
 * dikelompokkan berdasarkan `business_unit` (unit kerja) supaya
 * karyawan dapat melihat siapa di unit yang sama dengan mudah.
 * Setiap karyawan yang sign-in di-render sebagai chip dengan avatar
 * + nama depan; chip yang sudah check-out di-grayscale + opacity
 * rendah sebagai sinyal "off duty".
 *
 * Komponen presentational — data di-fetch caller via
 * `getFloorToday()`. Sengaja terpisah dari Floor card admin (di
 * `AdminHomePage`) supaya admin tetap punya interaksi click → drawer
 * detail; karyawan biasa cukup lihat roster saja.
 */
export function FloorTodayCard({
  people,
}: {
  people: ClockedInEmployee[];
}) {
  const onDuty = people.filter((p) => !p.checkedOut);
  const groups = groupByUnit(people);
  return (
    <section aria-label="Karyawan hari ini" className="animate-fade-up animate-fade-up-delay-2">
      {/* Ringkas: satu kartu rapat tanpa judul seksi terpisah. Info tetap lengkap (siapa, unit, on duty / sudah pulang). */}
      <div className="panel-sticker px-3.5 py-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-foreground">Siapa di kantor hari ini</h3>
          <p className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
            {people.length === 0 ? "Belum ada yang sign-in" : `${onDuty.length} on duty · ${people.length} sign-in`}
          </p>
        </div>
        {people.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Belum ada karyawan yang check-in hari ini.</p>
        ) : (
          <div className="space-y-1.5">
            {groups.map(({ unit, members }) => (
              <div key={unit} className="flex flex-wrap items-center gap-1">
                <span className="mr-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {unit} <span className="tabular-nums text-muted-foreground/60">{members.length}</span>
                </span>
                {members.map((p) => (
                  <span
                    key={p.userId}
                    className={`inline-flex h-6 items-center gap-1 rounded-full border border-border/60 pl-0.5 pr-2 text-[11.5px] ${
                      p.checkedOut ? "bg-muted/30 text-muted-foreground opacity-60" : "bg-muted/50 text-foreground"
                    }`}
                    title={p.checkedOut ? `Sudah sign-out · ${p.status}` : `On duty · ${p.status}`}
                  >
                    <EmployeeAvatar
                      size="sm"
                      full_name={p.fullName}
                      avatar_url={p.avatarUrl}
                      avatar_seed={p.avatarSeed}
                      className={cn("data-[size=sm]:size-5 border", p.checkedOut && "grayscale")}
                    />
                    <span className="max-w-[96px] truncate">{firstName(p.fullName)}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function firstName(full: string): string {
  return full.split(/\s+/)[0] ?? full;
}

/**
 * Group roster ke unit kerja. Karyawan tanpa `business_unit` masuk
 * "Lainnya" supaya tidak hilang. Urut: jumlah anggota terbanyak →
 * tersedikit, dengan "Lainnya" selalu di akhir.
 */
function groupByUnit(
  people: ClockedInEmployee[]
): Array<{ unit: string; members: ClockedInEmployee[] }> {
  const map = new Map<string, ClockedInEmployee[]>();
  for (const p of people) {
    const key = p.businessUnit?.trim() || "Lainnya";
    const arr = map.get(key) ?? [];
    arr.push(p);
    map.set(key, arr);
  }
  return Array.from(map.entries())
    .map(([unit, members]) => ({ unit, members }))
    .sort((a, b) => {
      if (a.unit === "Lainnya") return 1;
      if (b.unit === "Lainnya") return -1;
      if (a.members.length !== b.members.length)
        return b.members.length - a.members.length;
      return a.unit.localeCompare(b.unit);
    });
}
