export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canAccessYeoboBooth } from "@/lib/yeobo-booth/access";
import { listFreelance } from "@/lib/actions/yeobo-booth-freelance.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { FreelanceManager } from "@/components/yeobo-booth/FreelanceManager";

export default async function FreelancePage() {
  if (!(await canAccessYeoboBooth())) redirect("/dashboard");

  const freelance = await listFreelance({ includeInactive: true });

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Master Freelance"
        subtitle="Daftar operator/kru lepas yang ditugaskan di sesi photobooth. Tidak punya akun login."
        action={
          <Link
            href="/admin/yeobo-booth"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
            Yeobo Booth
          </Link>
        }
      />
      <FreelanceManager freelance={freelance} />
    </div>
  );
}
