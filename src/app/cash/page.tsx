export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Coins } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { orderYeoboBranches } from "@/lib/cashflow/categories";
import { cashSlugForAccount } from "@/lib/cashflow/cash-branches";

/**
 * Hub kas cabang (lintas BU). RLS men-scope `bank_accounts`: admin lihat
 * semua, assignee hanya rekeningnya. Hanya akun cash yang terdaftar di
 * registry CASH_DASHBOARDS yang tampil (mis. Cash Haengbocake Pare TIDAK
 * — kasnya dikelola via POS). 1 dashboard → langsung redirect; banyak →
 * daftar; kosong → pulang.
 */
export default async function CashHubPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bank_accounts")
    .select("business_unit, default_branch")
    .eq("bank", "cash")
    .eq("is_active", true);

  const entries = (data ?? [])
    .map((a) => {
      const slug = cashSlugForAccount(a.business_unit, a.default_branch);
      return slug
        ? { slug, businessUnit: a.business_unit, branch: a.default_branch as string }
        : null;
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  // Urutan: cabang Yeobo dulu (urutan kanonik), lalu BU lain per nama cabang.
  const yeobo = orderYeoboBranches(
    entries.filter((e) => e.businessUnit === "Yeobo Space"),
    (e) => e.branch
  );
  const rest = entries
    .filter((e) => e.businessUnit !== "Yeobo Space")
    .sort((a, b) => a.branch.localeCompare(b.branch));
  const list = [...yeobo, ...rest];

  if (list.length === 0) redirect("/");
  if (list.length === 1) redirect(`/${list[0].slug}`);

  return (
    <div data-theme="oceanic" className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md px-4 py-8 space-y-4">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Zota Corp
          </p>
          <h1 className="mt-0.5 text-2xl font-bold text-foreground">Kas Cabang</h1>
          <p className="text-sm text-muted-foreground">Pilih cabang untuk input & monitor saldo cash.</p>
        </header>
        <div className="space-y-3">
          {list.map((e) => (
            <Link
              key={e.slug}
              href={`/${e.slug}`}
              className="press-feedback flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 hover:border-primary/50 transition"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Coins size={18} strokeWidth={2.4} />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold text-foreground">
                  {e.branch}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {e.businessUnit}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
