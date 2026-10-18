export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { posBranchFromParam } from "@/lib/pos/branch";
import { getCashClosingSnapshot } from "@/lib/actions/cash-closing.actions";
import { CashClosingForm } from "@/components/cash-closing/CashClosingForm";

export default async function TutupKasBranchPage({
  params,
}: {
  params: Promise<{ branch: string }>;
}) {
  const { branch: branchParam } = await params;
  const branch = posBranchFromParam(branchParam);
  if (!branch) redirect("/tutup-kas");

  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [snap, role] = await Promise.all([getCashClosingSnapshot(branch), getCurrentRole()]);
  if (!snap.ok || !snap.data) redirect("/dashboard");

  return (
    <div data-theme="oceanic" className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md px-4 py-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link
            href="/tutup-kas"
            className="rounded-full p-2 hover:bg-muted text-muted-foreground"
            aria-label="Kembali"
          >
            <ArrowLeft size={18} strokeWidth={2.5} />
          </Link>
          <div>
            <h1 className="font-display text-xl font-extrabold tracking-tight leading-none">
              Tutup Kas {branch}
              <span className="text-primary">.</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">{snap.data.closingDate}</p>
          </div>
        </div>
        <CashClosingForm initial={snap.data} isAdmin={role === "admin"} />
      </div>
    </div>
  );
}
