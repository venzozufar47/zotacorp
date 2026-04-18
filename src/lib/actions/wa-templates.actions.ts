"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  listWaTemplates,
  TEMPLATE_DEFAULTS,
  type TemplateKey,
} from "@/lib/whatsapp/templates";

const MAX_LEN = 2000;

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Admin-only read for the /admin/settings Whatsapp tab. Returns every
 * registered template alongside its current body (customized or default)
 * and metadata for rendering the editor UI.
 */
export async function getWaTemplatesForAdmin() {
  const role = await getCurrentRole();
  if (role !== "admin") {
    return { ok: false as const, error: "Forbidden", templates: [] };
  }
  const templates = await listWaTemplates();
  return { ok: true as const, templates };
}

/** Upsert the admin-customized body for a template. */
export async function updateWaTemplate(
  key: TemplateKey,
  rawBody: string
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  if (!(key in TEMPLATE_DEFAULTS)) {
    return { ok: false, error: "Unknown template key" };
  }

  const body = rawBody.trim();
  if (body.length < 1) return { ok: false, error: "Template tidak boleh kosong" };
  if (body.length > MAX_LEN) {
    return { ok: false, error: `Maksimal ${MAX_LEN} karakter` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("whatsapp_templates").upsert(
    {
      template_key: key,
      body,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: "template_key" }
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  return { ok: true };
}

/**
 * Reset a template back to the hardcoded default by removing the
 * customized row. Next render will use `TEMPLATE_DEFAULTS[key]`.
 */
export async function resetWaTemplate(key: TemplateKey): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  if (!(key in TEMPLATE_DEFAULTS)) {
    return { ok: false, error: "Unknown template key" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("whatsapp_templates")
    .delete()
    .eq("template_key", key);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  return { ok: true };
}
