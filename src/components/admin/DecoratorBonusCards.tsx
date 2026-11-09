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
 * Bonus decorator (Semarang per diameter, Pare persen omset) sebagai dua
 * baris ringkas. Angka dihitung otomatis dari `cake_orders` dan masuk ke
 * `cake_bonus` slip saat dihitung.
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
  const ge = SEMARANG_DIAMETER_THRESHOLD_CM;
  return (
    <>
      <BonusRow
        title="Decorator Semarang"
        position={CAKE_BONUS_POSITIONS.decoratorSemarang}
        recipient={semarang.recipient}
        total={semarang.bonus}
        detail={`${semarang.geCount} cake ≥${ge}cm × ${rp(SEMARANG_BONUS_GE_THRESHOLD)} · ${semarang.ltCount} cake <${ge}cm × ${rp(SEMARANG_BONUS_LT_THRESHOLD)}`}
      />
      <BonusRow
        title="Decorator Pare"
        position={CAKE_BONUS_POSITIONS.decoratorPare}
        recipient={pare.recipient}
        total={pare.bonus}
        detail={`${pare.cakeCount} cake · omset ${rp(pare.omset)} × ${Math.round(PARE_OMSET_BONUS_RATE * 100)}%`}
      />
    </>
  );
}

function BonusRow({
  title,
  position,
  recipient,
  total,
  detail,
}: {
  title: string;
  position: string;
  recipient: DecoratorRecipient;
  total: number;
  detail: string;
}) {
  const warn =
    recipient.count === 0
      ? `Belum ada karyawan aktif dengan posisi ${position}.`
      : recipient.count > 1
        ? `${recipient.count} karyawan memegang posisi ini; bonus terhitung untuk masing-masing.`
        : null;
  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium min-w-0 truncate">
          {title}
          {recipient.name && (
            <span className="font-normal text-muted-foreground"> · {recipient.name}</span>
          )}
        </p>
        <p className="text-sm font-semibold tabular-nums shrink-0">{rp(total)}</p>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
      {warn && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-foreground">
          <AlertTriangle size={12} className="shrink-0 mt-0.5 text-warning" />
          {warn}
        </p>
      )}
    </div>
  );
}
