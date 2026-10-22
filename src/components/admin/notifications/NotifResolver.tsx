"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, ExternalLink, Loader2, SkipForward, X } from "lucide-react";
import type { PendingConfirmationItem } from "@/lib/actions/pending-confirmations.actions";
import { renewSubscription } from "@/lib/actions/subscriptions.actions";
import { markChecklistReviewed, resolveItemIssue } from "@/lib/actions/cleaning-governance.actions";
import { recordSimTopup } from "@/lib/actions/sim-cards.actions";
import { ownerDecideTicket } from "@/lib/actions/tickets.actions";
import { resolvePayslipDispute } from "@/lib/actions/payslip-disputes.actions";
import { markSelfieOverrideReviewed } from "@/lib/actions/attendance-selfie.actions";
import {
  NOTIF_KINDS,
  NotifLeading,
  notifHref,
  notifTone,
  type NotifKind,
} from "./kinds";
import type { DrawerSubject } from "@/components/admin/home/EmployeeDrawer";

/** Bentuk seragam satu notifikasi untuk popup (dibuat dari item Inbox maupun lonceng). */
export interface ResolverItem {
  id: string;
  kind: NotifKind;
  rowId: string;
  title: string;
  hasPerson: boolean;
  avatarUrl: string | null;
  avatarSeed: string | null;
  /** Teks utama (baris kedua di daftar). */
  desc: string;
  /** Isi lengkap bila lebih panjang dari `desc` (mis. isi dispute / masukan). */
  detail?: string;
  ago: string;
  shortLabel?: string;
  /** Tautan "Buka lengkap" untuk kasus yang butuh halaman penuh. */
  href?: string;
  /** Bila ada, jenis ini diselesaikan lewat drawer karyawan (late proof, lembur, pendaftar). */
  drawer?: DrawerSubject;
}

/** Jenis yang diselesaikan lewat drawer karyawan yang sudah ada. */
export const DRAWER_KINDS: ReadonlySet<NotifKind> = new Set(["late_proof", "overtime", "registration"]);

export function fromPending(p: PendingConfirmationItem, desc: string, ago: string): ResolverItem {
  const drawer: DrawerSubject | undefined = DRAWER_KINDS.has(p.kind)
    ? {
        userId: p.userId,
        fullName: p.employeeName,
        avatarUrl: p.userAvatarUrl,
        avatarSeed: p.userAvatarSeed,
        caption: desc,
        pendingRegistration: p.kind === "registration",
      }
    : undefined;
  return {
    id: `pending-${p.kind}-${p.rowId}`,
    kind: p.kind,
    rowId: p.rowId,
    title: p.employeeName,
    hasPerson: p.hasPerson,
    avatarUrl: p.userAvatarUrl,
    avatarSeed: p.userAvatarSeed,
    desc,
    detail: p.detail,
    ago,
    shortLabel: p.shortLabel,
    href: notifHref(p),
    drawer,
  };
}

const inputCls = "mt-1 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm";
const btnPrimary =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50";
const btnGhost =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border-2 border-border px-3.5 text-sm font-semibold hover:bg-muted disabled:opacity-50";
const btnDanger =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border-2 border-destructive/50 px-3.5 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50";

/**
 * Hook: popup penyelesaian notifikasi. `items` = daftar terurut seperti yang tampil di Inbox /
 * lonceng. Setelah satu item selesai, popup otomatis maju ke item berikutnya yang bisa
 * diselesaikan di popup; item selesai langsung hilang dari daftar (`done`) tanpa menunggu refresh.
 */
export function useNotifResolver(items: ResolverItem[], onOpenDrawer: (s: DrawerSubject) => void) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());

  const queue = useMemo(
    () => items.filter((i) => !done.has(i.id) && !i.drawer),
    [items, done]
  );
  const active = activeId ? items.find((i) => i.id === activeId) ?? null : null;

  const open = useCallback(
    (item: ResolverItem) => {
      if (item.drawer) return onOpenDrawer(item.drawer);
      setActiveId(item.id);
    },
    [onOpenDrawer]
  );

  const close = useCallback(() => setActiveId(null), []);

  const advance = useCallback(
    (fromId: string) => {
      const idx = queue.findIndex((q) => q.id === fromId);
      // Berikutnya = yang tepat setelah item ini; bila di ujung, kembali ke awal.
      const after = idx >= 0 ? [...queue.slice(idx + 1), ...queue.slice(0, idx)] : queue;
      setActiveId(after.find((q) => q.id !== fromId)?.id ?? null);
    },
    [queue]
  );

  const resolved = useCallback(
    (item: ResolverItem) => {
      setDone((s) => new Set(s).add(item.id));
      advance(item.id);
      router.refresh();
    },
    [advance, router]
  );

  const node = active ? (
    <NotifResolver
      key={active.id}
      item={active}
      position={Math.max(0, queue.findIndex((q) => q.id === active.id)) + 1}
      total={queue.length}
      onClose={close}
      onSkip={() => advance(active.id)}
      onResolved={() => resolved(active)}
    />
  ) : null;

  return { open, done, node };
}

function Shell({
  item,
  position,
  total,
  onClose,
  onSkip,
  hideFooterLink,
  children,
}: {
  item: ResolverItem;
  position: number;
  total: number;
  onClose: () => void;
  onSkip: () => void;
  /** Jenis yang tombol utamanya sudah "Buka lengkap": jangan tampilkan tautan kedua. */
  hideFooterLink?: boolean;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  if (!mounted) return null;
  const meta = NOTIF_KINDS[item.kind];
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-foreground/40 p-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={meta.label}
    >
      <div
        className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--foreground)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <NotifLeading
            kind={item.kind}
            tone={notifTone({ kind: item.kind, shortLabel: item.shortLabel })}
            hasPerson={item.hasPerson}
            name={item.title}
            avatarUrl={item.avatarUrl}
            avatarSeed={item.avatarSeed}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {meta.label}
              {total > 1 && (
                <span className="ml-2 tabular-nums">
                  {position} / {total}
                </span>
              )}
            </p>
            <h3 className="font-display text-base font-bold leading-tight">{item.title}</h3>
            <p className="text-[11px] text-muted-foreground">{item.shortLabel ?? item.ago}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X size={16} />
          </button>
        </div>
        {children}
        <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
          {item.href && !hideFooterLink ? (
            <Link
              href={item.href}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
            >
              <ExternalLink size={12} /> Buka lengkap
            </Link>
          ) : (
            <span />
          )}
          {total > 1 && (
            <button
              type="button"
              onClick={onSkip}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Lewati <SkipForward size={12} />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Foto selfie absen (bucket privat → URL bertanda tangan dari /api/attendance/selfie). */
function SelfiePhoto({ logId }: { logId: string }) {
  const [state, setState] = useState<{ url: string } | { error: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/attendance/selfie?logId=${encodeURIComponent(logId)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        setState(res.ok && body.url ? { url: body.url } : { error: res.status === 404 ? "Foto sudah tidak tersedia." : "Foto gagal dimuat." });
      })
      .catch(() => !cancelled && setState({ error: "Foto gagal dimuat." }));
    return () => {
      cancelled = true;
    };
  }, [logId]);

  if (!state) return <div className="h-56 animate-pulse rounded-xl bg-muted" />;
  if ("error" in state) {
    return <p className="rounded-xl bg-muted px-3 py-6 text-center text-xs text-muted-foreground">{state.error}</p>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL bertanda tangan sementara, bukan aset statis
    <img src={state.url} alt="Selfie absen" className="max-h-72 w-full rounded-xl border border-border object-contain bg-muted" />
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2.5 text-[13px] leading-relaxed">{children}</div>;
}

function NotifResolver({
  item,
  position,
  total,
  onClose,
  onSkip,
  onResolved,
}: {
  item: ResolverItem;
  position: number;
  total: number;
  onClose: () => void;
  onSkip: () => void;
  onResolved: () => void;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [d1, setD1] = useState("");
  const [d2, setD2] = useState("");
  const [amount, setAmount] = useState("");
  const [rejecting, setRejecting] = useState(false);

  /** Jalankan aksi; sukses → toast + maju ke berikutnya, gagal → toast error (popup tetap terbuka). */
  const run = (fn: () => Promise<string | null>, okMsg: string) =>
    start(async () => {
      const err = await fn();
      if (err) return void toast.error(err);
      toast.success(okMsg);
      onResolved();
    });

  // Awalan jenis ("Kendala/masukan SOP — ") sudah tampil di judul popup: jangan diulang.
  const text = (item.detail ?? item.desc).replace("Kendala/masukan SOP — ", "");
  const linkOnly = !(["subscription", "sop_review", "sop_issue", "sim_card", "ticket", "dispute", "selfie_override"] as string[]).includes(item.kind);
  let content: React.ReactNode;

  switch (item.kind) {
    case "subscription":
      content = (
        <>
          <Body>
            <p>{text}</p>
            <p className="text-muted-foreground">
              Tekan <b>Perpanjang</b> bila sudah dibayar — tanggal pembaruan maju satu siklus.
            </p>
          </Body>
          <button
            type="button"
            disabled={pending}
            className={`${btnPrimary} w-full`}
            onClick={() =>
              run(async () => {
                const r = await renewSubscription(item.rowId);
                return r.ok ? null : r.error;
              }, "Diperpanjang")
            }
          >
            {pending && <Loader2 size={14} className="animate-spin" />} Perpanjang
          </button>
        </>
      );
      break;

    case "sop_review":
      content = (
        <>
          <Body>
            <p>{text}</p>
          </Body>
          <label className="block text-xs font-medium">
            Catatan tinjauan (opsional)
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </label>
          <button
            type="button"
            disabled={pending}
            className={`${btnPrimary} w-full`}
            onClick={() =>
              run(async () => {
                const r = await markChecklistReviewed({ id: item.rowId, note: note || null });
                return r.ok ? null : r.error;
              }, "SOP ditandai sudah ditinjau")
            }
          >
            {pending && <Loader2 size={14} className="animate-spin" />} Tandai sudah ditinjau
          </button>
        </>
      );
      break;

    case "sop_issue":
      content = (
        <>
          <Body>
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">{text}</p>
            <p className="text-muted-foreground">
              Bila masukannya benar dan SOP perlu diubah, buka lengkap (SOP ikut diperbaiki dari sana).
              Kalau tidak perlu tindakan, tutup di sini.
            </p>
          </Body>
          <label className="block text-xs font-medium">
            Catatan penutupan (opsional)
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </label>
          <button
            type="button"
            disabled={pending}
            className={`${btnPrimary} w-full`}
            onClick={() =>
              run(async () => {
                const r = await resolveItemIssue({ id: item.rowId, note: note || null });
                return r.ok ? null : r.error;
              }, "Masukan ditutup")
            }
          >
            {pending && <Loader2 size={14} className="animate-spin" />} Tutup masukan
          </button>
        </>
      );
      break;

    case "sim_card":
      content = (
        <>
          <Body>
            <p>{text}</p>
            <p className="text-muted-foreground">Catat isi pulsa dengan masa aktif baru. Bukti screenshot opsional.</p>
          </Body>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium">
              Masa aktif baru *
              <input type="date" className={inputCls} value={d1} onChange={(e) => setD1(e.target.value)} />
            </label>
            <label className="block text-xs font-medium">
              Masa tenggang baru
              <input type="date" className={inputCls} value={d2} min={d1 || undefined} onChange={(e) => setD2(e.target.value)} />
            </label>
          </div>
          <label className="block text-xs font-medium">
            Nominal (opsional)
            <input
              className={inputCls}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            />
          </label>
          <button
            type="button"
            disabled={pending || !d1}
            className={`${btnPrimary} w-full`}
            onClick={() =>
              run(async () => {
                const r = await recordSimTopup({
                  simCardId: item.rowId,
                  newActiveUntil: d1,
                  newGraceUntil: d2 || null,
                  amountIdr: amount ? Number(amount) : null,
                });
                return r.ok ? null : r.error;
              }, "Isi pulsa tercatat")
            }
          >
            {pending && <Loader2 size={14} className="animate-spin" />} Simpan isi pulsa
          </button>
        </>
      );
      break;

    case "ticket":
      content = (
        <>
          <Body>
            <p>{text}</p>
            <p className="text-muted-foreground">
              Terima eskalasi bila owner yang menangani, atau kembalikan ke tim studio dengan catatan.
            </p>
          </Body>
          {rejecting && (
            <label className="block text-xs font-medium">
              Catatan penolakan (wajib)
              <textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          )}
          <div className="flex gap-2">
            {!rejecting ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  className={`${btnPrimary} flex-1`}
                  onClick={() =>
                    run(async () => {
                      const r = await ownerDecideTicket(item.rowId, "accept");
                      return r.ok ? null : r.error;
                    }, "Eskalasi diterima")
                  }
                >
                  {pending && <Loader2 size={14} className="animate-spin" />} Terima
                </button>
                <button type="button" disabled={pending} className={`${btnDanger} flex-1`} onClick={() => setRejecting(true)}>
                  Tolak…
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={pending} className={btnGhost} onClick={() => setRejecting(false)}>
                  Batal
                </button>
                <button
                  type="button"
                  disabled={pending || note.trim().length < 3}
                  className={`${btnDanger} flex-1`}
                  onClick={() =>
                    run(async () => {
                      const r = await ownerDecideTicket(item.rowId, "reject", note);
                      return r.ok ? null : r.error;
                    }, "Eskalasi ditolak")
                  }
                >
                  {pending && <Loader2 size={14} className="animate-spin" />} Kirim penolakan
                </button>
              </>
            )}
          </div>
        </>
      );
      break;

    case "dispute":
      content = (
        <>
          <Body>
            <p className="rounded-xl bg-muted px-3 py-2">{text}</p>
          </Body>
          <label className="block text-xs font-medium">
            Balasan untuk karyawan (opsional)
            <textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              className={`${btnPrimary} flex-1`}
              onClick={() =>
                run(async () => {
                  const r = await resolvePayslipDispute({ id: item.rowId, status: "resolved", adminResponse: note });
                  return "error" in r ? r.error : null;
                }, "Dispute diselesaikan")
              }
            >
              {pending && <Loader2 size={14} className="animate-spin" />} Selesai
            </button>
            <button
              type="button"
              disabled={pending}
              className={`${btnDanger} flex-1`}
              onClick={() =>
                run(async () => {
                  const r = await resolvePayslipDispute({ id: item.rowId, status: "dismissed", adminResponse: note });
                  return "error" in r ? r.error : null;
                }, "Dispute ditolak")
              }
            >
              Tolak
            </button>
          </div>
        </>
      );
      break;

    case "selfie_override":
      content = (
        <>
          <Body>
            <p>{text}</p>
            <SelfiePhoto logId={item.rowId} />
            <p className="text-muted-foreground">
              Karyawan tetap absen walau foto ditolak AI. Periksa fotonya di atas, lalu tandai ditinjau bila
              sudah dicek.
            </p>
          </Body>
          <button
            type="button"
            disabled={pending}
            className={`${btnPrimary} w-full`}
            onClick={() =>
              run(async () => {
                const r = await markSelfieOverrideReviewed([item.rowId]);
                return r.error ?? null;
              }, "Ditandai sudah ditinjau")
            }
          >
            {pending && <Loader2 size={14} className="animate-spin" />} Sudah ditinjau
          </button>
        </>
      );
      break;

    default:
      // task_review & lainnya: kasus rumit (banyak foto / item) → halaman penuh.
      content = (
        <>
          <Body>
            <p>{text}</p>
            <p className="text-muted-foreground">Jenis ini diperiksa per item dengan foto — selesaikan di halaman lengkapnya.</p>
          </Body>
          {item.href && (
            <Link href={item.href} className={`${btnPrimary} w-full`}>
              Buka lengkap <ArrowRight size={14} />
            </Link>
          )}
        </>
      );
  }

  return (
    <Shell item={item} position={position} total={total} onClose={onClose} onSkip={onSkip} hideFooterLink={linkOnly}>
      {content}
    </Shell>
  );
}
