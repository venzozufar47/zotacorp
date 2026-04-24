"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import {
  Upload,
  Pencil,
  Trash2,
  Wand2,
  RefreshCw,
  MapPin,
  Users,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadStatementDialog } from "./UploadStatementDialog";
import { ManualTransactionDialog } from "./ManualTransactionDialog";
import { AssignUsersDialog } from "./AssignUsersDialog";
import { CustomCategoriesDialog } from "./CustomCategoriesDialog";
import { deleteBankAccount, syncCashSheet } from "@/lib/actions/cashflow.actions";
import type { BankCode } from "@/lib/cashflow/types";
import type { CategoryPresets } from "@/lib/cashflow/categories";

interface Account {
  id: string;
  accountName: string;
  bank: BankCode;
  businessUnit: string;
  pdfPassword: string | null;
  /** Set when this rekening pulls data live from a Google Sheet. */
  sourceUrl: string | null;
  sourceSheet: string | null;
  lastSyncedAt: string | null;
  /** Cabang inherent to this rekening (e.g. cash register for
   *  Semarang store → "Semarang"). When set, row-level branch
   *  dropdowns are hidden and every tx gets this value. */
  defaultBranch: string | null;
  /** Current effective category dropdown for this rekening — either
   *  the admin-curated list or the preset default. Used to pre-fill
   *  the "Atur kategori" dialog so admin sees the current state. */
  customCategories: string[];
  /** POS-enabled → boleh assign user dengan scope 'pos_only'. */
  posEnabled: boolean;
}

interface Props {
  account: Account;
  presets: CategoryPresets;
  /** Gates destructive/privileged buttons (Hapus, Atur aturan,
   *  Assign). Non-admin assignees can see + edit transactions but
   *  cannot manage the rekening itself. */
  isAdmin: boolean;
}

/**
 * Thin client wrapper that hosts the Upload/Input manual buttons plus
 * the dialogs they drive. Feature set is per-rekening ("profile"):
 * e.g. cash rekening hides Upload, Sync, Atur aturan, and the branch
 * column — the workflow there is purely manual entry with a fixed
 * cabang inherited from `defaultBranch`.
 */
export function RekeningDetailClient({ account, presets, isAdmin }: Props) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pending, startTransition] = useTransition();

  // Per-rekening profile flags.
  const isCash = account.bank === "cash";
  const hasSheetSource =
    !isCash && Boolean(account.sourceUrl && account.sourceSheet);
  const showUploadButton = !isCash && !hasSheetSource;
  // Admin-only manage buttons: rules, delete, assign. Non-admin
  // assignees get Input manual + CashflowTable edit mode only.
  const showRulesLink = isAdmin && !isCash;
  // Tombol assign muncul kalau admin + rekening bisa di-delegasikan
  // (cash untuk scope full, atau pos_enabled untuk scope pos_only).
  const showAssignButton = isAdmin && (isCash || account.posEnabled);
  const showEditCategoriesButton = isAdmin && isCash;
  const showDeleteButton = isAdmin;

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await syncCashSheet(account.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { added, skipped, fetched } = res.data!;
      toast.success(
        `Sync selesai — ${added} transaksi baru, ${skipped} duplikat di-skip (${fetched} row di-fetch).`
      );
      router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  function handleDelete() {
    if (
      !confirm(
        `Hapus rekening "${account.accountName}" beserta semua transaksinya? Tidak bisa di-undo.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteBankAccount(account.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Rekening dihapus");
      router.push("/admin/finance");
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {hasSheetSource && (
        <Button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="gap-1.5"
          size="sm"
        >
          <RefreshCw size={14} className={syncing ? "animate-spin" : undefined} />
          {syncing ? "Menyinkronkan…" : "Sync dari Sheet"}
        </Button>
      )}
      {showUploadButton && (
        <Button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="gap-1.5"
          size="sm"
        >
          <Upload size={14} />
          {account.bank === "mandiri"
            ? "Upload Excel"
            : account.bank === "jago"
            ? "Upload CSV"
            : "Upload PDF"}
        </Button>
      )}
      {/* Cash rekening flows through the inline "Tambah baris" in the
          table's edit mode (mirrors how rules are added inline), so the
          dialog button is redundant there. Keep it for non-cash rekening
          where the inline add still requires this entry point. */}
      {!isCash && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setManualOpen(true)}
          className="gap-1.5"
          size="sm"
        >
          <Pencil size={14} />
          Input manual
        </Button>
      )}
      {hasSheetSource && account.lastSyncedAt && (
        <span className="text-[11px] text-muted-foreground">
          Terakhir sync:{" "}
          {new Date(account.lastSyncedAt).toLocaleString("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      )}
      {isCash && account.defaultBranch && (
        <span className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full bg-primary/10 text-primary text-xs font-semibold">
          <MapPin size={12} />
          Cabang: {account.defaultBranch}
        </span>
      )}
      {showRulesLink && (
        <Link
          href={`/admin/finance/rekening/${account.id}/aturan`}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition"
        >
          <Wand2 size={14} />
          Atur aturan kategorisasi
        </Link>
      )}
      {showEditCategoriesButton && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setCategoriesOpen(true)}
          className="gap-1.5"
          size="sm"
        >
          <ListChecks size={14} />
          Atur kategori
        </Button>
      )}
      {showAssignButton && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setAssignOpen(true)}
          className="gap-1.5"
          size="sm"
        >
          <Users size={14} />
          Assign karyawan
        </Button>
      )}
      {/* Push delete to the far right so it's separated from the
          primary actions — admin doesn't trip on it accidentally. */}
      {showDeleteButton && (
        <Button
          type="button"
          variant="ghost"
          onClick={handleDelete}
          disabled={pending}
          className="gap-1.5 text-destructive hover:bg-destructive/10 ml-auto"
          size="sm"
        >
          <Trash2 size={14} />
          Hapus rekening
        </Button>
      )}

      {showAssignButton && (
        <AssignUsersDialog
          bankAccountId={account.id}
          accountName={account.accountName}
          bank={account.bank}
          posEnabled={account.posEnabled}
          open={assignOpen}
          onOpenChange={setAssignOpen}
        />
      )}

      {showEditCategoriesButton && (
        <CustomCategoriesDialog
          bankAccountId={account.id}
          accountName={account.accountName}
          initialCategories={account.customCategories}
          open={categoriesOpen}
          onOpenChange={setCategoriesOpen}
        />
      )}

      <UploadStatementDialog
        account={uploadOpen ? account : null}
        presets={presets}
        onOpenChange={(open) => !open && setUploadOpen(false)}
      />
      {!isCash && (
        <ManualTransactionDialog
          account={manualOpen ? account : null}
          presets={presets}
          onOpenChange={(open) => !open && setManualOpen(false)}
        />
      )}
    </div>
  );
}
