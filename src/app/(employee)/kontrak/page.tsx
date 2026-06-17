export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyContract } from "@/lib/actions/employment-contracts.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { ContractSignClient } from "@/components/employment-contracts/ContractSignClient";

export default async function EmployeeContractPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const contract = await getMyContract();

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Kontrak Kerja"
        subtitle="Perjanjian Kerja kamu. Slip gaji terbuka setelah kontrak ditandatangani."
      />
      {!contract ? (
        <Card>
          <CardContent className="p-6 text-center space-y-2">
            <div className="text-3xl">📄</div>
            <h3 className="font-display text-lg font-bold">Belum ada kontrak</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Admin belum menerbitkan kontrak kerja untukmu. Kontrak akan muncul
              di sini begitu diterbitkan.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ContractSignClient contract={contract} />
      )}
    </div>
  );
}
