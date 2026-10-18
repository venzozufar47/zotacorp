import { CheckCircle2, ScanFace, TriangleAlert } from "lucide-react";

/**
 * Lencana hasil filter selfie AI (migrasi 192) untuk admin.
 *  - ok         → AI menyetujui
 *  - overridden → AI menolak, karyawan memilih tetap absen (perlu ditinjau admin)
 *  - unchecked  → AI tak sempat/error/batas harian; absen lolos tanpa pemeriksaan
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
    return (
      <span
        title="AI tidak sempat memeriksa foto ini"
        className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground"
      >
        <ScanFace size={11} /> AI tidak sempat
      </span>
    );
  }
  return null;
}
