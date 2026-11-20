"use client";

import { useState } from "react";
import { Candy, Snowflake } from "lucide-react";
import { formatRp } from "@/lib/cashflow/format";
import {
  ICE_LEVELS,
  ICE_LEVEL_LABELS,
  SUGAR_LEVELS,
  SUGAR_LEVEL_LABELS,
  type IceLevel,
  type SugarLevel,
} from "@/lib/pos/sugar-levels";

export interface DrinkOptions {
  sugarLevel: SugarLevel | null;
  iceLevel: IceLevel | null;
}

/**
 * Pemilih pilihan minuman dalam SATU popup: tingkat gula dan/atau tingkat es, sesuai
 * flag minumannya (`needSugar` / `needIce`). WAJIB: menutup dialog = batal menambah;
 * item tak pernah masuk keranjang tanpa pilihan yang diwajibkan (server juga menolaknya).
 *
 * Gula dan es dibedakan oleh ikon + warna token (permen/hangat vs kepingan salju) supaya
 * kasir tak tertukar. Dengan dua kelompok, tombol "Tambah" aktif setelah keduanya dipilih;
 * dengan satu kelompok, satu tap langsung menambah (sama seperti pemilih gula lama).
 */
export function DrinkOptionsDialog({
  title,
  price,
  needSugar,
  needIce,
  onPick,
  onClose,
  zClass = "z-30",
}: {
  title: string;
  price: number;
  needSugar: boolean;
  needIce: boolean;
  onPick: (o: DrinkOptions) => void;
  onClose: () => void;
  /** Kelas z-index overlay; naikkan bila dibuka di atas dialog lain. */
  zClass?: string;
}) {
  const [sugar, setSugar] = useState<SugarLevel | null>(null);
  const [ice, setIce] = useState<IceLevel | null>(null);
  const both = needSugar && needIce;
  const ready = (!needSugar || sugar != null) && (!needIce || ice != null);

  function pickSugar(level: SugarLevel) {
    if (both) setSugar(level);
    else onPick({ sugarLevel: level, iceLevel: null });
  }
  function pickIce(level: IceLevel) {
    if (both) setIce(level);
    else onPick({ sugarLevel: null, iceLevel: level });
  }

  const required =
    needSugar && needIce ? "pilih gula & es (wajib)" : needIce ? "pilih tingkat es (wajib)" : "pilih tingkat gula (wajib)";

  return (
    <div
      className={`fixed inset-0 ${zClass} bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-xl p-3 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="truncate font-semibold text-foreground">{title}</h2>
          <p className="text-xs tabular-nums text-muted-foreground">
            {formatRp(price)} · {required}
          </p>
        </div>

        {needSugar && (
          <section className="space-y-1.5 rounded-xl border-l-4 border-pop-amber bg-pop-amber/10 p-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
              <Candy size={16} className="text-pop-amber" aria-hidden /> Gula
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {SUGAR_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={sugar === level}
                  onClick={() => pickSugar(level)}
                  className={`h-14 rounded-xl border-2 px-1 text-sm font-semibold leading-tight transition-colors ${
                    sugar === level
                      ? "border-pop-amber bg-pop-amber text-foreground"
                      : "border-border bg-card text-foreground active:bg-muted"
                  }`}
                >
                  {SUGAR_LEVEL_LABELS[level]}
                </button>
              ))}
            </div>
          </section>
        )}

        {needIce && (
          <section className="space-y-1.5 rounded-xl border-l-4 border-primary bg-primary/10 p-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
              <Snowflake size={16} className="text-primary" aria-hidden /> Es
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {ICE_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={ice === level}
                  onClick={() => pickIce(level)}
                  className={`h-14 rounded-xl border-2 px-1 text-sm font-semibold leading-tight transition-colors ${
                    ice === level
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground active:bg-muted"
                  }`}
                >
                  {ICE_LEVEL_LABELS[level]}
                </button>
              ))}
            </div>
          </section>
        )}

        {both && (
          <button
            type="button"
            disabled={!ready}
            onClick={() => onPick({ sugarLevel: sugar, iceLevel: ice })}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40"
          >
            Tambah ke keranjang
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full h-10 rounded-xl text-sm text-muted-foreground font-semibold hover:bg-muted"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
