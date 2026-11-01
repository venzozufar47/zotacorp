import { ChevronDown } from "lucide-react";
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
/** Avatar maksimum di baris ringkas; selebihnya jadi "+N". */
const MAX_STACK = 7;

export function FloorTodayCard({
  people,
}: {
  people: ClockedInEmployee[];
}) {
  const onDuty = people.filter((p) => !p.checkedOut);
  const groups = groupByUnit(people);
  // Yang masih di kantor didahulukan; sisanya diringkas jadi "+N".
  const ordered = [...onDuty, ...people.filter((p) => p.checkedOut)];
  const stack = ordered.slice(0, MAX_STACK);
  const extra = ordered.length - stack.length;
  return (
    <section aria-label="Karyawan hari ini" className="animate-fade-up animate-fade-up-delay-2">
      {/* Satu baris: avatar bertumpuk + jumlah. Ketuk untuk membuka nama per unit (details native, tanpa JS). */}
      {people.length === 0 ? (
        <div className="panel-sticker px-3.5 py-2.5 text-[12px] text-muted-foreground">
          Belum ada karyawan yang check-in hari ini.
        </div>
      ) : (
        <details className="panel-sticker group px-3.5 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center pl-1">
              {stack.map((p) => (
                <EmployeeAvatar
                  key={p.userId}
                  size="sm"
                  full_name={p.fullName}
                  avatar_url={p.avatarUrl}
                  avatar_seed={p.avatarSeed}
                  className={cn("-ml-1.5 data-[size=sm]:size-6 border-2 border-card first:ml-0", p.checkedOut && "grayscale opacity-60")}
                />
              ))}
              {extra > 0 && (
                <span className="-ml-1.5 flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-[10px] font-medium tabular-nums text-muted-foreground">
                  +{extra}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
              <span className="font-semibold tabular-nums">{onDuty.length}/{people.length}</span>
              <span className="text-muted-foreground"> sign-in</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-[12px] leading-relaxed">
            {groups.map(({ unit, members }) => {
              const on = members.filter((p) => !p.checkedOut);
              const off = members.filter((p) => p.checkedOut);
              return (
                <p key={unit} className="text-muted-foreground">
                  <span className="font-medium text-foreground">{unit}</span>{" "}
                  {on.map(firstName).join(", ")}
                  {off.length > 0 && (
                    <span className="text-muted-foreground/70">
                      {on.length > 0 ? " · " : ""}pulang: {off.map(firstName).join(", ")}
                    </span>
                  )}
                </p>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}

function firstName(p: ClockedInEmployee): string {
  const nick = p.nickname?.trim();
  return nick || p.fullName.split(/\s+/)[0] || p.fullName;
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
