"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Mail, Building2, FileText, UserPlus, Loader2 } from "lucide-react";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { EmptyState } from "@/components/shared/EmptyState";
import { InvestorEditPanel } from "./InvestorEditPanel";
import {
  inviteInvestor,
  type InvestorSummary,
  type InvestorContract,
} from "@/lib/actions/investor.actions";

interface Props {
  investors: InvestorSummary[];
  contracts: InvestorContract[];
}

/**
 * Read-mostly list of investor accounts (role=investor profiles). The
 * investor management surfaces (contracts / payouts / metrics) live in
 * sibling tabs — this tab answers "who are my investors" with name,
 * email, assigned business units, and a contract count, plus a link to
 * the full profile editor (shared `/admin/users/[id]` route).
 */
export function InvestorAccountsList({ investors, contracts }: Props) {
  const [editing, setEditing] = useState<InvestorSummary | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Count contracts per investor for the badge.
  const contractCount = new Map<string, number>();
  for (const c of contracts) {
    contractCount.set(c.userId, (contractCount.get(c.userId) ?? 0) + 1);
  }

  // When the edit panel is open it occupies a real right-hand column
  // (not a floating overlay), so the card grid narrows to fewer columns
  // to make room — same pattern as the cake-orders board.
  const gridCols = editing
    ? "grid grid-cols-1 lg:grid-cols-2 gap-3"
    : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3";

  const header = (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <p className="text-xs text-muted-foreground">
        {investors.length} akun investor terdaftar.
      </p>
      <button
        type="button"
        onClick={() => setInviteOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
      >
        <UserPlus size={14} /> Undang Investor
      </button>
    </div>
  );

  if (investors.length === 0) {
    return (
      <div className="space-y-3">
        {header}
        <EmptyState
          title="Belum ada investor"
          description="Undang investor lewat tombol di atas — mereka akan menerima email untuk membuat password sendiri."
        />
        {inviteOpen && <InviteInvestorModal onClose={() => setInviteOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {header}
      <div className="flex gap-4 items-start">
      <div className="flex-1 min-w-0 space-y-2">
      <ul className={gridCols}>
        {investors.map((inv) => {
          const nContracts = contractCount.get(inv.userId) ?? 0;
          return (
            <li
              key={inv.userId}
              className="rounded-2xl border-2 border-foreground bg-card p-4 space-y-3 card-wiggle"
            >
              <div className="flex items-start gap-3">
                <EmployeeAvatar
                  size="default"
                  id={inv.userId}
                  full_name={inv.fullName ?? ""}
                  avatar_url={null}
                  avatar_seed={null}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold text-sm truncate">
                      {inv.fullName || "—"}
                    </span>
                    <span className="text-[10px] font-display font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border-2 border-foreground bg-primary/15 text-foreground">
                      Investor
                    </span>
                  </div>
                  {inv.email && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate mt-0.5">
                      <Mail size={11} className="shrink-0" />
                      <span className="truncate">{inv.email}</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(inv)}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Edit profil investor"
                  title="Edit profil investor"
                >
                  <Pencil size={15} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Building2 size={12} className="text-muted-foreground shrink-0" />
                {inv.businessUnits.length === 0 ? (
                  <span className="text-[11px] italic text-muted-foreground">
                    Belum di-assign ke BU
                  </span>
                ) : (
                  inv.businessUnits.map((bu) => (
                    <span
                      key={bu}
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-foreground/20 bg-muted text-foreground"
                    >
                      {bu}
                    </span>
                  ))
                )}
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                <FileText size={12} className="shrink-0" />
                {nContracts === 0 ? (
                  <span className="italic">Belum ada kontrak</span>
                ) : (
                  <span>
                    {nContracts} kontrak aktif
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      </div>

      {/* Desktop: in-flow sticky right column — part of the layout,
          pushes the grid instead of floating over it. */}
      {editing && (
        <aside className="hidden md:flex flex-col w-[480px] xl:w-[600px] shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)] rounded-2xl border-2 border-foreground bg-card shadow-lg overflow-hidden">
          <InvestorEditPanel
            investor={editing}
            contracts={contracts}
            onClose={() => setEditing(null)}
          />
        </aside>
      )}

      {/* Mobile: full-screen overlay (no room for a side column). */}
      {editing && (
        <div
          className="fixed inset-0 z-50 bg-background md:hidden flex flex-col"
          role="dialog"
          aria-modal="true"
        >
          <InvestorEditPanel
            investor={editing}
            contracts={contracts}
            onClose={() => setEditing(null)}
          />
        </div>
      )}
      </div>

      {inviteOpen && <InviteInvestorModal onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

/** Invite-by-email modal: admin enters email + name → inviteInvestor →
 *  the invitee gets an email to set their password. */
function InviteInvestorModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  function submit() {
    if (!email.trim() || !fullName.trim()) {
      toast.error("Email dan nama wajib diisi");
      return;
    }
    startTransition(async () => {
      const res = await inviteInvestor({ email, fullName });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal mengirim undangan");
        return;
      }
      toast.success(`Undangan terkirim ke ${res.data?.email ?? email}`);
      onClose();
      router.refresh();
    });
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card border border-border p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Undang investor
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Investor akan menerima email berisi link untuk membuat password
            sendiri. Setelah login, assign unit bisnis & kontraknya lewat tab
            Akun / Kontrak.
          </p>
        </div>
        <label className="text-xs block">
          <span className="text-muted-foreground">Nama lengkap</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nama investor"
            className="block mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs block">
          <span className="text-muted-foreground">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="investor@email.com"
            inputMode="email"
            autoComplete="off"
            className="block mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-9 px-3 rounded-lg border border-border text-sm font-semibold"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Kirim undangan
          </button>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
