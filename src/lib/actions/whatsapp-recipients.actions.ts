"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";

/**
 * Normalize a user-entered phone to the E.164-without-plus form Fonnte
 * expects. Accepts:
 *  - "+6285..."        → "6285..."
 *  - "  6285... "      → "6285..."
 *  - "6285-123 456"    → "6285123456"
 *  - "0811..."         → rejected (Indonesian local 0-prefix — admin must
 *                         provide the full international number to avoid
 *                         ambiguity when we add non-ID recipients later).
 */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!/^[1-9][0-9]{6,14}$/.test(cleaned)) return null;
  return cleaned;
}

export async function listWhatsAppRecipients() {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden", data: [] as Array<never> };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("whatsapp_notification_recipients")
    .select("id, label, phone_e164, created_at")
    .order("created_at", { ascending: true });

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

export async function addWhatsAppRecipient(input: {
  label: string;
  phone: string;
}) {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };

  const phone = normalizePhone(input.phone);
  if (!phone) {
    return {
      error:
        "Format nomor tidak valid. Pakai format internasional, misal: +6285xxx atau 6285xxx.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("whatsapp_notification_recipients")
    .insert({
      label: input.label.trim(),
      phone_e164: phone,
    });

  if (error) {
    if (error.code === "23505") return { error: "Nomor sudah terdaftar." };
    return { error: error.message };
  }

  revalidatePath("/admin/settings");
  return {};
}

export async function updateWhatsAppRecipient(
  id: string,
  input: { label: string; phone: string }
) {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };

  const phone = normalizePhone(input.phone);
  if (!phone) return { error: "Format nomor tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("whatsapp_notification_recipients")
    .update({ label: input.label.trim(), phone_e164: phone })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return {};
}

export async function deleteWhatsAppRecipient(id: string) {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("whatsapp_notification_recipients")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return {};
}
