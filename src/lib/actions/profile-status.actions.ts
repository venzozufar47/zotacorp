"use server";

/**
 * Resign / re-activate karyawan. Toggle reversible:
 *   - Resign  → is_active=false, resigned_at=now(), resigned_by=admin.id
 *   - Activate → is_active=true; audit kolom DIPERTAHANKAN supaya
 *     admin bisa trace "pernah resign tanggal X, kembali aktif Y".
 *
 * Side effect via filter di tempat lain:
 *   - Middleware blokir login (force logout di request berikutnya)
 *   - WA celebrations skip (4 query celebrations.actions.ts)
 *   - Payslip generator skip (bulkCalculatePayslips)
 *   - Floor roster skip (admin-home.actions.ts)
 *   - Listing assignee (cake/POS/cashflow) sudah filter is_active dari awal
 *
 * Admin-gated; non-admin cannot toggle siapa pun.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function setUserResignStatus(
  userId: string,
  resigned: boolean
): Promise<ActionResult<{ id: string; resigned: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };

  // Safety: admin tidak boleh nge-tag resign dirinya sendiri (kalo
  // mereka satu-satunya admin, sistem jadi tidak bisa di-akses).
  if (userId === user.id && resigned) {
    return {
      ok: false,
      error: "Tidak bisa tag resign akun sendiri. Minta admin lain.",
    };
  }

  const supabase = await createClient();
  const update: {
    is_active: boolean;
    resigned_at?: string | null;
    resigned_by?: string | null;
  } = {
    is_active: !resigned,
  };
  if (resigned) {
    // Set audit saat resign. Saat un-resign, AUDIT DIPERTAHANKAN
    // (tidak null-kan) supaya history "pernah resign" tetap ada.
    update.resigned_at = new Date().toISOString();
    update.resigned_by = user.id;
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true, data: { id: userId, resigned } };
}
