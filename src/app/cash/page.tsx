export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Coins } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { orderYeoboBranches } from "@/lib/cashflow/categories";
import { cashSlugForBranch } from "@/lib/cashflow/cash-branches";

/**
 * Hub kas Yeobo Space. RLS men-scope `bank_accounts`: admin lihat 3
 * cabang, assignee hanya cabangnya. 1 cabang → langsung redirect ke
 * halaman cabang; banyak (admin) → daftar; kosong → pulang.
 */
export default async function CashHubPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bank_accounts")
    .select("default_branch")
    .eq("business_unit", "Yeobo Space")
    .eq("bank", "cash");

  const branches = orderYeoboBranches(
    (data ?? [])
      .map((a) => a.default_branch)
      .filter((b): b is string => !!b && !!cashSlugForBranch(b))
  );

  if (branches.length === 0) redirect("/");
  if (branches.length === 1) redirect(`/${cashSlugForBranch(branches[0])}`);

  return (
    <div data-theme="oceanic" className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md px-4 py-8 space-y-4">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Yeobo Space
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-foreground">Kas Cabang</h1>
          <p className="text-sm text-muted-foreground">Pilih cabang untuk input & monitor saldo cash.</p>
        </header>
        <div className="space-y-3">
          {branches.map((b) => (
            <Link
              key={b}
              href={`/${cashSlugForBranch(b)}`}
              className="press-feedback flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 hover:border-primary/50 transition"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Coins size={18} strokeWidth={2.4} />
              </span>
              <span className="text-base font-semibold text-foreground">{b}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
