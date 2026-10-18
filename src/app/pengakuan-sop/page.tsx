export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { listSopDocumentsForEmployee } from "@/lib/actions/sop-documents.actions";
import { SopAcknowledgmentClient } from "@/components/sop/SopAcknowledgmentClient";

export default async function PengakuanSopPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const documents = await listSopDocumentsForEmployee();

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
          Pengakuan SOP<span className="text-primary">.</span>
        </h1>
      </div>
      <SopAcknowledgmentClient documents={documents} />
    </div>
  );
}
