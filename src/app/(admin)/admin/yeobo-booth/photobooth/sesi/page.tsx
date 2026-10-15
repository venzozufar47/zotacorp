export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentRole } from "@/lib/supabase/cached";
import {
  getBoothSessionSummary,
  listBoothDevices,
  listBoothSessions,
} from "@/lib/actions/booth.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { SessionsTable } from "@/components/booth/SessionsTable";

export default async function PhotoboothSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string }>;
}) {
  // Sementara khusus superadmin (admin Zota).
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const { device } = await searchParams;
  const [sessions, summary, devices] = await Promise.all([
    listBoothSessions(device),
    getBoothSessionSummary(device),
    listBoothDevices(),
  ]);

  const stats = [
    { label: "Total sesi", value: summary.total },
    { label: "Hari ini", value: summary.today },
    { label: "Terunggah", value: summary.uploaded },
    { label: "Menunggu unggah", value: summary.waiting },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sesi Foto"
        subtitle="100 sesi terbaru. Hapus foto lebih awal jika tamu memintanya."
        action={
          <Link
            href="/admin/yeobo-booth/photobooth"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <ArrowLeft size={14} strokeWidth={2.5} />
            Perangkat
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/yeobo-booth/photobooth/sesi"
          className={`rounded-full border-2 px-3 py-1 text-sm font-medium ${
            !device
              ? "border-foreground bg-primary text-primary-foreground"
              : "border-foreground/20 hover:bg-muted"
          }`}
        >
          Semua perangkat
        </Link>
        {devices.map((d) => (
          <Link
            key={d.id}
            href={`/admin/yeobo-booth/photobooth/sesi?device=${d.id}`}
            className={`rounded-full border-2 px-3 py-1 text-sm font-medium ${
              device === d.id
                ? "border-foreground bg-primary text-primary-foreground"
                : "border-foreground/20 hover:bg-muted"
            }`}
          >
            {d.location ?? d.name}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </div>
            <div className="mt-1 font-display text-2xl font-extrabold">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <SessionsTable sessions={sessions} />
    </div>
  );
}
