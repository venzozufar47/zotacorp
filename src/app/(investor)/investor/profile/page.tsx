export const dynamic = "force-dynamic";

import { getCurrentProfile } from "@/lib/supabase/cached";
import { getMyInvestorAccess } from "@/lib/investor/access";

export default async function InvestorProfilePage() {
  const profile = await getCurrentProfile();
  const { businessUnits } = await getMyInvestorAccess();

  return (
    <div className="space-y-5 animate-fade-up">
      <header>
        <p className="eyebrow text-muted-foreground">Profil</p>
        <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-foreground">
          {profile?.full_name ?? "Investor"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{profile?.email}</p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground">
            Perusahaan / posisi
          </p>
          <p className="mt-1 text-sm text-foreground">
            {profile?.position?.trim() || (
              <span className="text-muted-foreground italic">
                Belum diisi
              </span>
            )}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground">
            Unit bisnis aktif
          </p>
          {businessUnits.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground italic">
              Belum di-assign — menunggu admin.
            </p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {businessUnits.map((bu) => (
                <li
                  key={bu}
                  className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold"
                >
                  {bu}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
