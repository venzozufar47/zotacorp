"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ackAllMaterialChanges,
  ackMaterialChange,
  revertMaterialChange,
  type MaterialChangeView,
} from "@/lib/actions/procurement-materials.actions";

const ACTION_LABEL: Record<MaterialChangeView["action"], string> = {
  create: "Bahan baru",
  update: "Diubah",
  deactivate: "Dinonaktifkan",
  reactivate: "Diaktifkan lagi",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/** Catatan perubahan daftar bahan oleh petugas pengadaan: owner cukup "Sudah dilihat" atau "Urungkan". */
export function MaterialChangesFeed({ rows }: { rows: MaterialChangeView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (rows.length === 0) return null;
  const unseen = rows.filter((r) => !r.ackedAt).length;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      toast.success(okMsg);
      router.refresh();
    });
  }

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-bold">
          Perubahan daftar bahan{unseen > 0 && <span className="ml-1.5 rounded-full bg-warning/25 px-2 py-0.5 text-[11px]">{unseen} baru</span>}
        </h2>
        {unseen > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(ackAllMaterialChanges, "Semua ditandai sudah dilihat")}
            className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
          >
            Tandai semua dilihat
          </button>
        )}
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((r) => (
          <li key={r.id} className="space-y-1 py-2.5">
            <p className="text-sm font-semibold">
              {r.materialName}{" "}
              <span className="font-normal text-muted-foreground">
                · {r.businessUnit.replace("Haengbocake ", "")} · {ACTION_LABEL[r.action]}
                {r.sensitive && !r.ackedAt ? " · ⚠ memengaruhi HPP" : ""}
              </span>
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              {r.summary.join(" · ")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {r.changedByName ?? "—"} · {when(r.createdAt)}
                {r.revertedAt ? " · diurungkan" : ""}
              </span>
              <span className="ml-auto flex gap-1.5">
                {!r.ackedAt && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => ackMaterialChange(r.id), "Ditandai sudah dilihat")}
                    className="rounded-full border-2 border-foreground bg-card px-3 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                  >
                    Sudah dilihat
                  </button>
                )}
                {r.action !== "create" && !r.revertedAt && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => revertMaterialChange(r.id), "Perubahan diurungkan")}
                    className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
                  >
                    Urungkan
                  </button>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
