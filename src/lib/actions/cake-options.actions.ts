"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import {
  branchPriceCol,
  type CakeBaseDiameterPrice,
  type CakeBranch,
  type CakeDiameterOption,
  type CakeOption,
  type CakeOptionKind,
  type CakeOptionsByKind,
} from "@/lib/cake-orders/types";

/**
 * Admin CRUD for the dropdown options that hydrate the cake-order
 * form. Single table with `kind` discriminator. RLS only allows
 * authenticated SELECT on cake_options — writes are gated by
 * `requireAdmin()` here using the service-role client. Same pattern
 * as voice-rooms.actions.ts.
 */

const KINDS: CakeOptionKind[] = [
  "base_cake",
  "shape",
  "filling",
  "delivery",
  "payment_method",
];

export interface CakeOptionInput {
  kind: CakeOptionKind;
  label: string;
  base_price_idr: number | null;
  needs_address: boolean;
  is_custom_freeform: boolean;
  sort_order: number;
  is_active: boolean;
}

/** Active options grouped by kind — public-facing employee form. */
export async function listCakeOptions(): Promise<
  ActionResult<CakeOptionsByKind>
> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("cake_options" as never)
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as unknown as CakeOption[];
  const grouped = Object.fromEntries(
    KINDS.map((k) => [k, [] as CakeOption[]])
  ) as CakeOptionsByKind;
  for (const r of rows) grouped[r.kind].push(r);
  return { ok: true, data: grouped };
}

/** Includes inactive — for the admin manager. */
export async function listCakeOptionsAdmin(): Promise<
  ActionResult<CakeOption[]>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("cake_options" as never)
    .select("*")
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as CakeOption[] };
}

export async function createCakeOption(
  input: CakeOptionInput
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.label.trim()) return { ok: false, error: "Label wajib" };

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("cake_options" as never)
    .insert({
      kind: input.kind,
      label: input.label.trim(),
      base_price_idr:
        input.kind === "base_cake" ? input.base_price_idr ?? 0 : null,
      needs_address: input.kind === "delivery" ? input.needs_address : false,
      is_custom_freeform:
        input.kind === "shape" ? input.is_custom_freeform : false,
      sort_order: input.sort_order,
      is_active: input.is_active,
    } as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/cake-orders/options");
  revalidatePath("/cake-orders");
  return { ok: true, data: data as unknown as { id: string } };
}

export async function updateCakeOption(
  id: string,
  input: CakeOptionInput
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.label.trim()) return { ok: false, error: "Label wajib" };

  const supabase = adminClient();
  const { error } = await supabase
    .from("cake_options" as never)
    .update({
      kind: input.kind,
      label: input.label.trim(),
      base_price_idr:
        input.kind === "base_cake" ? input.base_price_idr ?? 0 : null,
      needs_address: input.kind === "delivery" ? input.needs_address : false,
      is_custom_freeform:
        input.kind === "shape" ? input.is_custom_freeform : false,
      sort_order: input.sort_order,
      is_active: input.is_active,
    } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/cake-orders/options");
  revalidatePath("/cake-orders");
  return { ok: true };
}

/**
 * Soft-delete when the option is referenced by any cake_orders row,
 * hard-delete otherwise. Soft delete (is_active=false) keeps history
 * readable while hiding from new orders.
 */
export async function deleteCakeOption(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  const { count } = await supabase
    .from("cake_orders" as never)
    .select("id", { count: "exact", head: true })
    .or(
      [
        `base_cake_option_id.eq.${id}`,
        `shape_option_id.eq.${id}`,
        `filling_option_id.eq.${id}`,
        `delivery_option_id.eq.${id}`,
        `payment_option_id.eq.${id}`,
      ].join(",")
    );

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("cake_options" as never)
      .update({ is_active: false } as never)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("cake_options" as never)
      .delete()
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/cake-orders/options");
  revalidatePath("/cake-orders");
  return { ok: true };
}

// ---------- Diameter presets + price matrix --------------------------

/**
 * Diameter presets — global list shared across all base cakes. Order
 * form pakai dropdown ini (bukan freeform). Inactive disembunyikan dari
 * form tapi tetap tampil di admin manager.
 */
export async function listCakeDiameterOptions(opts?: {
  activeOnly?: boolean;
}): Promise<ActionResult<CakeDiameterOption[]>> {
  const supabase = adminClient();
  let q = supabase
    .from("cake_diameter_options" as never)
    .select("*")
    .order("sort_order", { ascending: true })
    .order("diameter_cm", { ascending: true });
  if (opts?.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as CakeDiameterOption[] };
}

export interface CakeDiameterInput {
  diameter_cm: number;
  label: string | null;
  sort_order: number;
  is_active: boolean;
}

export async function createCakeDiameter(
  input: CakeDiameterInput
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const cm = Math.round(input.diameter_cm);
  if (!Number.isFinite(cm) || cm < 1 || cm > 199)
    return { ok: false, error: "Diameter 1–199 cm" };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("cake_diameter_options" as never)
    .insert({
      diameter_cm: cm,
      label: input.label?.trim() || null,
      sort_order: input.sort_order,
      is_active: input.is_active,
    } as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/cake-orders/options");
  revalidatePath("/cake-orders");
  return { ok: true, data: data as unknown as { id: string } };
}

export async function updateCakeDiameter(
  id: string,
  input: CakeDiameterInput
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const cm = Math.round(input.diameter_cm);
  if (!Number.isFinite(cm) || cm < 1 || cm > 199)
    return { ok: false, error: "Diameter 1–199 cm" };
  const supabase = adminClient();
  const { error } = await supabase
    .from("cake_diameter_options" as never)
    .update({
      diameter_cm: cm,
      label: input.label?.trim() || null,
      sort_order: input.sort_order,
      is_active: input.is_active,
    } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/cake-orders/options");
  revalidatePath("/cake-orders");
  return { ok: true };
}

export async function deleteCakeDiameter(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  // Cascade FK akan hapus baris matrix yang merujuk. Karena diameter di
  // order disnapshot sebagai integer di kolom dimension_cm (bukan FK),
  // order lama tidak terdampak.
  const { error } = await supabase
    .from("cake_diameter_options" as never)
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/cake-orders/options");
  revalidatePath("/cake-orders");
  return { ok: true };
}

/** Semua sel matrix — admin manager butuh untuk render grid. */
export async function listCakeBasePrices(): Promise<
  ActionResult<CakeBaseDiameterPrice[]>
> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("cake_base_diameter_prices" as never)
    .select("*");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as CakeBaseDiameterPrice[] };
}

/**
 * Bulk-upsert sel matriks dalam satu round-trip. Tiap entry hanya
 * meng-update salah satu kolom (Pare ATAU Semarang); kolom lain
 * preserved dari row existing. Row dihapus kalau setelah update
 * kedua kolom null. Cocok untuk tombol "Simpan" terpusat di UI
 * matriks supaya admin tidak perlu menunggu round-trip per sel.
 */
export interface CakeBasePriceChange {
  base_option_id: string;
  diameter_id: string;
  branch: CakeBranch;
  price_idr: number | null;
}

export async function setCakeBasePricesBulk(
  changes: CakeBasePriceChange[]
): Promise<ActionResult<{ updated: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (changes.length === 0) return { ok: true, data: { updated: 0 } };
  const supabase = adminClient();

  const keys = Array.from(
    new Set(changes.map((c) => `${c.base_option_id}|${c.diameter_id}`))
  );
  const pairs = keys.map((k) => k.split("|") as [string, string]);
  const baseIds = Array.from(new Set(pairs.map(([b]) => b)));
  const diaIds = Array.from(new Set(pairs.map(([, d]) => d)));
  const { data: existingRows } = await supabase
    .from("cake_base_diameter_prices" as never)
    .select("*")
    .in("base_option_id", baseIds)
    .in("diameter_id", diaIds);
  const existing = new Map<string, CakeBaseDiameterPrice>();
  for (const r of (existingRows ?? []) as unknown as CakeBaseDiameterPrice[]) {
    existing.set(`${r.base_option_id}|${r.diameter_id}`, r);
  }

  // Gabungkan perubahan per (base,diameter) — admin bisa edit Pare +
  // Semarang sekaligus, kita merge jadi satu upsert.
  const merged = new Map<
    string,
    {
      base_option_id: string;
      diameter_id: string;
      price_pare_idr: number | null;
      price_semarang_idr: number | null;
    }
  >();
  for (const c of changes) {
    const k = `${c.base_option_id}|${c.diameter_id}`;
    const existingRow = existing.get(k);
    const cur = merged.get(k) ?? {
      base_option_id: c.base_option_id,
      diameter_id: c.diameter_id,
      price_pare_idr: existingRow?.price_pare_idr ?? null,
      price_semarang_idr: existingRow?.price_semarang_idr ?? null,
    };
    const next =
      c.price_idr == null ? null : Math.max(0, Math.round(c.price_idr));
    merged.set(k, {
      ...cur,
      [branchPriceCol(c.branch)]: next,
    });
  }

  const now = new Date().toISOString();
  const toUpsert: Record<string, unknown>[] = [];
  const toDelete: Array<[string, string]> = [];
  for (const m of merged.values()) {
    if (m.price_pare_idr == null && m.price_semarang_idr == null) {
      toDelete.push([m.base_option_id, m.diameter_id]);
    } else {
      toUpsert.push({ ...m, updated_at: now });
    }
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from("cake_base_diameter_prices" as never)
      .upsert(toUpsert as never, {
        onConflict: "base_option_id,diameter_id",
      });
    if (error) return { ok: false, error: error.message };
  }
  for (const [b, d] of toDelete) {
    const { error } = await supabase
      .from("cake_base_diameter_prices" as never)
      .delete()
      .eq("base_option_id", b)
      .eq("diameter_id", d);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/cake-orders/options");
  revalidatePath("/cake-orders");
  return { ok: true, data: { updated: merged.size } };
}
