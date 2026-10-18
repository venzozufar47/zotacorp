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
import { createAdminClient } from "./_supabase-admin";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

/**
 * Checklist Offboarding & Cabut Akses (PRD-13). Dipanggil DI SINI, bukan
 * di jalur resign terpisah — `setUserResignStatus` adalah satu-satunya
 * jalur resign di app, jadi pencabutan akses tidak bisa terlewat lewat
 * jalur lain. PIN POS dan akses app (via `is_active=false`, sudah
 * memblokir login lewat middleware yang ada) dicabut SEKETIKA, bukan
 * menunggu siapa pun menyelesaikan checklist manual di bawahnya.
 */
async function createOffboardingChecklist(userId: string, triggeredBy: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const now = new Date().toISOString();

  await admin.from("profiles").update({ pos_pin_hash: null }).eq("id", userId);
  await admin.from("team_members").delete().or(`leader_id.eq.${userId},member_id.eq.${userId}`);
  await admin.from("product_testers").delete().eq("user_id", userId);
  await admin.from("hr_trusted_contacts").delete().eq("user_id", userId);

  const { data: checklist, error } = await admin
    .from("offboarding_checklists")
    .insert({
      user_id: userId,
      triggered_by: triggeredBy,
      pos_pin_revoked_at: now,
      team_memberships_removed_at: now,
      tester_roles_revoked_at: now,
      trusted_contact_removed_at: now,
    })
    .select("id")
    .single();
  if (error || !checklist) return;

  await admin.from("offboarding_manual_items").insert([
    { checklist_id: checklist.id, label: "Kembalikan kunci" },
    { checklist_id: checklist.id, label: "Kembalikan aset dan akses toko lainnya" },
    { checklist_id: checklist.id, label: "Serah terima kas/kas kecil yang dipegang" },
  ]);
}

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

  if (resigned) {
    await createOffboardingChecklist(userId, user.id);
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  revalidatePath("/admin/offboarding");
  return { ok: true, data: { id: userId, resigned } };
}
