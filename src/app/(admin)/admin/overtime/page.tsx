export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPendingOvertimeRequests } from "@/lib/actions/overtime.actions";
import { OvertimeRequestsTable } from "@/components/admin/OvertimeRequestsTable";
import { PageHeader } from "@/components/shared/PageHeader";

interface SearchParams {
  tab?: string;
}

export default async function AdminOvertimePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const activeTab = params.tab ?? "pending";

  const rows = await getPendingOvertimeRequests(activeTab);

  const tabs = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Overtime Requests"
        subtitle="Review and approve overtime claims from employees"
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-[#f5f5f7] rounded-xl p-1 w-fit">
        {tabs.map(({ key, label }) => (
          <Link
            key={key}
            href={`/admin/overtime?tab=${key}`}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: activeTab === key ? "#fff" : "transparent",
              color: activeTab === key ? "var(--primary)" : "var(--muted-foreground)",
              boxShadow: activeTab === key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {label}
          </Link>
        ))}
      </div>

      <OvertimeRequestsTable
        rows={rows as Parameters<typeof OvertimeRequestsTable>[0]["rows"]}
        activeTab={activeTab}
      />
    </div>
  );
}
