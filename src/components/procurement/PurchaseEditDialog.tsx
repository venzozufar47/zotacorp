"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import {
  getPurchaseFormData,
  type PurchaseFormData,
  type PurchaseView,
} from "@/lib/actions/procurement-purchases.actions";
import { PurchaseForm } from "./PurchaseForm";

/** Edit nota di Riwayat: membuka form nota yang sama (terisi data lama) dalam lapisan layar penuh. */
export function PurchaseEditDialog({ purchase, onClose }: { purchase: PurchaseView; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<PurchaseFormData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPurchaseFormData(purchase.businessUnit).then((res) => {
      if (cancelled) return;
      if (!res.ok || !res.data) setError(res.ok ? "Gagal memuat form" : res.error);
      else setData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [purchase.businessUnit]);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-background p-4 pb-10">
      <div className="mx-auto flex max-w-xl items-center justify-between pb-3">
        <h2 className="font-display text-base font-bold">
          Edit nota · {purchase.businessUnit.replace("Haengbocake ", "")}
        </h2>
        <button type="button" onClick={onClose} aria-label="Tutup" className="text-muted-foreground hover:text-foreground">
          <X size={18} />
        </button>
      </div>
      {error ? (
        <p className="mx-auto max-w-xl text-sm text-destructive">{error}</p>
      ) : !data ? (
        <div className="grid place-items-center py-16 text-muted-foreground">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
        <PurchaseForm
          data={data}
          editing={purchase}
          onSaved={() => {
            router.refresh();
            onClose();
          }}
        />
      )}
    </div>
  );
}
