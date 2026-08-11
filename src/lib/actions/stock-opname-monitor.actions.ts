"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/actions/_gates";
import { jakartaDateString } from "@/lib/utils/jakarta";
import {
  GATED_JOB_ROLE_LABELS,
  STOCK_BRANCH_IDS,
  STOCK_BRANCH_LABEL,
  STOCK_GATE_FAIL_OPEN,
  STUDIO_LOCATION_IDS,
  type StockBranchId,
  type StockOpnameStatus,
  checkStockOpnameDone,
  isGatedJobRole,
  isStockGateConfigured,
  resolveStockGateBranchFromLocation,
  stockGateSourceLabel,
} from "@/lib/attendance/stock-opname-gate";

/**
 * Panel monitor gate "absen pulang" (admin-only).
 *
 * Gate-nya sendiri tidak kasat mata — hanya muncul saat karyawan ditolak
 * absen pulang. Modul ini membuka isinya untuk superadmin: apakah
 * konfigurasinya sehat, status opname tiap cabang hari ini (probe langsung
 * ke API eksternal), dan siapa saja yang hari ini terdampak.
 *
 * Semua pemanggilan API tetap di server — key tidak pernah ke client.
 */

/** Status satu cabang, sudah diterjemahkan supaya UI tinggal render. */
export interface BranchOpnameStatus {
  branchId: StockBranchId;
  label: string;
  /** submitted = opname selesai; pending = belum; error = tak terverifikasi. */
  state: "submitted" | "pending" | "error";
  /** Penjelasan kegagalan (hanya saat state = "error"). */
  errorLabel: string | null;
}

/** Karyawan yang hari ini sign-in di geofence studio. */
export interface GateAffectedEmployee {
  userId: string;
  fullName: string;
  jobRole: string | null;
  branchId: StockBranchId;
  branchLabel: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  /** Kena gate? false = jabatan di luar cakupan → bebas absen pulang. */
  gated: boolean;
  /** Boleh absen pulang sekarang berdasar status opname cabangnya. */
  canCheckOut: boolean;
  /** Alasan singkat kalau belum boleh. */
  blockedReason: string | null;
}

export interface StockGateMonitor {
  /** Tanggal WIB yang sedang ditinjau. */
  date: string;
  config: {
    apiKeySet: boolean;
    failOpen: boolean;
    endpoint: string;
    gatedRoles: string[];
    studioLocationCount: number;
  };
  branches: BranchOpnameStatus[];
  employees: GateAffectedEmployee[];
  /** Waktu probe dijalankan (ISO) — supaya admin tahu data sesegar apa. */
  checkedAt: string;
}

/** Terjemahan `reason` teknis → kalimat yang dimengerti admin. */
function reasonLabel(status: StockOpnameStatus): string | null {
  if (status.ok) return null;
  switch (status.reason) {
    case "not_configured":
      return "API key belum di-set / API balas 503";
    case "unauthorized":
      return "API key ditolak (401)";
    case "bad_request":
      return "Cabang tidak dikenal API (400)";
    case "timeout":
      return "API tidak menjawab (timeout 5 dtk)";
    case "network":
      return "Gagal menghubungi API";
    case "parse":
      return "Balasan API tidak sesuai format";
    default:
      return "Gagal verifikasi";
  }
}

export async function getStockGateMonitor(): Promise<
  { ok: true; data: StockGateMonitor } | { ok: false; error: string }
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const today = jakartaDateString(new Date());

  // Probe ketiga cabang paralel — persis panggilan yang dipakai gate asli,
  // jadi panel ini menguji jalur yang sesungguhnya (bukan simulasi).
  const raw = await Promise.all(
    STOCK_BRANCH_IDS.map(async (branchId) => ({
      branchId,
      status: await checkStockOpnameDone(branchId),
    }))
  );
  const statusByBranch = new Map(raw.map((s) => [s.branchId, s.status]));
  const branches: BranchOpnameStatus[] = raw.map(({ branchId, status }) => ({
    branchId,
    label: STOCK_BRANCH_LABEL[branchId],
    state: status.ok ? (status.submitted ? "submitted" : "pending") : "error",
    errorLabel: reasonLabel(status),
  }));

  // Siapa yang hari ini check-in di geofence studio.
  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("attendance_logs")
    .select(
      "user_id, checked_in_at, checked_out_at, matched_location_id, profiles!inner(full_name, business_unit, job_role)"
    )
    .eq("date", today)
    .in("matched_location_id", STUDIO_LOCATION_IDS)
    .order("checked_in_at", { ascending: true });

  const employees: GateAffectedEmployee[] = [];
  for (const row of logs ?? []) {
    const branchId = resolveStockGateBranchFromLocation(row.matched_location_id);
    if (!branchId) continue;
    // Supabase mengetik join sebagai objek/array tergantung relasi —
    // normalkan supaya aman dibaca.
    const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const gated = isGatedJobRole(prof?.business_unit, prof?.job_role);
    const status = statusByBranch.get(branchId);

    let canCheckOut = true;
    let blockedReason: string | null = null;
    if (gated && status) {
      if (status.ok) {
        canCheckOut = status.submitted;
        blockedReason = status.submitted ? null : "Opname cabang belum selesai";
      } else {
        canCheckOut = STOCK_GATE_FAIL_OPEN;
        blockedReason = STOCK_GATE_FAIL_OPEN
          ? null
          : (reasonLabel(status) ?? "Gagal verifikasi");
      }
    }

    employees.push({
      userId: row.user_id,
      fullName: prof?.full_name ?? "(tanpa nama)",
      jobRole: prof?.job_role ?? null,
      branchId,
      branchLabel: STOCK_BRANCH_LABEL[branchId],
      checkedInAt: row.checked_in_at,
      checkedOutAt: row.checked_out_at,
      gated,
      canCheckOut,
      blockedReason,
    });
  }

  return {
    ok: true,
    data: {
      date: today,
      config: {
        apiKeySet: isStockGateConfigured(),
        failOpen: STOCK_GATE_FAIL_OPEN,
        // stockGateSourceLabel(), BUKAN STOCK_STATUS_ENDPOINT. Konstanta itu
        // hardcoded, jadi panel menampilkan URL yeobospace.id apa pun mode yang
        // sedang berjalan — termasuk saat gate sudah membaca schema yeobo
        // secara lokal dan tidak menyentuh jaringan sama sekali. Pada 11
        // Agustus 2026 itu memakan waktu berjam-jam: env sudah benar, gate
        // sudah lokal, tapi satu-satunya permukaan yang seharusnya menunjukkan
        // hal itu menampilkan teks tetap dan meyakinkan semua orang bahwa
        // konfigurasinya gagal.
        endpoint: stockGateSourceLabel(),
        gatedRoles: GATED_JOB_ROLE_LABELS,
        studioLocationCount: STUDIO_LOCATION_IDS.length,
      },
      branches,
      employees,
      checkedAt: new Date().toISOString(),
    },
  };
}
