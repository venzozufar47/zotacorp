export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  listProductIdeas,
  listTesters,
  listProductCards,
  canScreenRnd,
} from "@/lib/actions/product-rnd.actions";
import { listHaengbocakeEmployeesForMinutes } from "@/lib/actions/team-minutes.actions";
import { ProductRndClient } from "@/components/product-rnd/ProductRndClient";

export default async function RisetProdukPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();

  const [ideas, testers, cards, colleagues, canScreen] = await Promise.all([
    listProductIdeas(),
    listTesters(),
    listProductCards(),
    listHaengbocakeEmployeesForMinutes(),
    canScreenRnd(),
  ]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="rounded-full p-2 hover:bg-muted text-muted-foreground"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
        <h1 className="font-display text-xl font-extrabold tracking-tight leading-none">
          Riset Produk<span className="text-primary">.</span>
        </h1>
      </div>
      <ProductRndClient
        ideas={ideas}
        testers={testers}
        cards={cards}
        colleagues={colleagues}
        canScreen={canScreen}
        isAdmin={role === "admin"}
      />
    </div>
  );
}
