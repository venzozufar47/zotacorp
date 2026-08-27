"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { PendingConfirmationsBell } from "./PendingConfirmationsBell";
import { AdminBackButton } from "./AdminBackButton";
import { QuickActionsMenu } from "@/components/admin/QuickActionsMenu";
import type { PendingConfirmationItem } from "@/lib/actions/pending-confirmations.actions";

/**
 * Admin top bar — Shell A.
 *
 * Layout: breadcrumbs (left) · spacer · date pill · refresh · bell · quick action.
 * Quick action is a placeholder (no dropdown wiring yet — kept as visual cue).
 */
export function AdminTopbar({
  pendingConfirmations,
}: {
  pendingConfirmations: PendingConfirmationItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  const crumbs = useMemo(() => deriveCrumbs(pathname), [pathname]);
  const dateLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, []);

  return (
    <div
      className="hidden md:flex h-[60px] items-center gap-3.5 px-7 border-b border-border/70 sticky top-0 z-30"
      style={{
        background: "rgba(251, 251, 249, 0.7)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <AdminBackButton />

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-[12.5px] font-medium text-muted-foreground">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span className="text-muted-foreground/50" aria-hidden>
                /
              </span>
            )}
            <span
              className={
                i === crumbs.length - 1
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              }
            >
              {c}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        <span className="hidden lg:inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-card border border-border/70 text-[11.5px] font-medium text-foreground/80 shadow-sm">
          {dateLabel}
        </span>
        <button
          type="button"
          onClick={() => startRefresh(() => router.refresh())}
          className="grid place-items-center size-9 rounded-[11px] bg-card border border-border/70 hover:bg-muted transition shadow-sm disabled:opacity-60"
          disabled={refreshing}
          title="Refresh"
        >
          <RefreshCw
            size={15}
            className={refreshing ? "animate-spin" : ""}
            strokeWidth={1.8}
          />
        </button>
        <PendingConfirmationsBell
          items={pendingConfirmations}
          variant="compact"
        />
        <QuickActionsMenu />
      </div>
    </div>
  );
}

/**
 * UUIDs (v4 format from Supabase) and other id-shaped segments are
 * noise in a breadcrumb — every detail page has its own H1. Drop them.
 */
const ID_SHAPED =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deriveCrumbs(pathname: string): string[] {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0 || segs[0] !== "admin") return ["Admin"];
  if (segs.length === 1) return ["Admin", "Home"];
  // Mirrors the nav taxonomy in `@/lib/nav/admin-nav`. Segments missing
  // here fall through to `capitalize()` and surface as raw slugs
  // ("Stock-gate", "Sim-cards"), so keep this in step when adding routes.
  const labelMap: Record<string, string> = {
    // Operasional
    attendance: "Attendance",
    "stock-gate": "Gate Absen Pulang",
    cleaning: "Kebersihan",
    tickets: "Tiket Studio",
    // Karyawan
    users: "Users",
    payslips: "Slip Gaji",
    variables: "Variables",
    "employment-contracts": "Kontrak Kerja",
    disc: "Tes DISC",
    celebrations: "Monitoring Karyawan",
    // Keuangan
    finance: "Finance",
    pnl: "Profit & Loss",
    assignments: "Assignment Queue",
    employees: "Mapping Karyawan",
    rekening: "Rekening",
    statements: "Statements",
    aturan: "Aturan",
    dividen: "Dividen",
    costing: "HPP / Costing",
    bahan: "Master Bahan",
    dashboard: "Dashboard Margin",
    investors: "Investor",
    // Unit Bisnis
    "cake-orders": "Pesanan Cake",
    options: "Opsi Form",
    access: "Akses Karyawan",
    "yeobo-booth": "Yeobo Booth",
    calendar: "Kalender",
    bookings: "Booking",
    laporan: "Laporan",
    freelance: "Freelance",
    admins: "Akses Admin",
    // Sistem
    locations: "Locations",
    "sim-cards": "Kartu SIM",
    intercom: "Intercom",
    settings: "Settings",
    backups: "Backups",
  };
  return [
    "Admin",
    ...segs
      .slice(1)
      .filter((s) => !ID_SHAPED.test(s))
      .map((s) => labelMap[s] ?? capitalize(s)),
  ];
}

function capitalize(s: string) {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
