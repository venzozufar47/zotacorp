import { AlertTriangle } from "lucide-react";
import {
  CAKE_BONUS_POSITIONS,
  SEMARANG_BONUS_GE_THRESHOLD,
  SEMARANG_BONUS_LT_THRESHOLD,
  SEMARANG_DIAMETER_THRESHOLD_CM,
  PARE_OMSET_BONUS_RATE,
} from "@/lib/cake-bonus/positions";

const rp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

export interface DecoratorRecipient {
  /** Nama orang yang memegang posisi ini (null = belum ada). */
  name: string | null;
  /** Berapa orang aktif memegang posisi (0/1 normal; >1 = ambigu). */
  count: number;
}

/**
 * Dua kartu bonus decorator (Semarang per-diameter & Pare 8% omset),
 * mirror gaya kartu Tasya. Angka dihitung otomatis dari `cake_orders`
 * dan otomatis masuk ke kolom `cake_bonus` payslip saat generate.
 */
export function DecoratorBonusCards({
  semarang,
  pare,
}: {
  semarang: {
    geCount: number;
    ltCount: number;
    bonus: number;
    recipient: DecoratorRecipient;
  };
  pare: {
    cakeCount: number;
    omset: number;
    bonus: number;
    recipient: DecoratorRecipient;
  };
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Intan — Semarang */}
      <BonusCard
        title="Bonus Cake — Decorator Semarang"
        position={CAKE_BONUS_POSITIONS.decoratorSemarang}
        recipient={semarang.recipient}
        total={semarang.bonus}
        formula={`Tiap cake Semarang ≥${SEMARANG_DIAMETER_THRESHOLD_CM}cm = ${rp(
          SEMARANG_BONUS_GE_THRESHOLD
        )} · <${SEMARANG_DIAMETER_THRESHOLD_CM}cm = ${rp(
          SEMARANG_BONUS_LT_THRESHOLD
        )}.`}
      >
        <BreakdownRow
          label={`${semarang.geCount} cake ≥${SEMARANG_DIAMETER_THRESHOLD_CM}cm × ${rp(SEMARANG_BONUS_GE_THRESHOLD)}`}
          value={semarang.geCount * SEMARANG_BONUS_GE_THRESHOLD}
        />
        <BreakdownRow
          label={`${semarang.ltCount} cake <${SEMARANG_DIAMETER_THRESHOLD_CM}cm × ${rp(SEMARANG_BONUS_LT_THRESHOLD)}`}
          value={semarang.ltCount * SEMARANG_BONUS_LT_THRESHOLD}
        />
      </BonusCard>

      {/* Zahra — Pare */}
      <BonusCard
        title="Bonus Cake — Decorator Pare"
        position={CAKE_BONUS_POSITIONS.decoratorPare}
        recipient={pare.recipient}
        total={pare.bonus}
        formula={`${Math.round(PARE_OMSET_BONUS_RATE * 100)}% × total omset custom cake Pare bulan ini.`}
      >
        <BreakdownRow
          label={`${pare.cakeCount} cake Pare · omset ${rp(pare.omset)}`}
          value={null}
        />
        <BreakdownRow
          label={`${rp(pare.omset)} × ${Math.round(PARE_OMSET_BONUS_RATE * 100)}%`}
          value={pare.bonus}
        />
      </BonusCard>
    </div>
  );
}

function BonusCard({
  title,
  position,
  recipient,
  total,
  formula,
  children,
}: {
  title: string;
  position: string;
  recipient: DecoratorRecipient;
  total: number;
  formula: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card p-5 shadow-hard-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-foreground truncate">
            {title}
          </h3>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {recipient.name ? (
              <>
                Penerima: <strong className="text-foreground">{recipient.name}</strong>{" "}
                · <span className="font-mono">{position}</span>
              </>
            ) : (
              <span className="font-mono">{position}</span>
            )}
          </p>
          <p className="text-[12px] text-muted-foreground mt-1">{formula}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Total bonus
          </div>
          <div className="font-display text-2xl font-bold text-foreground tabular-nums">
            {rp(total)}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-border/70 bg-muted/30 divide-y divide-border/50">
        {children}
      </div>

      {recipient.count === 0 ? (
        <Note tone="warn">
          Belum ada karyawan aktif dengan posisi{" "}
          <span className="font-mono">{position}</span>. Set field Posisi di
          /admin/users agar bonus terhubung.
        </Note>
      ) : recipient.count > 1 ? (
        <Note tone="warn">
          {recipient.count} karyawan memegang posisi ini — bonus akan terhitung
          untuk masing-masing. Pastikan hanya 1 orang per posisi.
        </Note>
      ) : (
        <Note tone="info">
          Otomatis masuk ke <span className="font-mono">cake_bonus</span> di
          payslip {recipient.name ?? "penerima"} saat generate.
        </Note>
      )}
    </div>
  );
}

function BreakdownRow({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]">
      <span className="text-muted-foreground">{label}</span>
      {value != null && (
        <span className="font-mono tabular-nums text-foreground">
          {rp(value)}
        </span>
      )}
    </div>
  );
}

function Note({
  tone,
  children,
}: {
  tone: "warn" | "info";
  children: React.ReactNode;
}) {
  return (
    <p
      className={
        "mt-3 flex items-start gap-2 text-[11.5px] leading-snug rounded-lg px-2.5 py-1.5 " +
        (tone === "warn"
          ? "bg-warning/10 text-warning"
          : "bg-accent text-[var(--teal-700)]")
      }
    >
      {tone === "warn" && (
        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
      )}
      <span>{children}</span>
    </p>
  );
}
