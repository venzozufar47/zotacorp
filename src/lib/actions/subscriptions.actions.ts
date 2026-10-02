"use server";

/**
 * Management Subscription — admin only.
 *
 * Tabel baru belum ada di `Database` (types hand-merged), jadi query memakai
 * cast longgar seperti modul Kartu SIM. Tulis memakai klien SESI admin (bukan
 * service-role) supaya RLS `is_admin()` tetap jadi pagar kedua.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, type ActionResult } from "./_gates";
import { jakartaDateString } from "@/lib/utils/jakarta";
import {
  nextRenewal,
  type BillingCycle,
  type Subscription,
} from "@/lib/subscriptions/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const PATH = "/admin/subscriptions";

const allocationSchema = z.object({
  businessUnit: z.string().trim().min(1, "Pilih business unit"),
  branch: z.string().trim().nullable(),
  amountIdr: z.number().int().min(1, "Nominal pembagian harus lebih dari 0"),
});

const inputSchema = z
  .object({
    id: z.string().uuid().nullable(),
    name: z.string().trim().min(1, "Nama subscription wajib diisi").max(120),
    amountIdr: z.number().int().min(0, "Nominal tidak valid"),
    billingCycle: z.enum(["monthly", "quarterly", "yearly"]),
    nextRenewalDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid")
      .nullable(),
    notes: z.string().trim().max(500).nullable(),
    allocations: z.array(allocationSchema).min(1, "Pilih minimal satu business unit"),
  })
  .superRefine((v, ctx) => {
    const sum = v.allocations.reduce((s, a) => s + a.amountIdr, 0);
    if (sum !== v.amountIdr) {
      ctx.addIssue({
        code: "custom",
        message: "Total pembagian harus sama dengan nominal",
        path: ["allocations"],
      });
    }
    const keys = v.allocations.map((a) => `${a.businessUnit}|${a.branch ?? ""}`);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: "custom",
        message: "Ada business unit + cabang yang dobel",
        path: ["allocations"],
      });
    }
  });

export type SubscriptionInput = z.infer<typeof inputSchema>;

export async function listSubscriptions(): Promise<Subscription[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id, name, amount_idr, billing_cycle, next_renewal_date, is_active, notes, subscription_allocations(id, business_unit, branch, amount_idr)"
    )
    .order("name", { ascending: true });
  if (error) {
    console.error("[subscriptions] list failed", error);
    return [];
  }
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    amountIdr: Number(r.amount_idr),
    billingCycle: r.billing_cycle as BillingCycle,
    nextRenewalDate: r.next_renewal_date ?? null,
    isActive: r.is_active,
    notes: r.notes ?? null,
    allocations: ((r.subscription_allocations ?? []) as any[]).map((a) => ({
      id: a.id,
      businessUnit: a.business_unit,
      branch: a.branch ?? null,
      amountIdr: Number(a.amount_idr),
    })),
  }));
}

export async function saveSubscription(
  input: SubscriptionInput
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  }
  const v = parsed.data;

  const supabase = (await createClient()) as any;
  // Status aktif dipertahankan saat edit — arsip/aktif lewat aksi sendiri.
  let isActive = true;
  if (v.id) {
    const { data: cur } = await supabase
      .from("subscriptions")
      .select("is_active")
      .eq("id", v.id)
      .maybeSingle();
    if (!cur) return { ok: false, error: "Subscription tidak ditemukan" };
    isActive = cur.is_active;
  }

  const { data, error } = await supabase.rpc("save_subscription", {
    p_id: v.id,
    p_name: v.name,
    p_amount: v.amountIdr,
    p_cycle: v.billingCycle,
    p_next: v.nextRenewalDate,
    p_active: isActive,
    p_notes: v.notes,
    p_allocs: v.allocations.map((a) => ({
      business_unit: a.businessUnit,
      branch: a.branch,
      amount_idr: a.amountIdr,
    })),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH);
  return { ok: true, data: { id: data as string } };
}

/** Tandai sudah diperpanjang: maju satu siklus (dan terus maju sampai lewat hari ini). */
export async function renewSubscription(
  id: string
): Promise<ActionResult<{ nextRenewalDate: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = (await createClient()) as any;
  const { data: cur } = await supabase
    .from("subscriptions")
    .select("next_renewal_date, billing_cycle")
    .eq("id", id)
    .maybeSingle();
  if (!cur) return { ok: false, error: "Subscription tidak ditemukan" };

  const next = nextRenewal(
    cur.next_renewal_date ?? null,
    cur.billing_cycle as BillingCycle,
    jakartaDateString(new Date())
  );
  const { error } = await supabase
    .from("subscriptions")
    .update({ next_renewal_date: next })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true, data: { nextRenewalDate: next } };
}

export async function setSubscriptionActive(
  id: string,
  active: boolean
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = (await createClient()) as any;
  const { error } = await supabase
    .from("subscriptions")
    .update({ is_active: active })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteSubscription(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("subscriptions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}
