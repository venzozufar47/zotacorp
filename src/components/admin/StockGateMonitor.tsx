"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  KeyRound,
  Lock,
  LockOpen,
  RefreshCw,
  X,
} from "lucide-react";
import type { StockGateMonitor as MonitorData } from "@/lib/actions/stock-opname-monitor.actions";
import { formatTime } from "@/lib/utils/date";

/**
 * Panel monitor gate "absen pulang" untuk superadmin.
 *
 * Gate-nya berjalan diam-diam di server; panel ini membuatnya kasat mata:
 * apakah konfigurasinya sehat, status opname tiap cabang hari ini (hasil
 * probe langsung ke API Yeobo Space), dan siapa yang hari ini terdampak.
 */
export function StockGateMonitor({ data }: { data: MonitorData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const gatedToday = data.employees.filter((e) => e.gated);
  const blocked = gatedToday.filter((e) => !e.canCheckOut && !e.checkedOutAt);

  return (
    <div className="space-y-5">
      {/* Ringkasan paling penting: apakah gate benar-benar bisa bekerja. */}
      {!data.config.apiKeySet && (
        <div className="rounded-2xl border-2 border-destructive bg-destructive/10 p-4 space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle size={16} />
            STOCK_STATUS_API_KEY belum di-set
          </p>
          <p className="text-xs text-foreground">
            Status opname tidak bisa diverifikasi. Karena mode{" "}
            <strong>fail-closed</strong>, semua karyawan dalam cakupan gate
            akan <strong>ditolak absen pulang</strong>. Set env var ini di
            Vercel (nilai sama dengan project yeobospace), lalu redeploy.
          </p>
        </div>
      )}

      {/* 1. Konfigurasi */}
      <section className="rounded-2xl border-2 border-foreground bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-display font-semibold text-base text-foreground">
            Konfigurasi sistem
          </h2>
          <button
            type="button"
            onClick={() => startTransition(() => router.refresh())}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-foreground bg-card text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
            {pending ? "Memeriksa..." : "Periksa ulang"}
          </button>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <ConfigRow
            icon={<KeyRound size={13} />}
            label="API key"
            value={data.config.apiKeySet ? "Terpasang" : "Belum di-set"}
            tone={data.config.apiKeySet ? "good" : "bad"}
          />
          <ConfigRow
            icon={
              data.config.failOpen ? <LockOpen size={13} /> : <Lock size={13} />
            }
            label="Mode saat gagal verifikasi"
            value={
              data.config.failOpen
                ? "Fail-open — diloloskan"
                : "Fail-closed — ditolak"
            }
            tone={data.config.failOpen ? "warn" : "good"}
          />
        </dl>

        <div className="pt-1 space-y-1 text-[11px] text-muted-foreground">
          <p>
            Sumber status:{" "}
            <code className="text-foreground">{data.config.endpoint}</code>
          </p>
          <p>
            Cakupan: karyawan <strong>Yeobo Space</strong> berjabatan{" "}
            <strong>{data.config.gatedRoles.join(" · ")}</strong> yang hari itu
            sign-in di salah satu {data.config.studioLocationCount} geofence
            studio. Cabang ditentukan dari lokasi sign-in, bukan jadwal shift.
          </p>
        </div>
      </section>

      {/* 2. Status opname per cabang hari ini */}
      <section className="rounded-2xl border-2 border-foreground bg-card overflow-hidden">
        <div className="px-4 py-3 border-b-2 border-foreground bg-muted/30 flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="font-display font-semibold text-base text-foreground">
            Status opname hari ini
          </h2>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {data.date}
          </span>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {data.branches.map((b) => (
            <div
              key={b.branchId}
              className="rounded-xl border-2 border-border bg-background p-3 space-y-2"
            >
              <p className="font-semibold text-sm text-foreground">{b.label}</p>
              <StatusBadge state={b.state} />
              {b.errorLabel && (
                <p className="text-[11px] text-destructive">{b.errorLabel}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 3. Dampak nyata hari ini */}
      <section className="rounded-2xl border-2 border-foreground bg-card overflow-hidden">
        <div className="px-4 py-3 border-b-2 border-foreground bg-muted/30">
          <h2 className="font-display font-semibold text-base text-foreground">
            Terdampak hari ini
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Karyawan yang sign-in di geofence studio.{" "}
            {gatedToday.length} kena gate
            {blocked.length > 0 && (
              <>
                {" · "}
                <strong className="text-destructive">
                  {blocked.length} belum bisa absen pulang
                </strong>
              </>
            )}
          </p>
        </div>

        {data.employees.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Belum ada yang sign-in di studio hari ini.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.employees.map((e) => (
              <li
                key={e.userId}
                className="p-3 sm:p-4 flex items-center gap-3 flex-wrap"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-foreground">
                      {e.fullName}
                    </span>
                    <span className="text-[11px] uppercase tracking-wide rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">
                      {e.jobRole ?? "tanpa jabatan"}
                    </span>
                    <span className="text-[11px] rounded-full border border-border bg-background px-2 py-0.5 text-muted-foreground">
                      {e.branchLabel}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                    Masuk {formatTime(e.checkedInAt)}
                    {e.checkedOutAt
                      ? ` · Pulang ${formatTime(e.checkedOutAt)}`
                      : " · belum absen pulang"}
                    {e.blockedReason && !e.checkedOutAt && (
                      <span className="text-destructive">
                        {" "}
                        · {e.blockedReason}
                      </span>
                    )}
                  </p>
                </div>
                <GateBadge
                  gated={e.gated}
                  canCheckOut={e.canCheckOut}
                  done={!!e.checkedOutAt}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-muted-foreground">
        Terakhir diperiksa:{" "}
        {new Date(data.checkedAt).toLocaleString("id-ID", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </p>
    </div>
  );
}

function ConfigRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "good" | "warn" | "bad";
}) {
  const toneCls =
    tone === "good"
      ? "bg-success/15 text-success border-success/30"
      : tone === "warn"
        ? "bg-warning/20 text-foreground border-warning"
        : "bg-destructive/15 text-destructive border-destructive/40";
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-border bg-background px-3 py-2">
      <dt className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd
        className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border ${toneCls}`}
      >
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({ state }: { state: "submitted" | "pending" | "error" }) {
  if (state === "submitted")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success border border-success/30 px-2 py-0.5 text-[11px] font-semibold">
        <Check size={11} strokeWidth={3} /> Sudah opname
      </span>
    );
  if (state === "pending")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 text-foreground border border-warning px-2 py-0.5 text-[11px] font-semibold">
        <AlertTriangle size={11} /> Belum opname
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive border border-destructive/40 px-2 py-0.5 text-[11px] font-semibold">
      <X size={11} strokeWidth={3} /> Tak terverifikasi
    </span>
  );
}

function GateBadge({
  gated,
  canCheckOut,
  done,
}: {
  gated: boolean;
  canCheckOut: boolean;
  done: boolean;
}) {
  if (!gated)
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border border-border bg-muted text-muted-foreground">
        Di luar cakupan
      </span>
    );
  if (done)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full border border-border bg-background text-muted-foreground">
        Sudah pulang
      </span>
    );
  return canCheckOut ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-success/15 text-success border border-success/30">
      <Check size={11} strokeWidth={3} /> Boleh pulang
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-destructive/15 text-destructive border border-destructive/40">
      <Lock size={11} /> Diblokir
    </span>
  );
}
