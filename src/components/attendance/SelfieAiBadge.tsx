import { CheckCircle2, ScanFace, TriangleAlert } from "lucide-react";
import { UNCHECKED_EXPLAIN, UNCHECKED_LABEL, uncheckedReason } from "@/lib/attendance/selfie-unchecked";

/**
 * Lencana hasil filter selfie AI (migrasi 192) untuk admin.
 *  - ok         → AI menyetujui
 *  - overridden → AI menolak, karyawan memilih tetap absen (perlu ditinjau admin)
 *  - unchecked  → tidak diperiksa AI; absen lolos. Alasannya (batas harian / AI gagal) ada di `note`
 * Verdict kosong (unit bisnis tanpa filter / absen lama) tidak menampilkan apa-apa.
 */
export function SelfieAiBadge({
  verdict,
  reviewed,
  attempts,
  note,
}: {
  verdict: string | null | undefined;
  reviewed?: boolean;
  attempts?: number | null;
  note?: string | null;
}) {
  if (verdict === "ok") {
    return (
      <span
        title={attempts && attempts > 1 ? `Disetujui AI pada foto ke-${attempts}` : "Disetujui AI"}
        className="inline-flex items-center gap-1 text-[10px] font-semibold text-success"
      >
        <CheckCircle2 size={11} /> AI acc
      </span>
    );
  }
  if (verdict === "overridden") {
    return (
      <span
        title={note ?? "Karyawan tetap absen walau foto ditolak AI"}
        className={`inline-flex items-center gap-1 text-[10px] font-semibold ${reviewed ? "text-muted-foreground" : "text-warning"}`}
      >
        <TriangleAlert size={11} /> {reviewed ? "Ditolak AI · sudah ditinjau" : "Ditolak AI · tetap absen"}
      </span>
    );
  }
  if (verdict === "unchecked") {
    const reason = uncheckedReason(note);
    return (
      <span
        title={UNCHECKED_EXPLAIN[reason]}
        className={`inline-flex items-center gap-1 text-[10px] font-semibold ${reason === "error" ? "text-warning" : "text-muted-foreground"}`}
      >
        <ScanFace size={11} /> {UNCHECKED_LABEL[reason]}
      </span>
    );
  }
  return null;
}
