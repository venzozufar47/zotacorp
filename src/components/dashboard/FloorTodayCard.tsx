import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import type { ClockedInEmployee } from "@/lib/actions/admin-home.actions";

/**
 * Roster "Floor" yang muncul di dashboard karyawan. Setiap karyawan
 * yang sign-in hari ini di-render sebagai chip dengan avatar + nama
 * depan; chip yang sudah check-out di-grayscale + opacity rendah
 * sebagai sinyal "off duty".
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
          <div className="flex flex-wrap gap-2">
            {people.map((p) => (
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
        )}
      </div>
    </section>
  );
}

function firstName(full: string): string {
  return full.split(/\s+/)[0] ?? full;
}
