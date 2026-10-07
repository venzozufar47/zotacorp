export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  listAssignableEmployees,
  listAssignedTasks,
} from "@/lib/actions/assigned-tasks.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { TasksManager } from "@/components/admin/tasks/TasksManager";

/**
 * Admin — Tugas Karyawan: buat checklist sekali-jalan, assign ke karyawan,
 * lalu verifikasi hasilnya (foto per item). `?focus=<id>` membuka langsung
 * panel verifikasi tugas itu (dipakai Inbox beranda admin).
 */
export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const { focus } = await searchParams;
  const [tasksRes, employeesRes] = await Promise.all([
    listAssignedTasks(),
    listAssignableEmployees(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tugas"
        subtitle="Tugas sekali-jalan untuk karyawan — wajib foto per item dan diverifikasi di sini."
      />
      <TasksManager
        tasks={tasksRes.ok ? tasksRes.data ?? [] : []}
        employees={employeesRes.ok ? employeesRes.data ?? [] : []}
        loadError={tasksRes.ok ? null : tasksRes.error}
        focusId={focus ?? null}
      />
    </div>
  );
}
