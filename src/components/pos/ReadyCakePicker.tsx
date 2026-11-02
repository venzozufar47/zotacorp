"use client";

import { Check, ChefHat, Palette, Hourglass } from "lucide-react";
import type { ReadyCakeItem, ReadyCakeStage } from "@/lib/actions/pos-ready-cake.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";

export interface ReadyCakeSummary {
  items: ReadyCakeItem[];
}

const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

/** Umur kue sejak siap, dalam hari kalender WIB. */
function ageLabel(readyAtIso: string, todayWib: string): string {
  const days = Math.round(
    (Date.parse(`${todayWib}T00:00:00Z`) - Date.parse(`${jakartaDateString(new Date(readyAtIso))}T00:00:00Z`)) / 86_400_000
  );
  if (days <= 0) return "hari ini";
  if (days === 1) return "kemarin";
  return `${days} hari lalu`;
}

const STAGE_LABEL: Record<Exclude<ReadyCakeStage, "ready">, { text: string; Icon: typeof ChefHat }> = {
  queued: { text: "Antre produksi", Icon: Hourglass },
  baking: { text: "Sedang dibuat baker", Icon: ChefHat },
  decorating: { text: "Sedang didekor cake artist", Icon: Palette },
};

/** Tombol Ready Cake di grid menu POS: berapa kue siap dijual dan berapa yang masih dikerjakan. */
export function ReadyCakeTile({
  summary,
  inCart,
  onOpen,
}: {
  summary: ReadyCakeSummary;
  inCart: number;
  onOpen: () => void;
}) {
  const ready = summary.items.filter((i) => i.stage === "ready").length;
  const making = summary.items.length - ready;
  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className={`w-full min-h-[104px] sm:min-h-[120px] cursor-pointer rounded-2xl border p-2.5 text-left transition-colors active:bg-muted sm:p-3 ${
          inCart > 0 ? "border-primary bg-primary/5" : "border-border bg-card"
        }`}
      >
        <div className="pr-8 text-sm font-semibold leading-tight text-foreground sm:text-base">
          Ready Cake
          <span className={`ml-1 font-normal tabular-nums ${ready > 0 ? "text-muted-foreground" : "text-destructive"}`}>({ready})</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
          {ready > 0 ? `${ready} siap dijual` : "Belum ada yang siap"}
        </div>
        {making > 0 && (
          <div className="mt-1 rounded-md border border-dashed border-foreground/25 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {making} masih dikerjakan
          </div>
        )}
        {inCart > 0 && (
          <div className="mt-1 text-[10px] font-semibold tabular-nums text-primary">{inCart} di keranjang</div>
        )}
      </div>
    </div>
  );
}

/**
 * Pemilih ready cake: kue yang sudah selesai produksi dan didekor bisa dipilih (masuk keranjang dengan harga dari Tasya);
 * kue yang masih dikerjakan tampil abu-abu dengan tahapnya supaya kasir tahu ada yang sedang disiapkan.
 */
export function ReadyCakePicker({
  summary,
  pickedIds,
  onPick,
  onClose,
}: {
  summary: ReadyCakeSummary;
  pickedIds: Set<string>;
  onPick: (item: ReadyCakeItem) => void;
  onClose: () => void;
}) {
  const todayWib = jakartaDateString(new Date());
  const ready = summary.items.filter((i) => i.stage === "ready");
  const making = summary.items.filter((i) => i.stage !== "ready");
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-foreground/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-semibold text-foreground">Ready Cake</h2>
          <p className="text-xs text-muted-foreground">Pilih kue yang mau dijual. Harga sudah ditetapkan Tasya.</p>
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {ready.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              Belum ada ready cake yang siap dijual.
            </p>
          )}
          {ready.map((it) => {
            const picked = pickedIds.has(it.id);
            return (
              <div
                key={it.id}
                className={`flex items-center gap-3 rounded-xl border p-3 ${picked ? "border-primary bg-primary/5" : "border-border bg-card"}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {it.name}
                    {it.isDiy && <span className="ml-1.5 text-xs font-medium text-primary">DIY</span>}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {rupiah(it.priceIdr)} · {it.readyAt ? ageLabel(it.readyAt, todayWib) : ""}
                  </p>
                </div>
                {picked ? (
                  <span className="inline-flex h-9 items-center gap-1 rounded-full bg-muted px-3 text-xs font-semibold text-muted-foreground">
                    <Check size={14} /> Di keranjang
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPick(it)}
                    className="h-9 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow active:bg-primary/80"
                  >
                    Pilih
                  </button>
                )}
              </div>
            );
          })}
          {making.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sedang dikerjakan</p>
              {making.map((it) => {
                const { text, Icon } = STAGE_LABEL[it.stage as Exclude<ReadyCakeStage, "ready">];
                return (
                  <div key={it.id} className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-3 opacity-75">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {it.name}
                        {it.isDiy && <span className="ml-1.5 text-xs font-medium text-primary">DIY</span>}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">{rupiah(it.priceIdr)}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <Icon size={13} aria-hidden /> {text}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} className="h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground">
          Selesai
        </button>
      </div>
    </div>
  );
}
