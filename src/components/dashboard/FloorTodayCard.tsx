import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
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
    <section
      aria-label="Karyawan hari ini"
      className="animate-fade-up animate-fade-up-delay-2"
    >
      <div className="flex items-center justify-between px-1 mb-2.5">
        <span className="eyebrow text-muted-foreground">Masuk hari ini</span>
        <span
          aria-hidden
          className="h-px flex-1 ml-3 bg-gradient-to-r from-border to-transparent"
        />
      </div>
      <div className="panel-sticker p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-base font-semibold text-foreground">
            Siapa di kantor
          </h3>
          <p className="text-[12.5px] text-muted-foreground">
            {people.length === 0
              ? "Belum ada yang sign-in"
              : `${onDuty.length} on duty · ${people.length} sign-in hari ini`}
          </p>
        </div>
        {people.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            Belum ada karyawan yang check-in hari ini.
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map(({ unit, members }) => (
              <div key={unit}>
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-1.5">
                  {unit}{" "}
                  <span className="text-muted-foreground/60 tabular-nums">
                    · {members.length}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {members.map((p) => (
                    <div
                      key={p.userId}
                      className={`inline-flex items-center gap-2 pl-1 pr-3 h-8 rounded-full border border-border/60 text-[12px] ${
                        p.checkedOut
                          ? "bg-muted/30 text-muted-foreground opacity-60"
                          : "bg-muted/50 text-foreground"
                      }`}
                      title={
                        p.checkedOut
                          ? `Sudah sign-out · ${p.status}`
                          : `On duty · ${p.status}`
                      }
                    >
                      <EmployeeAvatar
                        size="sm"
                        full_name={p.fullName}
                        avatar_url={p.avatarUrl}
                        avatar_seed={p.avatarSeed}
                        className={p.checkedOut ? "grayscale" : undefined}
                      />
                      <span className="truncate max-w-[120px]">
                        {firstName(p.fullName)}
                      </span>
                    </div>
                  ))}
                </div>
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
