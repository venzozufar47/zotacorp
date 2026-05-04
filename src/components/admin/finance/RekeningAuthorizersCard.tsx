"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, KeyRound } from "lucide-react";
import {
  setRekeningAuthorizers,
  type RekeningAuthorizerCandidate,
  type RekeningAuthorizers,
} from "@/lib/actions/cashflow.actions";
import { adminResetPosPin } from "@/lib/actions/pos-pin.actions";
import { cn } from "@/lib/utils";

interface Props {
  bankAccountId: string;
  initial: RekeningAuthorizers;
  candidates: RekeningAuthorizerCandidate[];
}

const ROWS = [
  {
    key: "productionUserId",
    label: "Produksi",
    description: "Otorisasi setiap entry produksi.",
  },
  {
    key: "withdrawalUserId",
    label: "Penarikan",
    description: "Otorisasi setiap penarikan stok.",
  },
  {
    key: "opnameUserId",
    label: "Opname",
    description: "Otorisasi submit stock opname.",
  },
] as const;

/**
 * Admin assigns one PIN-authorizer per non-sales POS operation. The
 * dropdown only lists current rekening assignees so admin can't pick
 * an unrelated user. Authorizers without a PIN show a "(belum set
 * PIN)" tag — they can't actually authorize until they set theirs.
 */
export function RekeningAuthorizersCard({
  bankAccountId,
  initial,
  candidates,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resetPending, startReset] = useTransition();
  const [values, setValues] = useState<RekeningAuthorizers>(initial);

  function update(key: keyof RekeningAuthorizers, value: string) {
    setValues((prev) => ({
      ...prev,
      [key]: value === "" ? null : value,
    }));
  }

  function save() {
    startTransition(async () => {
      const res = await setRekeningAuthorizers({
        bankAccountId,
        productionUserId: values.productionUserId,
        withdrawalUserId: values.withdrawalUserId,
        opnameUserId: values.opnameUserId,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Otorisasi POS tersimpan.");
      router.refresh();
    });
  }

  function resetPin(userId: string, fullName: string) {
    if (
      !window.confirm(
        `Reset PIN POS untuk ${fullName}? Mereka harus set PIN baru di /profile.`
      )
    ) {
      return;
    }
    startReset(async () => {
      const res = await adminResetPosPin({ userId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("PIN direset. Karyawan harus set PIN baru.");
      router.refresh();
    });
  }

  const dirty =
    values.productionUserId !== initial.productionUserId ||
    values.withdrawalUserId !== initial.withdrawalUserId ||
    values.opnameUserId !== initial.opnameUserId;

  const candidateById = new Map(candidates.map((c) => [c.userId, c]));

  return (
    <section
      className="rounded-2xl border border-border/70 bg-card p-5"
      style={{
        boxShadow:
          "0 1px 2px rgba(8, 49, 46, 0.04), 0 4px 16px rgba(8, 49, 46, 0.05)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={16} className="text-[var(--teal-600)]" />
        <h2 className="font-display font-semibold text-foreground">
          Otorisasi POS
        </h2>
      </div>
      <p className="text-[12.5px] text-muted-foreground mb-4">
        Tetapkan satu karyawan yang harus memasukkan PIN untuk setiap
        operasi non-penjualan. Kosongkan kalau operasi tidak butuh otorisasi.
      </p>

      {candidates.length === 0 ? (
        <p className="text-[13px] text-muted-foreground italic">
          Belum ada karyawan yang ditugaskan ke rekening ini. Tambahkan
          dulu di tombol &ldquo;Atur akses&rdquo; di atas.
        </p>
      ) : (
        <div className="space-y-3">
          {ROWS.map((row) => {
            const value = values[row.key];
            const selected = value ? candidateById.get(value) : null;
            return (
              <div
                key={row.key}
                className="flex items-center gap-3 flex-wrap"
              >
                <div className="min-w-[120px]">
                  <div className="text-[12.5px] font-medium text-foreground">
                    {row.label}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {row.description}
                  </div>
                </div>
                <select
                  value={value ?? ""}
                  onChange={(e) => update(row.key, e.target.value)}
                  disabled={pending}
                  className="flex-1 min-w-[200px] h-9 rounded-lg border border-border/70 bg-card px-3 text-[13px]"
                >
                  <option value="">— tidak ada —</option>
                  {candidates.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.fullName}
                      {!c.hasPin ? " (belum set PIN)" : ""}
                    </option>
                  ))}
                </select>
                {selected && !selected.hasPin && (
                  <span className="text-[11px] text-warning font-medium px-2 py-1 rounded-full bg-warning/10">
                    Belum set PIN
                  </span>
                )}
                {selected?.hasPin && (
                  <button
                    type="button"
                    onClick={() => resetPin(selected.userId, selected.fullName)}
                    disabled={resetPending}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition disabled:opacity-50"
                    title={`Reset PIN ${selected.fullName}`}
                  >
                    <KeyRound size={11} />
                    Reset PIN
                  </button>
                )}
              </div>
            );
          })}

          <div className="pt-1 flex justify-end">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || pending}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-medium transition",
                dirty && !pending
                  ? "bg-primary text-primary-foreground hover:brightness-110"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {pending ? "Menyimpan..." : "Simpan otorisasi"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
