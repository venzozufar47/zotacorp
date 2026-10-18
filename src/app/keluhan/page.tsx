export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { listComplaints } from "@/lib/actions/customer-complaints.actions";
import { ComplaintClient } from "@/components/complaints/ComplaintClient";

export default async function KeluhanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [open, closed] = await Promise.all([
    listComplaints({ status: "open" }),
    listComplaints({ status: "closed", days: 30 }),
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
          Keluhan<span className="text-primary">.</span>
        </h1>
      </div>
      <ComplaintClient defaultBranch="Pare" open={open} closed={closed} />
    </div>
  );
}
