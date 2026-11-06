export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import {
  getMyContract,
  getContractSignerPrefill,
} from "@/lib/actions/employment-contracts.actions";
import { ContractSignClient } from "@/components/employment-contracts/ContractSignClient";

export default async function EmployeeContractPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const [contract, signerPrefill] = await Promise.all([
    getMyContract(),
    getContractSignerPrefill(),
  ]);

  if (!contract) {
    return (
      <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
          <FileText size={20} aria-hidden />
        </span>
        <h2 className="mt-3 font-display text-base font-semibold">Belum ada kontrak</h2>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
          Kontrak kerjamu muncul di sini setelah admin menerbitkannya.
        </p>
      </div>
    );
  }

  return <ContractSignClient contract={contract} signerPrefill={signerPrefill} />;
}
