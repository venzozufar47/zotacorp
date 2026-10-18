"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin } from "./_gates";

/**
 * Checklist Offboarding & Cabut Akses (PRD-13) — sisi baca/tik manual.
 * Pencabutan otomatis (PIN, keanggotaan tim, dll) terjadi di
 * `profile-status.actions.ts` saat resign ditandai, bukan di sini.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function db(): any {
  return createAdminClient();
}

async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

export interface OffboardingManualItem {
  id: string;
  label: string;
  done: boolean;
  note: string | null;
  doneByName: string | null;
  doneAt: string | null;
}

export interface OffboardingChecklistView {
  id: string;
  userName: string | null;
  triggeredByName: string | null;
  effectiveAt: string;
  posPinRevokedAt: string | null;
  teamMembershipsRemovedAt: string | null;
  testerRolesRevokedAt: string | null;
  trustedContactRemovedAt: string | null;
  items: OffboardingManualItem[];
}

export async function listOffboardingChecklists(): Promise<OffboardingChecklistView[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];

  const { data } = await db().from("offboarding_checklists").select("*").order("created_at", { ascending: false });
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r: any) => r.id);
  const { data: itemsData } = await db()
    .from("offboarding_manual_items")
    .select("*")
    .in("checklist_id", ids);
  const items = itemsData ?? [];

  const names = await namesFor(rows.flatMap((r: any) => [r.user_id, r.triggered_by]).concat(
    items.map((i: any) => i.done_by).filter(Boolean)
  ));

  return rows.map((r: any) => ({
    id: r.id,
    userName: names.get(r.user_id) ?? null,
    triggeredByName: names.get(r.triggered_by) ?? null,
    effectiveAt: r.effective_at,
    posPinRevokedAt: r.pos_pin_revoked_at,
    teamMembershipsRemovedAt: r.team_memberships_removed_at,
    testerRolesRevokedAt: r.tester_roles_revoked_at,
    trustedContactRemovedAt: r.trusted_contact_removed_at,
    items: items
      .filter((i: any) => i.checklist_id === r.id)
      .map((i: any) => ({
        id: i.id,
        label: i.label,
        done: i.done,
        note: i.note,
        doneByName: i.done_by ? names.get(i.done_by) ?? null : null,
        doneAt: i.done_at,
      })),
  }));
}

export async function markOffboardingItemDone(input: {
  itemId: string;
  note?: string | null;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await db()
    .from("offboarding_manual_items")
    .update({
      done: true,
      note: input.note?.trim() || null,
      done_by: gate.userId,
      done_at: new Date().toISOString(),
    })
    .eq("id", input.itemId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/offboarding");
  return { ok: true };
}
