"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  X,
  ExternalLink,
  MessageCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  Paperclip,
  UserCheck,
} from "lucide-react";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import {
  getEmployeeDrawerData,
  getEmployeeApprovals,
  type EmployeeDrawerData,
  type EmployeeApproval,
} from "@/lib/actions/admin-home.actions";
import { reviewLateProof } from "@/lib/actions/attendance.actions";
import { reviewOvertimeRequest } from "@/lib/actions/overtime.actions";
import { approveRegistration } from "@/lib/actions/pending-registrations.actions";
import { normalizePhone } from "@/lib/whatsapp/normalize-phone";
import { formatRp } from "@/lib/cashflow/format";
import { formatTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

export interface DrawerSubject {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  /** Optional secondary line — role / status / pending count summary. */
  caption?: string;
  /** True bila subjek adalah pendaftar baru yang belum di-ACC — drawer
   *  menampilkan banner "Aktifkan akun". */
  pendingRegistration?: boolean;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function formatActivityDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

const STATUS_LABEL: Record<string, string> = {
  on_time: "On time",
  late: "Late",
  late_excused: "Late (excused)",
  flexible: "Flexible",
  absent: "Absent",
};

const STATUS_TONE: Record<string, string> = {
  on_time: "bg-success/15 text-success",
  late: "bg-warning/15 text-warning",
  late_excused: "bg-accent text-[var(--teal-700)]",
  flexible: "bg-accent text-[var(--teal-700)]",
  absent: "bg-destructive/15 text-destructive",
};

/**
 * Slide-in drawer triggered from any clickable employee chip on Home.
 * Replaces the old "click name → /admin/users/<id>" route push so admins
 * can preview without leaving the dashboard.
 */
export function EmployeeDrawer({
  subject,
  onClose,
}: {
  subject: DrawerSubject | null;
  onClose: () => void;
}) {
  // Portal to body so a transform-establishing ancestor (e.g. the page-
  // entrance `animate-fade-up`) doesn't trap our `position: fixed` and
  // anchor the drawer to the document instead of the viewport.
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lazy-load per-employee data + pending approvals when a subject is
  // selected. Both run in parallel.
  const [data, setData] = useState<EmployeeDrawerData | null>(null);
  const [approvals, setApprovals] = useState<EmployeeApproval[]>([]);
  const [loading, setLoading] = useState(false);
  /** Approval item id currently being approved/rejected (disables its row). */
  const [actingId, setActingId] = useState<string | null>(null);
  useEffect(() => {
    if (!subject) {
      setData(null);
      setApprovals([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setData(null);
    setApprovals([]);
    Promise.all([
      getEmployeeDrawerData(subject.userId),
      getEmployeeApprovals(subject.userId),
    ])
      .then(([d, a]) => {
        if (!cancelled) {
          setData(d);
          setApprovals(a);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subject]);

  async function handleApproval(
    item: EmployeeApproval,
    decision: "approved" | "rejected"
  ) {
    setActingId(item.id);
    try {
      const res =
        item.kind === "late_proof"
          ? await reviewLateProof(item.id, decision)
          : await reviewOvertimeRequest(item.id, decision);
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(decision === "approved" ? "Disetujui" : "Ditolak");
      // Optimistically drop the resolved item; refresh so the Home inbox
      // count + list re-render from the server.
      setApprovals((prev) => prev.filter((x) => x.id !== item.id));
      router.refresh();
    } finally {
      setActingId(null);
    }
  }

  const [approvingReg, setApprovingReg] = useState(false);
  async function activateRegistration() {
    if (!subject) return;
    setApprovingReg(true);
    const res = await approveRegistration(subject.userId);
    setApprovingReg(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${subject.fullName} diaktifkan — sekarang bisa login.`);
    router.refresh();
    onClose();
  }

  useEffect(() => {
    if (!subject) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [subject, onClose]);

  if (!subject || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close drawer"
        className="flex-1 bg-foreground/40 backdrop-blur-sm animate-fade-up"
        style={{ animationDuration: "180ms" }}
      />
      <aside
        className="w-[380px] max-w-full bg-card border-l border-border/70 shadow-2xl flex flex-col animate-fade-up"
        style={{ animationDuration: "240ms" }}
      >
        <header className="flex items-center gap-3 px-4 py-3.5 border-b border-border/60">
          <EmployeeAvatar
            size="lg"
            full_name={subject.fullName}
            avatar_url={subject.avatarUrl}
            avatar_seed={subject.avatarSeed}
          />
          <div className="flex-1 min-w-0">
            <div className="font-display font-semibold text-foreground truncate text-[15px] lg:text-base">
              {subject.fullName}
            </div>
            {subject.caption && (
              <div className="text-[11.5px] text-muted-foreground truncate">
                {subject.caption}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid place-items-center size-8 rounded-full hover:bg-muted transition"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 text-[13px]">
          {subject.pendingRegistration && (
            <section className="rounded-xl border-2 border-foreground bg-warning/15 p-3.5 space-y-2.5">
              <div>
                <p className="font-display font-bold text-[13.5px]">
                  Pendaftar baru — belum aktif
                </p>
                <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">
                  Akun ini mendaftar sendiri dan belum bisa login. Setujui untuk
                  mengaktifkan aksesnya.
                </p>
              </div>
              <button
                type="button"
                onClick={activateRegistration}
                disabled={approvingReg}
                className="w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full border-2 border-foreground bg-success text-white text-[12.5px] font-display font-bold shadow-hard-sm hover:-translate-y-0.5 transition disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {approvingReg ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <UserCheck size={14} />
                )}
                Aktifkan akun
              </button>
            </section>
          )}
          {loading || !data ? (
            <div className="grid place-items-center py-10 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : (
            <>
              {approvals.length > 0 && (
                <section>
                  <SectionLabel>
                    Perlu persetujuan ({approvals.length})
                  </SectionLabel>
                  <ul className="space-y-2">
                    {approvals.map((item) => (
                      <ApprovalCard
                        key={item.id}
                        item={item}
                        acting={actingId === item.id}
                        disabled={actingId !== null}
                        onApprove={() => handleApproval(item, "approved")}
                        onReject={() => handleApproval(item, "rejected")}
                      />
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <SectionLabel>Bulan ini</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  <Stat
                    label="On-time rate"
                    value={`${Math.round(data.onTimeRate * 100)}%`}
                    sub={`${data.totalLogs} hari tercatat`}
                  />
                  <Stat
                    label="Hari hadir"
                    value={`${data.presentDays}`}
                    sub={`/ ${data.totalLogs}`}
                  />
                  <Stat
                    label="OT disetujui"
                    value={
                      data.approvedOvertimeMinutes >= 60
                        ? `${(data.approvedOvertimeMinutes / 60).toFixed(1)}j`
                        : `${data.approvedOvertimeMinutes}m`
                    }
                    sub="bulan berjalan"
                  />
                  <Stat
                    label="Slip gaji terakhir"
                    value={
                      data.latestPayslipNet != null
                        ? formatRp(data.latestPayslipNet)
                        : "—"
                    }
                    sub={
                      data.latestPayslipMonth != null
                        ? `${MONTH_LABELS[data.latestPayslipMonth - 1]} ${data.latestPayslipYear}`
                        : "Belum ada"
                    }
                    compact
                  />
                </div>
              </section>

              <section>
                <SectionLabel>Aktivitas terakhir</SectionLabel>
                {data.recentActivity.length === 0 ? (
                  <div className="text-muted-foreground text-[12.5px]">
                    Belum ada log kehadiran.
                  </div>
                ) : (
                  <ul className="divide-y divide-border/50 -mx-1">
                    {data.recentActivity.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-3 px-1 py-2"
                      >
                        <span
                          className={
                            "text-[10px] font-semibold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded " +
                            (STATUS_TONE[a.status] ??
                              "bg-muted text-muted-foreground")
                          }
                        >
                          {STATUS_LABEL[a.status] ?? a.status}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] text-foreground">
                            {formatActivityDate(a.date)}
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            {formatTime(a.checkedInAt)}
                            {a.checkedOutAt
                              ? ` – ${formatTime(a.checkedOutAt)}`
                              : " – masih clock in"}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <footer className="flex items-center gap-2 px-5 py-3 border-t border-border/60 bg-muted/40">
          <Link
            href={`/admin/users/${subject.userId}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full text-[12.5px] font-medium text-white transition hover:brightness-110"
            style={{
              background: "var(--grad-teal)",
              boxShadow: "0 2px 10px rgba(17, 122, 140, 0.32)",
            }}
            onClick={onClose}
          >
            <ExternalLink size={13} />
            Open profile
          </Link>
          <MessageButton
            wa={
              data?.whatsappNumber != null
                ? normalizePhone(data.whatsappNumber)
                : null
            }
            loading={loading}
            fullName={subject.fullName}
          />
        </footer>
      </aside>
    </div>,
    document.body
  );
}

function MessageButton({
  wa,
  loading,
  fullName,
}: {
  wa: string | null;
  loading: boolean;
  fullName: string;
}) {
  const baseClass =
    "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full text-[12.5px] font-medium bg-card border border-border/70";
  if (!wa) {
    return (
      <button
        type="button"
        className={cn(baseClass, "text-muted-foreground/60 cursor-not-allowed")}
        disabled
        title={loading ? "Loading…" : "No WhatsApp number on file"}
      >
        <MessageCircle size={13} />
        Message
      </button>
    );
  }
  return (
    <a
      href={`https://wa.me/${wa}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(baseClass, "hover:bg-muted transition")}
      title={`WhatsApp ${fullName}`}
    >
      <MessageCircle size={13} />
      Message
    </a>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-2">
      {children}
    </div>
  );
}

function formatMinutes(m: number): string {
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? `${h}j ${rem}m` : `${h}j`;
  }
  return `${m}m`;
}

/**
 * One pending-approval row inside the drawer — late proof or overtime —
 * with inline Tolak / Setujui buttons wired by the parent to
 * reviewLateProof / reviewOvertimeRequest.
 */
function ApprovalCard({
  item,
  acting,
  disabled,
  onApprove,
  onReject,
}: {
  item: EmployeeApproval;
  acting: boolean;
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const tag = item.kind === "late_proof" ? "Late proof" : "Overtime";
  const tagTone =
    item.kind === "late_proof"
      ? "bg-warning/15 text-warning"
      : "bg-accent text-[var(--teal-700)]";
  const detail =
    item.kind === "late_proof"
      ? `Telat ${formatMinutes(item.lateMinutes)}`
      : `OT ${formatMinutes(item.minutes)}`;

  // Late-proof photo lives in a private bucket; fetch a short-lived
  // signed URL on demand via the existing admin-gated proof route and
  // open it in a new tab. `item.id` for late_proof is the log id.
  const [loadingProof, setLoadingProof] = useState(false);
  async function viewProof() {
    if (item.kind !== "late_proof") return;
    setLoadingProof(true);
    try {
      const res = await fetch(`/api/attendance/proof?logId=${item.id}`);
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !body.url) {
        toast.error(body.error ?? "Gagal memuat foto bukti.");
        return;
      }
      window.open(body.url, "_blank", "noopener,noreferrer");
    } finally {
      setLoadingProof(false);
    }
  }

  return (
    <li className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span
          className={
            "text-[9.5px] font-semibold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-full " +
            tagTone
          }
        >
          {tag}
        </span>
        <span className="text-[11.5px] text-muted-foreground">
          {formatActivityDate(item.date)}
        </span>
        <span className="ml-auto text-[11.5px] font-medium tabular-nums text-foreground">
          {detail}
        </span>
      </div>
      {item.reason && (
        <p className="text-[12px] italic text-foreground leading-snug">
          &ldquo;{item.reason}&rdquo;
        </p>
      )}
      {item.kind === "late_proof" && item.hasProof && (
        <button
          type="button"
          onClick={viewProof}
          disabled={loadingProof}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
        >
          {loadingProof ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Paperclip size={11} />
          )}
          {loadingProof ? "Memuat…" : "Lihat foto bukti"}
        </button>
      )}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onReject}
          disabled={disabled}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium bg-card border border-border/70 hover:bg-muted transition disabled:opacity-50"
        >
          {acting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <XCircle size={12} />
          )}
          Tolak
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={disabled}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium text-white transition hover:brightness-110 disabled:opacity-50"
          style={{
            background: "var(--grad-teal)",
            boxShadow: "0 2px 10px rgba(17, 122, 140, 0.32)",
          }}
        >
          {acting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <CheckCircle2 size={12} />
          )}
          Setujui
        </button>
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  sub,
  compact,
}: {
  label: string;
  value: string;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <div className="bg-muted/40 border border-border/60 rounded-xl px-3 py-2.5 overflow-hidden">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-display font-semibold text-foreground tabular-nums leading-tight mt-0.5",
          compact ? "text-[14px] whitespace-nowrap" : "text-[20px]"
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10.5px] text-muted-foreground mt-0.5 truncate">
          {sub}
        </div>
      )}
    </div>
  );
}
