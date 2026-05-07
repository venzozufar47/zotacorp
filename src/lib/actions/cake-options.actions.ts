"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { requireAdmin, type ActionResult } from "./_gates";
import type {
  CakeOption,
  CakeOptionKind,
  CakeOptionsByKind,
} from "@/lib/cake-orders/types";

/**
 * Admin CRUD for the dropdown options that hydrate the cake-order
 * form. Single table with `kind` discriminator. RLS only allows
 * authenticated SELECT on cake_options — writes are gated by
 * `requireAdmin()` here using the service-role client. Same pattern
 * as voice-rooms.actions.ts.
 */

function adminClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
