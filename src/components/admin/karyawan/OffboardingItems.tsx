"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { markOffboardingItemDone } from "@/lib/actions/offboarding.actions";

/** Checklist keluar yang bisa dicentang langsung dari profil. Centang tidak bisa dibatalkan. */
export function OffboardingItems({
  items,
}: {
  items: { id: string; label: string; done: boolean; doneAt: string | null }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function tick(id: string) {
    setBusy(id);
    const res = await markOffboardingItemDone({ itemId: id });
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    router.refresh();
  }

  return (
    <ul className="-mx-2">
      {items.map((i) => (
        <li key={i.id}>
          {i.done ? (
            <div className="flex items-center gap-2.5 px-2 py-1.5 text-sm">
              <span className="flex size-4 items-center justify-center rounded bg-success text-primary-foreground">
                <Check size={12} aria-hidden />
              </span>
              <span className="text-muted-foreground line-through">{i.label}</span>
              {i.doneAt && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(i.doneAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={busy === i.id}
              onClick={() => tick(i.id)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
            >
              <span aria-hidden className="size-4 rounded border border-muted-foreground" />
              <span className="text-foreground">{i.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{busy === i.id ? "Menyimpan…" : "Tandai selesai"}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
