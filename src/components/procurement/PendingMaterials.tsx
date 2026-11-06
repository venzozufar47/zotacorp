"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { formatRp } from "@/lib/cashflow/format";
import { approveMaterial, type PendingMaterialRow } from "@/lib/actions/procurement-purchases.actions";

/** Bahan yang diajukan petugas pengadaan, menunggu ditinjau admin (nama/satuan/susut dirapikan di Master Bahan). */
export function PendingMaterials({ rows }: { rows: PendingMaterialRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (rows.length === 0) return null;

  function approve(id: string) {
    start(async () => {
      const res = await approveMaterial(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Bahan disetujui");
      router.refresh();
    });
  }

  return (
    <section className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Bahan baru menunggu tinjauan ({rows.length})</h2>
        <Link href="/admin/costing?tab=bahan" className="text-xs font-semibold text-primary hover:underline">
          Rapikan di tab Bahan →
        </Link>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {r.name} <span className="font-normal text-muted-foreground">· {r.businessUnit.replace("Haengbocake ", "")}</span>
              </p>
              <p className="text-[11.5px] text-muted-foreground">
                {formatRp(r.purchasePrice)} / {r.purchaseUnit} · isi {r.contentPerPurchase.toLocaleString("id-ID")} {r.usageUnit}
                {r.proposedByName ? ` · diajukan ${r.proposedByName}` : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => approve(r.id)}
              className="h-8 shrink-0 cursor-pointer rounded-lg border border-border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"
            >
              Setujui
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
