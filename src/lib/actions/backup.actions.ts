"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { requireAdmin, type ActionResult } from "./_gates";
import {
  BACKUP_CATEGORIES,
  type BackupCadence,
  type BackupCategory,
  type BackupManifest,
  type BackupRunRow,
  type BackupSettings,
  type FullBackupBundle,
} from "@/lib/backups/categories";
import { dumpCategory } from "@/lib/backups/dump";
import { restoreCategory, type RestoreMode } from "@/lib/backups/restore";

const BUCKET = "database-backups";

function adminClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function cadenceHours(c: BackupCadence): number {
  if (c === "daily") return 24;
  if (c === "every_2_days") return 48;
  return 168;
}

function safeName(date = new Date()): string {
  return `zota-backup-${date.toISOString().replace(/[:.]/g, "-")}.json`;
}

// ---------- Settings ---------------------------------------------------

export async function getBackupSettings(): Promise<
  ActionResult<BackupSettings>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("backup_settings" as never)
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as unknown as BackupSettings };
}

export async function updateBackupSettings(input: {
  enabled: boolean;
  cadence: BackupCadence;
  retentionDays: number;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const retention = Math.max(1, Math.round(input.retentionDays));
  const supabase = adminClient();
  const { error } = await supabase
    .from("backup_settings" as never)
    .update({
      enabled: input.enabled,
      cadence: input.cadence,
      retention_days: retention,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/backups");
  return { ok: true };
}

// ---------- Listing ---------------------------------------------------

export async function listBackupRuns(opts?: {
  limit?: number;
}): Promise<ActionResult<BackupRunRow[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("backup_runs" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as BackupRunRow[] };
}

// ---------- Build bundle (shared by manual + cron) --------------------

async function buildBundle(
  trigger: "manual" | "cron"
): Promise<{ bundle: FullBackupBundle; json: string }> {
  const supabase = adminClient();
  const now = new Date().toISOString();
  const manifest: BackupManifest = {
    version: 1,
    createdAt: now,
    trigger,
    categories: {},
  };
  const categories: FullBackupBundle["categories"] = {};
  for (const c of BACKUP_CATEGORIES) {
    const { bundle, counts, truncated } = await dumpCategory(supabase, c);
    categories[c] = bundle;
    manifest.categories[c] = { tables: counts, truncated };
  }
  const full: FullBackupBundle = {
    version: 1,
    createdAt: now,
    trigger,
    categories,
    manifest,
  };
  return { bundle: full, json: JSON.stringify(full) };
}

// ---------- Run backup ------------------------------------------------

/**
 * Manual backup. Server merangkum semua kategori jadi satu JSON,
 * upload ke bucket (untuk history), lalu return string JSON +
 * filename — client tinggal trigger download.
 */
export async function runBackupNow(): Promise<
  ActionResult<{
    runId: string;
    fileName: string;
    bundleJson: string;
    sizeBytes: number;
  }>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const supabase = adminClient();
  const t0 = Date.now();

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: stuck } = await supabase
    .from("backup_runs" as never)
    .select("id")
    .eq("status", "running")
    .gt("created_at", tenMinAgo)
    .limit(1);
  if (stuck && (stuck as unknown as { id: string }[]).length > 0) {
    return { ok: false, error: "Backup lain sedang berjalan — coba lagi nanti" };
  }

  const fileName = safeName();
  const { data: runInsert, error: runErr } = await supabase
    .from("backup_runs" as never)
    .insert({
      trigger: "manual",
      status: "running",
      storage_prefix: fileName,
    } as never)
    .select("id")
    .single();
  if (runErr || !runInsert)
    return { ok: false, error: runErr?.message ?? "Gagal mencatat run" };
  const runId = (runInsert as unknown as { id: string }).id;

  try {
    const { bundle, json } = await buildBundle("manual");
    const sizeBytes = new TextEncoder().encode(json).length;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, json, {
        contentType: "application/json",
        upsert: true,
      });
    if (upErr) throw new Error(upErr.message);

    await supabase
      .from("backup_runs" as never)
      .update({
        status: "success",
        manifest: bundle.manifest,
        duration_ms: Date.now() - t0,
      } as never)
      .eq("id", runId);

    await pruneOldBackups().catch(() => {});
    revalidatePath("/admin/backups");
    return { ok: true, data: { runId, fileName, bundleJson: json, sizeBytes } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("backup_runs" as never)
      .update({
        status: "failed",
        error: msg,
        duration_ms: Date.now() - t0,
      } as never)
      .eq("id", runId);
    return { ok: false, error: msg };
  }
}

/**
 * Internal — TIDAK gated. Dipanggil oleh cron route handler yang
 * autentikasi via CRON_SECRET header. Bedanya dengan `runBackupNow`:
 * cron HANYA upload ke bucket, tidak return JSON (tidak ada browser).
 */
export async function runBackupCron(): Promise<
  ActionResult<{ runId: string; fileName: string }>
> {
  const supabase = adminClient();
  const t0 = Date.now();

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: stuck } = await supabase
    .from("backup_runs" as never)
    .select("id")
    .eq("status", "running")
    .gt("created_at", tenMinAgo)
    .limit(1);
  if (stuck && (stuck as unknown as { id: string }[]).length > 0) {
    return { ok: false, error: "Backup lain sedang berjalan" };
  }

  const fileName = safeName();
  const { data: runInsert, error: runErr } = await supabase
    .from("backup_runs" as never)
    .insert({
      trigger: "cron",
      status: "running",
      storage_prefix: fileName,
    } as never)
    .select("id")
    .single();
  if (runErr || !runInsert)
    return { ok: false, error: runErr?.message ?? "Gagal mencatat run" };
  const runId = (runInsert as unknown as { id: string }).id;

  try {
    const { bundle, json } = await buildBundle("cron");
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, json, {
        contentType: "application/json",
        upsert: true,
      });
    if (upErr) throw new Error(upErr.message);

    await supabase
      .from("backup_runs" as never)
      .update({
        status: "success",
        manifest: bundle.manifest,
        duration_ms: Date.now() - t0,
      } as never)
      .eq("id", runId);

    await pruneOldBackups().catch(() => {});
    return { ok: true, data: { runId, fileName } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("backup_runs" as never)
      .update({
        status: "failed",
        error: msg,
        duration_ms: Date.now() - t0,
      } as never)
      .eq("id", runId);
    return { ok: false, error: msg };
  }
}

// ---------- Retention sweep -------------------------------------------

async function pruneOldBackups(): Promise<void> {
  const supabase = adminClient();
  const { data: setRow } = await supabase
    .from("backup_settings" as never)
    .select("retention_days")
    .eq("id", 1)
    .maybeSingle();
  const retention =
    (setRow as unknown as { retention_days?: number } | null)?.retention_days ??
    30;
  const cutoff = new Date(
    Date.now() - retention * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data: rows } = await supabase
    .from("backup_runs" as never)
    .select("id, storage_prefix")
    .lt("created_at", cutoff);
  const old = (rows ?? []) as unknown as Array<{
    id: string;
    storage_prefix: string;
  }>;
  if (old.length === 0) return;
  await supabase.storage.from(BUCKET).remove(old.map((r) => r.storage_prefix));
  await supabase
    .from("backup_runs" as never)
    .delete()
    .in(
      "id",
      old.map((r) => r.id)
    );
}

// ---------- Delete a run ----------------------------------------------

export async function deleteBackupRun(runId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data: row } = await supabase
    .from("backup_runs" as never)
    .select("storage_prefix")
    .eq("id", runId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Backup tidak ditemukan" };
  const path = (row as unknown as { storage_prefix: string }).storage_prefix;
  await supabase.storage.from(BUCKET).remove([path]);
  const { error } = await supabase
    .from("backup_runs" as never)
    .delete()
    .eq("id", runId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/backups");
  return { ok: true };
}

// ---------- Re-download dari history (cron-generated) -----------------

export async function getBackupSignedUrl(
  runId: string
): Promise<ActionResult<{ url: string; fileName: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data: row } = await supabase
    .from("backup_runs" as never)
    .select("storage_prefix")
    .eq("id", runId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Backup tidak ditemukan" };
  const path = (row as unknown as { storage_prefix: string }).storage_prefix;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 10);
  if (error || !data) return { ok: false, error: error?.message ?? "Gagal" };
  return { ok: true, data: { url: data.signedUrl, fileName: path } };
}

// ---------- Restore via uploaded bundle -------------------------------

/**
 * Admin upload 1 file backup (.json) yang isi `FullBackupBundle`,
 * lalu pilih kategori mana yang ingin di-restore. Hanya kategori yang
 * dipilih + ADA di file yang akan diproses.
 */
export async function restoreFromBundle(input: {
  bundleJson: string;
  categories: BackupCategory[];
  mode: RestoreMode;
}): Promise<
  ActionResult<{
    reports: Awaited<ReturnType<typeof restoreCategory>>[];
  }>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (input.categories.length === 0)
    return { ok: false, error: "Pilih minimal satu kategori" };

  let bundle: FullBackupBundle;
  try {
    bundle = JSON.parse(input.bundleJson) as FullBackupBundle;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "JSON tidak valid",
    };
  }
  if (!bundle || bundle.version !== 1 || !bundle.categories) {
    return { ok: false, error: "Format backup tidak dikenali (version != 1)" };
  }

  const supabase = adminClient();
  const reports: Awaited<ReturnType<typeof restoreCategory>>[] = [];
  for (const cat of input.categories) {
    const part = bundle.categories[cat];
    if (!part) {
      reports.push({
        category: cat,
        perTable: [
          {
            table: "—",
            inserted: 0,
            skipped: 0,
            error: "Kategori tidak ada di file backup",
          },
        ],
      });
      continue;
    }
    const report = await restoreCategory(supabase, part, input.mode);
    reports.push(report);
  }

  revalidatePath("/admin");
  revalidatePath("/cake-orders");
  revalidatePath("/admin/cake-orders");
  revalidatePath("/dashboard");
  return { ok: true, data: { reports } };
}

// ---------- Cron-only helper ------------------------------------------

export async function dueForCron(): Promise<{
  due: boolean;
  reason: string;
}> {
  const supabase = adminClient();
  const { data: setRow } = await supabase
    .from("backup_settings" as never)
    .select("enabled, cadence")
    .eq("id", 1)
    .maybeSingle();
  const settings = setRow as unknown as {
    enabled: boolean;
    cadence: BackupCadence;
  } | null;
  if (!settings) return { due: false, reason: "settings missing" };
  if (!settings.enabled) return { due: false, reason: "disabled" };
  const { data: last } = await supabase
    .from("backup_runs" as never)
    .select("created_at, status")
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastRow = last as unknown as { created_at: string } | null;
  if (!lastRow) return { due: true, reason: "no prior success" };
  const elapsedHours =
    (Date.now() - new Date(lastRow.created_at).getTime()) / (1000 * 60 * 60);
  const minHours = cadenceHours(settings.cadence);
  if (elapsedHours >= minHours)
    return { due: true, reason: `${elapsedHours.toFixed(1)}h elapsed` };
  return {
    due: false,
    reason: `not due: ${elapsedHours.toFixed(1)}h / ${minHours}h`,
  };
}
