"use client";

/**
 * UI PnL khusus Yeobo Space (cabang Tlogosari/Tembalang/Jebres).
 *
 * Tinggal satu tampilan: spreadsheet. Tampilan "Kartu" lama beserta
 * toggle-nya dihapus (Agustus 2026) karena tidak dipakai dan membawa
 * beban nyata — grafik recharts (~102 KB gz) plus ratusan baris komponen
 * kartu per bulan. Spreadsheet punya toolbar periode + cabang sendiri,
 * jadi komponen ini praktis tinggal meneruskan props.
 *
 * Scoping cabang tetap di sini: report di-filter SEKALI ke
 * `allowedBranches` sebelum diserahkan ke spreadsheet, sehingga investor
 * per-cabang tidak pernah menerima angka cabang lain — pembatasan ada di
 * DATA yang dikirim, bukan sekadar disembunyikan di tampilan.
 */

import type { YeoboPnLReport, YeoboBranchPnL } from "@/lib/cashflow/pnl-yeobo";
import type { PhotoSessionRow } from "@/lib/actions/yeobo-photo-sessions.actions";
import { orderYeoboBranches } from "@/lib/cashflow/categories";
import { PnLYeoboSpreadsheet } from "./PnLYeoboSpreadsheet";

interface Props {
  businessUnit: string;
  from: { year: number; month: number };
  to: { year: number; month: number };
  report: YeoboPnLReport;
  /** Scope tampilan ke subset cabang (investor per-cabang). Undefined =
   *  semua cabang (admin). */
  allowedBranches?: string[];
  /** Jumlah sesi foto (per studio/bulan) → diteruskan ke spreadsheet
   *  untuk bagian "Sesi Foto". */
  photoSessions?: PhotoSessionRow[];
}

export function PnLYeoboClient({
  businessUnit,
  from,
  to,
  report: rawReport,
  allowedBranches,
  photoSessions,
}: Props) {
  // Scope report ke cabang yang diizinkan (sekali) → otomatis men-scope
  // seluruh isi spreadsheet. Undefined = semua cabang (admin).
  const report: YeoboPnLReport = allowedBranches
    ? {
        ...rawReport,
        branches: orderYeoboBranches(
          rawReport.branches.filter((b) => allowedBranches.includes(b))
        ),
        months: rawReport.months.map((m) => {
          const byBranch: Record<string, YeoboBranchPnL> = {};
          for (const b of Object.keys(m.byBranch)) {
            if (allowedBranches.includes(b)) byBranch[b] = m.byBranch[b];
          }
          return { ...m, byBranch };
        }),
      }
    : { ...rawReport, branches: orderYeoboBranches(rawReport.branches) };

  return (
    <PnLYeoboSpreadsheet
      businessUnit={businessUnit}
      from={from}
      to={to}
      report={report}
      allowedBranches={allowedBranches}
      editable={!allowedBranches}
      photoSessions={photoSessions}
    />
  );
}
