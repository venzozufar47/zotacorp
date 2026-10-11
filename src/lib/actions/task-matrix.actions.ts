"use server";

/**
 * Tampilan matriks Tugas (helicopter view) — admin saja.
 *
 * Baris = penugasan (batch_id), kolom = tanggal mulai. Menyeret karyawan ke
 * sebuah sel = membuat SALINAN tugas itu untuk karyawan tersebut, mulai pada
 * tanggal kolomnya (items & foto referensi disalin dari salinan pertama di
 * baris itu). Memindahkan chip terjadwal ke kolom lain = mengubah tanggal mulai.
 *
 * Penugasan massal/baru tetap lewat createAssignedTask; di sini hanya
 * menambah penerima ke penugasan yang sudah ada dan menggeser jadwal.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { jakartaDateMinusDays, jakartaDateString } from "@/lib/utils/jakarta";
import { sendPushToUser } from "@/lib/push/web-push";
import { checkStartDate } from "@/lib/tasks/start-date";
import { TASK_ASSIGNEE_LOCATION, listEligibleAssigneeIds } from "@/lib/tasks/eligible";
import { TASK_REFERENCE_MAX } from "@/lib/tasks/types";
import {
  insertAttachments,
  removeUnreferencedAttachmentFiles,
  signAttachments,
  validateAttachmentPaths,
} from "./_task-attachments";
import {
  MATRIX_DAY_OPTIONS,
  type MatrixCopy,
  type MatrixEmployee,
  type MatrixRow,
  type RowEditData,
  type TaskMatrixData,
} from "@/lib/tasks/matrix-types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
function nameOf(p: any): string {
  return String(p?.full_name ?? "").trim() || String(p?.nickname ?? "").trim() || "—";
}

async function pushNewTask(userId: string, title: string) {
  try {
    await sendPushToUser(userId, {
      title: "Tugas baru untukmu 📋",
      body: `${title} — buka beranda untuk mengerjakan.`,
      url: "/dashboard",
    });
  } catch (err) {
    console.error("[task-matrix] push failed:", err);
  }
}

function revalidateAll() {
  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/tim");
}

// ── Baca ─────────────────────────────────────────────────────────────────

export async function getTaskMatrix(
  from: string,
  days: number
): Promise<ActionResult<TaskMatrixData>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!YMD.test(from)) return { ok: false, error: "Tanggal tidak valid." };
  if (!(MATRIX_DAY_OPTIONS as readonly number[]).includes(days)) {
    return { ok: false, error: "Rentang tidak valid." };
  }

  const db = createAdminClient() as any;
  const today = jakartaDateString(new Date());
  const to = jakartaDateMinusDays(from, -(days - 1));
  const eligibleIds = [...(await listEligibleAssigneeIds(db))];

  const [
    { data: tasks },
    { data: people },
    { data: openRows },
    { data: backlog },
    { data: categories },
  ] = await Promise.all([
    db
      .from("assigned_tasks")
      .select(
        "id, title, description, assignee_id, status, current_round, start_date, batch_id, created_at, category_id"
      )
      .neq("status", "cancelled")
      .neq("status", "backlog")
      // Mulai di dalam jendela, ATAU sudah mulai sebelumnya tapi belum selesai
      // (tetap terlihat di tepi kiri supaya tidak "hilang" dari pantauan).
      .or(
        `and(start_date.gte.${from},start_date.lte.${to}),and(status.in.(open,submitted),start_date.lt.${from})`
      )
      .order("created_at", { ascending: true })
      .limit(1500),
    // Panel karyawan hanya memuat yang boleh ditugaskan (lihat tasks/eligible).
    eligibleIds.length
      ? db
          .from("profiles")
          .select("id, full_name, nickname, business_unit")
          .in("id", eligibleIds)
          .order("full_name", { ascending: true })
      : Promise.resolve({ data: [] }),
    db.from("assigned_tasks").select("assignee_id").eq("status", "open"),
    // Cetakan yang belum ditugaskan: tampil terus (tidak terikat jendela tanggal)
    // sampai punya salinan aktif, supaya bisa langsung diseret ke karyawan.
    db
      .from("assigned_tasks")
      .select("id, title, description, batch_id, category_id, created_at")
      .eq("status", "backlog")
      .order("created_at", { ascending: true })
      .limit(500),
    db
      .from("assigned_task_categories")
      .select("id, name")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  // Cetakan yang batch-nya sudah punya salinan aktif/selesai sudah terwakili
  // oleh salinannya — hanya yang BELUM ditugaskan yang jadi baris sendiri.
  const backlogBatchIds = (backlog ?? []).map((b: any) => b.batch_id).filter(Boolean);
  const { data: activeCopies } = backlogBatchIds.length
    ? await db
        .from("assigned_tasks")
        .select("batch_id")
        .in("batch_id", backlogBatchIds)
        .in("status", ["open", "submitted", "approved"])
    : { data: [] };
  const batchesWithCopies = new Set<string>((activeCopies ?? []).map((c: any) => c.batch_id));
  const unassigned = (backlog ?? []).filter(
    (b: any) => !b.batch_id || !batchesWithCopies.has(b.batch_id)
  );
  const categoryNameById = new Map<string, string>(
    (categories ?? []).map((c: any) => [c.id, c.name])
  );

  const taskIds: string[] = [...(tasks ?? []), ...unassigned].map((t: any) => t.id);
  const [{ data: items }, { data: completions }, { data: deferrals }, { data: refPhotos }] = taskIds.length
    ? await Promise.all([
        db.from("assigned_task_items").select("id, task_id").in("task_id", taskIds),
        db
          .from("assigned_task_completions")
          .select("task_id, round, photo_path")
          .in("task_id", taskIds),
        db
          .from("assigned_task_deferrals")
          .select("task_id")
          .in("task_id", taskIds)
          .eq("for_date", today),
        db
          .from("assigned_task_attachments")
          .select("task_id, photo_path")
          .in("task_id", taskIds)
          .eq("kind", "reference")
          .not("photo_path", "is", null),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const assigneeIds = [...new Set<string>((tasks ?? []).map((t: any) => t.assignee_id))];
  const { data: assignees } = assigneeIds.length
    ? await db.from("profiles").select("id, full_name, nickname").in("id", assigneeIds)
    : { data: [] };
  const nameById = new Map<string, string>((assignees ?? []).map((p: any) => [p.id, nameOf(p)]));

  const itemCount = new Map<string, number>();
  for (const i of items ?? []) itemCount.set(i.task_id, (itemCount.get(i.task_id) ?? 0) + 1);
  const roundOf = new Map<string, number>((tasks ?? []).map((t: any) => [t.id, t.current_round]));
  const doneCount = new Map<string, number>();
  for (const c of completions ?? []) {
    if (c.photo_path && c.round === roundOf.get(c.task_id)) {
      doneCount.set(c.task_id, (doneCount.get(c.task_id) ?? 0) + 1);
    }
  }
  const deferred = new Set<string>((deferrals ?? []).map((d: any) => d.task_id));

  const rows = new Map<string, MatrixRow>();
  for (const t of tasks ?? []) {
    const rowId = t.batch_id ? `b:${t.batch_id}` : `t:${t.id}`;
    const copy: MatrixCopy = {
      taskId: t.id,
      assigneeId: t.assignee_id,
      assigneeName: nameById.get(t.assignee_id) ?? "—",
      status: t.status,
      startDate: t.start_date,
      round: t.current_round,
      doneCount: doneCount.get(t.id) ?? 0,
      itemCount: itemCount.get(t.id) ?? 0,
      deferredToday: deferred.has(t.id),
    };
    const row: MatrixRow = rows.get(rowId) ?? {
      rowId,
      title: t.title,
      itemCount: copy.itemCount,
      copies: [],
      description: t.description ?? null,
      referenceCount: 0,
      backlogTaskId: null,
      categoryId: t.category_id ?? null,
      categoryName: t.category_id ? categoryNameById.get(t.category_id) ?? null : null,
    };
    row.copies.push(copy);
    rows.set(rowId, row);
  }
  for (const b of unassigned) {
    const rowId = b.batch_id ? `b:${b.batch_id}` : `t:${b.id}`;
    rows.set(rowId, {
      rowId,
      title: b.title,
      itemCount: itemCount.get(b.id) ?? 0,
      copies: [],
      description: b.description ?? null,
      referenceCount: 0,
      backlogTaskId: b.id,
      categoryId: b.category_id ?? null,
      categoryName: b.category_id ? categoryNameById.get(b.category_id) ?? null : null,
    });
  }

  // Foto referensi dibagi antar salinan satu baris (file yang sama) → hitung yang unik.
  const rowOfTask = new Map<string, string>();
  for (const t of [...(tasks ?? []), ...unassigned]) {
    rowOfTask.set(t.id, t.batch_id ? `b:${t.batch_id}` : `t:${t.id}`);
  }
  const refPaths = new Map<string, Set<string>>();
  for (const r of refPhotos ?? []) {
    const rowId = rowOfTask.get(r.task_id);
    if (!rowId) continue;
    const set = refPaths.get(rowId) ?? new Set<string>();
    set.add(r.photo_path);
    refPaths.set(rowId, set);
  }
  for (const [rowId, row] of rows) row.referenceCount = refPaths.get(rowId)?.size ?? 0;

  const openByUser = new Map<string, number>();
  for (const r of openRows ?? []) {
    openByUser.set(r.assignee_id, (openByUser.get(r.assignee_id) ?? 0) + 1);
  }
  const employees: MatrixEmployee[] = (people ?? []).map((p: any) => ({
    id: p.id,
    name: nameOf(p),
    businessUnit: p.business_unit ?? null,
    openCount: openByUser.get(p.id) ?? 0,
  }));

  // URUTAN TETAP: baris tidak boleh melompat saat status/penerima berubah
  // (admin sedang menyeret nama ke baris tertentu). Kunci urut:
  //   1) kategori, sesuai urutan kategori (tanpa kategori di bawah) — baris
  //      sekategori selalu berdampingan;
  //   2) waktu penugasan DIBUAT (paling awal di batch, termasuk cetakan dan
  //      salinan yang di luar jendela) — stabil walau jendela tanggal bergeser;
  //   3) judul, hanya sebagai pemecah seri.
  const batchIds = [...rows.keys()].filter((k) => k[0] === "b").map((k) => k.slice(2));
  const { data: batchRows } = batchIds.length
    ? await db.from("assigned_tasks").select("batch_id, created_at").in("batch_id", batchIds)
    : { data: [] };
  const createdAt = new Map<string, string>();
  for (const b of batchRows ?? []) {
    const key = `b:${b.batch_id}`;
    const prev = createdAt.get(key);
    if (!prev || b.created_at < prev) createdAt.set(key, b.created_at);
  }
  for (const t of tasks ?? []) {
    if (!t.batch_id) createdAt.set(`t:${t.id}`, t.created_at);
  }
  for (const b of unassigned) {
    if (!b.batch_id) createdAt.set(`t:${b.id}`, b.created_at);
  }
  const categoryOrder = new Map<string, number>(
    (categories ?? []).map((c: any, i: number) => [c.id, i])
  );
  const orderOf = (r: MatrixRow) =>
    r.categoryId ? categoryOrder.get(r.categoryId) ?? 9998 : 9999;
  const sorted = [...rows.values()].sort(
    (a, b) =>
      orderOf(a) - orderOf(b) ||
      (createdAt.get(a.rowId) ?? "").localeCompare(createdAt.get(b.rowId) ?? "") ||
      a.title.localeCompare(b.title, "id")
  );

  return {
    ok: true,
    data: {
      from,
      days,
      today,
      rows: sorted,
      employees,
      categories: (categories ?? []).map((c: any) => ({ id: c.id, name: c.name })),
    },
  };
}

// ── Tulis ────────────────────────────────────────────────────────────────

const assignSchema = z.object({
  rowId: z.string().regex(/^[bt]:[0-9a-f-]{36}$/, "Baris tidak valid"),
  assigneeIds: z.array(z.string().uuid()).min(1, "Pilih minimal satu karyawan").max(50),
  startDate: z.string(),
});

/**
 * Tambahkan karyawan ke penugasan yang sudah ada, mulai pada `startDate`.
 * Karyawan yang masih punya salinan berjalan/terjadwal/menunggu verifikasi di
 * baris yang sama dilewati (tidak ada tugas ganda). Mengembalikan id salinan
 * baru supaya UI bisa menawarkan "Urungkan".
 */
export async function assignEmployeesToTask(
  input: z.input<typeof assignSchema>
): Promise<ActionResult<{ created: { taskId: string; assigneeId: string }[]; skipped: string[] }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const { rowId, startDate } = parsed.data;
  const assigneeIds = [...new Set(parsed.data.assigneeIds)];
  const today = jakartaDateString(new Date());
  const startErr = checkStartDate(startDate, today);
  if (startErr) return { ok: false, error: startErr };

  const db = createAdminClient() as any;
  const kind = rowId[0];
  const refId = rowId.slice(2);

  // Salinan pertama di baris = cetakan (judul, keterangan, item, foto referensi).
  let template: any;
  let batchId: string;
  let siblings: any[];
  if (kind === "b") {
    const { data } = await db
      .from("assigned_tasks")
      .select("id, title, description, assignee_id, status, batch_id, category_id")
      .eq("batch_id", refId)
      .order("created_at", { ascending: true });
    siblings = data ?? [];
    // Cetakan backlog (bila ada) selalu jadi acuan: itu versi terbaru dari
    // item/keterangan yang diedit admin sebelum ditugaskan.
    template = siblings.find((s) => s.status === "backlog") ?? siblings[0];
    batchId = refId;
  } else {
    const { data } = await db
      .from("assigned_tasks")
      .select("id, title, description, assignee_id, status, batch_id, category_id")
      .eq("id", refId)
      .maybeSingle();
    template = data;
    siblings = data ? [data] : [];
    // Tugas lama tanpa batch: jadikan satu penugasan supaya baris ini tetap utuh.
    batchId = template?.batch_id ?? crypto.randomUUID();
    if (template && !template.batch_id) {
      await db.from("assigned_tasks").update({ batch_id: batchId }).eq("id", template.id);
    }
  }
  if (!template) return { ok: false, error: "Tugas tidak ditemukan." };

  const eligible = await listEligibleAssigneeIds(db);
  if (assigneeIds.some((id) => !eligible.has(id))) {
    return { ok: false, error: `Penerima harus karyawan aktif ${TASK_ASSIGNEE_LOCATION}.` };
  }

  const busy = new Set<string>(
    siblings
      .filter((s) => s.status === "open" || s.status === "submitted")
      .map((s) => s.assignee_id)
  );
  const targets = assigneeIds.filter((id) => !busy.has(id));
  const skipped = assigneeIds.filter((id) => busy.has(id));
  if (targets.length === 0) {
    return { ok: false, error: "Karyawan itu sudah punya tugas ini yang belum selesai." };
  }

  const [{ data: items }, { data: refs }] = await Promise.all([
    db
      .from("assigned_task_items")
      .select("title, note, sort_order")
      .eq("task_id", template.id)
      .order("sort_order", { ascending: true }),
    db
      .from("assigned_task_attachments")
      .select("photo_path")
      .eq("task_id", template.id)
      .eq("kind", "reference")
      .not("photo_path", "is", null),
  ]);
  if (!items || items.length === 0) return { ok: false, error: "Tugas contoh tidak punya item." };

  const startsNow = startDate <= today;
  const nowIso = new Date().toISOString();
  const { data: created, error } = await db
    .from("assigned_tasks")
    .insert(
      targets.map((assignee_id) => ({
        title: template.title,
        description: template.description,
        assignee_id,
        created_by: gate.userId,
        batch_id: batchId,
        category_id: template.category_id ?? null,
        start_date: startDate,
        start_notified_at: startsNow ? nowIso : null,
        last_reminded_at: startsNow ? nowIso : null,
      }))
    )
    .select("id, assignee_id");
  if (error || !created) return { ok: false, error: error?.message ?? "Gagal menugaskan." };

  const itemRows = created.flatMap((t: any) =>
    items.map((i: any) => ({ task_id: t.id, title: i.title, note: i.note, sort_order: i.sort_order }))
  );
  const { error: itemErr } = await db.from("assigned_task_items").insert(itemRows);
  if (itemErr) {
    await db.from("assigned_tasks").delete().in("id", created.map((t: any) => t.id));
    return { ok: false, error: itemErr.message };
  }
  if ((refs ?? []).length > 0) {
    await db.from("assigned_task_attachments").insert(
      created.flatMap((t: any) =>
        (refs ?? []).map((r: any) => ({
          task_id: t.id,
          kind: "reference",
          round: 1,
          photo_path: r.photo_path,
          uploaded_by: gate.userId,
        }))
      )
    );
  }

  if (startsNow) await Promise.all(created.map((t: any) => pushNewTask(t.assignee_id, template.title)));
  revalidateAll();
  return {
    ok: true,
    data: {
      created: created.map((t: any) => ({ taskId: t.id, assigneeId: t.assignee_id })),
      skipped,
    },
  };
}

const LIVE_STATUSES = ["backlog", "open", "submitted"] as const;

/** Salinan penugasan yang masih hidup (urut dari yang paling awal dibuat). */
async function loadLiveRow(db: any, rowId: string): Promise<any[]> {
  const q = db
    .from("assigned_tasks")
    .select("id, title, description, assignee_id, status, current_round, start_date, created_at")
    .in("status", LIVE_STATUSES)
    .order("created_at", { ascending: true });
  const { data } = await (rowId[0] === "b" ? q.eq("batch_id", rowId.slice(2)) : q.eq("id", rowId.slice(2)));
  return data ?? [];
}

/**
 * Checklist hanya boleh diganti bila TIDAK ada progres di salinan mana pun:
 * penggantian menghapus item lama, dan itu akan membuang foto bukti serta
 * riwayat ronde sebelumnya. Mengembalikan alasan terkunci, atau null.
 */
async function itemsLockReason(db: any, live: any[]): Promise<string | null> {
  if (live.some((t) => t.status === "submitted")) {
    return "Ada penerima yang sudah mengirim tugas ini (menunggu verifikasi).";
  }
  if (live.some((t) => t.current_round > 1)) {
    return "Ada penerima yang mengulang tugas ini setelah ditolak.";
  }
  const ids = live.map((t) => t.id);
  const [{ count: photos }, { count: extras }] = await Promise.all([
    db.from("assigned_task_completions").select("id", { count: "exact", head: true }).in("task_id", ids),
    db.from("assigned_task_extra_photos").select("id", { count: "exact", head: true }).in("task_id", ids),
  ]);
  if ((photos ?? 0) > 0 || (extras ?? 0) > 0) {
    return "Ada penerima yang sudah mulai mengerjakan (ada foto).";
  }
  return null;
}

const rowIdSchema = z.string().regex(/^[bt]:[0-9a-f-]{36}$/, "Baris tidak valid");

/** Muat judul, keterangan, dan checklist satu penugasan untuk dialog Edit tugas. */
export async function getRowEditData(rowId: string): Promise<ActionResult<RowEditData>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!rowIdSchema.safeParse(rowId).success) return { ok: false, error: "Baris tidak valid" };

  const db = createAdminClient() as any;
  const live = await loadLiveRow(db, rowId);
  if (live.length === 0) return { ok: false, error: "Tugas tidak ditemukan atau sudah selesai/dibatalkan." };

  // Acuan: cetakan backlog bila ada (versi terbaru), kalau tidak salinan pertama.
  const ref = live.find((t) => t.status === "backlog") ?? live[0];
  const [{ data: items }, lockedReason, { data: refRows }] = await Promise.all([
    db
      .from("assigned_task_items")
      .select("title, note, sort_order")
      .eq("task_id", ref.id)
      .order("sort_order", { ascending: true }),
    itemsLockReason(db, live),
    db
      .from("assigned_task_attachments")
      .select("photo_path")
      .eq("task_id", ref.id)
      .eq("kind", "reference")
      .not("photo_path", "is", null)
      .order("created_at", { ascending: true }),
  ]);
  const refUrls = await signAttachments((refRows ?? []).map((r: any) => r.photo_path));
  return {
    ok: true,
    data: {
      title: ref.title,
      description: ref.description ?? null,
      items: (items ?? []).map((i: any) => ({ title: i.title, note: i.note ?? null })),
      // Penerima = salinan hidup selain cetakan backlog.
      liveCount: live.filter((t) => t.status !== "backlog").length,
      itemsLockedReason: lockedReason,
      references: (refRows ?? [])
        .filter((r: any) => refUrls.has(r.photo_path))
        .map((r: any) => ({ path: r.photo_path as string, url: refUrls.get(r.photo_path) as string })),
    },
  };
}

const rowEditSchema = z.object({
  rowId: rowIdSchema,
  title: z.string().trim().min(1, "Judul wajib diisi").max(120, "Judul maksimal 120 karakter"),
  description: z.string().trim().max(1000, "Maksimal 1000 karakter").nullable(),
  /** Undefined = checklist tidak diubah. */
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1, "Judul item wajib diisi").max(200),
        note: z.string().trim().max(500).nullable().optional(),
      })
    )
    .min(1, "Minimal satu item checklist")
    .max(40, "Maksimal 40 item")
    .optional(),
  /** Foto referensi baru (sudah diunggah ke bucket task-attachments) dan path foto lama yang dibuang. */
  addAttachmentPaths: z.array(z.string()).max(TASK_REFERENCE_MAX).optional(),
  removeAttachmentPaths: z.array(z.string()).max(TASK_REFERENCE_MAX * 2).optional(),
});

/**
 * Edit satu penugasan langsung dari matriks: judul + keterangan berlaku ke
 * semua salinan yang masih hidup (arsip disetujui/dibatalkan dibiarkan);
 * checklist (bila dikirim) diganti utuh di semua salinan, hanya selama belum
 * ada progres (lihat itemsLockReason — dicek ulang di sini karena data bisa
 * berubah sejak dialog dibuka). Item baru disisipkan DULU, baru yang lama
 * dihapus, supaya tugas tidak pernah sempat tanpa item.
 */
export async function updateRowTask(input: z.input<typeof rowEditSchema>): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = rowEditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const { rowId, title, items } = parsed.data;
  const description = parsed.data.description?.trim() ? parsed.data.description.trim() : null;

  const db = createAdminClient() as any;
  const live = await loadLiveRow(db, rowId);
  if (live.length === 0) return { ok: false, error: "Tugas tidak ditemukan atau sudah selesai/dibatalkan." };
  const liveIds: string[] = live.map((t) => t.id);

  // Foto referensi: validasi & kuota per salinan SEBELUM ada yang ditulis.
  const addPaths = [...new Set(parsed.data.addAttachmentPaths ?? [])];
  const removePaths = [...new Set(parsed.data.removeAttachmentPaths ?? [])];
  if (addPaths.length > 0 || removePaths.length > 0) {
    const attErr = await validateAttachmentPaths(gate.userId, addPaths);
    if (attErr) return { ok: false, error: attErr };
    const { data: refRows } = await db
      .from("assigned_task_attachments")
      .select("task_id, photo_path")
      .in("task_id", liveIds)
      .eq("kind", "reference");
    for (const id of liveIds) {
      const mine = (refRows ?? []).filter((r: any) => r.task_id === id);
      const after =
        mine.filter((r: any) => !removePaths.includes(r.photo_path)).length + addPaths.length;
      if (after > TASK_REFERENCE_MAX) {
        return { ok: false, error: `Maksimal ${TASK_REFERENCE_MAX} foto referensi per tugas.` };
      }
    }
  }

  let itemTargets: any[] = [];
  if (items) {
    const reason = await itemsLockReason(db, live);
    if (reason) return { ok: false, error: `Checklist tidak bisa diubah. ${reason}` };
    itemTargets = live; // semua backlog/open tanpa progres
  }

  // Foto baru dipasang DULU (bisa dibatalkan); yang lama dibuang paling akhir.
  const rollbackAdded = async () => {
    if (addPaths.length === 0) return;
    await db
      .from("assigned_task_attachments")
      .delete()
      .in("task_id", liveIds)
      .eq("kind", "reference")
      .in("photo_path", addPaths);
    await removeUnreferencedAttachmentFiles(db, addPaths);
  };
  if (addPaths.length > 0) {
    const addErr = await insertAttachments(db, liveIds, addPaths, "reference", 1, gate.userId);
    if (addErr) {
      await rollbackAdded();
      return { ok: false, error: addErr };
    }
  }

  if (items && itemTargets.length > 0) {
    const { data: oldItems } = await db
      .from("assigned_task_items")
      .select("id")
      .in("task_id", itemTargets.map((t) => t.id));
    const { data: inserted, error: insErr } = await db
      .from("assigned_task_items")
      .insert(
        itemTargets.flatMap((t) =>
          items.map((it, idx) => ({
            task_id: t.id,
            title: it.title,
            note: it.note || null,
            sort_order: idx,
          }))
        )
      )
      .select("id");
    if (insErr || !inserted) {
      await rollbackAdded();
      return { ok: false, error: insErr?.message ?? "Gagal menyimpan checklist" };
    }

    const oldIds = (oldItems ?? []).map((i: any) => i.id);
    if (oldIds.length > 0) {
      const { error: delErr } = await db.from("assigned_task_items").delete().in("id", oldIds);
      if (delErr) {
        // Batalkan penyisipan supaya tidak ada item ganda.
        await db.from("assigned_task_items").delete().in("id", inserted.map((i: any) => i.id));
        await rollbackAdded();
        return { ok: false, error: delErr.message };
      }
    }
  }

  const { error: headErr } = await db
    .from("assigned_tasks")
    .update({ title, description })
    .in("id", liveIds);
  if (headErr) {
    await rollbackAdded();
    return { ok: false, error: headErr.message };
  }

  // Semua perubahan lain sudah berhasil → baru buang foto referensi lama (tak bisa dibatalkan).
  if (removePaths.length > 0) {
    await db
      .from("assigned_task_attachments")
      .delete()
      .in("task_id", liveIds)
      .eq("kind", "reference")
      .in("photo_path", removePaths);
    await removeUnreferencedAttachmentFiles(db, removePaths);
  }

  // Penerima yang tugasnya sudah tampil perlu tahu daftar yang harus dikerjakan berubah.
  if (items) {
    const today = jakartaDateString(new Date());
    await Promise.all(
      itemTargets
        .filter((t) => t.status === "open" && t.assignee_id && t.start_date && t.start_date <= today)
        .map((t) =>
          sendPushToUser(t.assignee_id, {
            title: "Tugas diperbarui 📋",
            body: `Checklist "${title}" diubah admin. Buka beranda untuk melihat item terbaru.`,
            url: "/dashboard",
          }).catch((err: unknown) => console.error("[task-matrix] push failed:", err))
        )
    );
  }
  revalidateAll();
  return { ok: true };
}

const reassignSchema = z.object({
  taskId: z.string().uuid(),
  targetRowId: z.string().regex(/^[bt]:[0-9a-f-]{36}$/, "Baris tidak valid"),
  startDate: z.string(),
});

/**
 * Pindahkan karyawan dari satu tugas ke tugas lain (seret chip ke baris lain).
 * Salinan lama dibatalkan dan karyawan mendapat salinan baru di tugas tujuan
 * pada `startDate`. Hanya untuk salinan yang BELUM dikerjakan sama sekali
 * (status dikerjakan, ronde 1, tanpa foto) — yang sudah ada progres/riwayat
 * tidak boleh dipindah supaya bukti & verifikasinya tidak hilang. Penugasan
 * ke tujuan dilakukan DULU; baru setelah berhasil salinan lama dibatalkan,
 * jadi kegagalan di tengah tidak pernah membuat karyawan kehilangan tugas.
 */
export async function reassignCopyToTask(
  input: z.input<typeof reassignSchema>
): Promise<ActionResult<{ newTaskId: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = reassignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const { taskId, targetRowId, startDate } = parsed.data;

  const db = createAdminClient() as any;
  const { data: task } = await db
    .from("assigned_tasks")
    .select("id, assignee_id, status, current_round, batch_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "Tugas tidak ditemukan" };
  if (task.status !== "open" || task.current_round !== 1 || !task.assignee_id) {
    return { ok: false, error: "Hanya tugas yang belum dikerjakan yang bisa dipindah ke tugas lain." };
  }

  const sourceRowId = task.batch_id ? `b:${task.batch_id}` : `t:${task.id}`;
  if (sourceRowId === targetRowId) {
    return { ok: false, error: "Pilih baris tugas yang berbeda." };
  }

  const [{ count: photos }, { count: extras }] = await Promise.all([
    db
      .from("assigned_task_completions")
      .select("id", { count: "exact", head: true })
      .eq("task_id", taskId),
    db
      .from("assigned_task_extra_photos")
      .select("id", { count: "exact", head: true })
      .eq("task_id", taskId),
  ]);
  if ((photos ?? 0) > 0 || (extras ?? 0) > 0) {
    return { ok: false, error: "Tugas ini sudah mulai dikerjakan (ada foto) — tidak bisa dipindah." };
  }

  const assigned = await assignEmployeesToTask({
    rowId: targetRowId,
    assigneeIds: [task.assignee_id],
    startDate,
  });
  if (!assigned.ok) return assigned;
  const newTaskId = assigned.data?.created[0]?.taskId;
  if (!newTaskId) {
    return { ok: false, error: "Karyawan itu sudah punya tugas tujuan yang belum selesai." };
  }

  // Batalkan salinan lama — bersyarat (masih open): kalau karyawan sempat
  // mengirim/berubah di antara, batalkan salinan baru dan laporkan.
  const { data: cancelled } = await db
    .from("assigned_tasks")
    .update({ status: "cancelled" })
    .eq("id", taskId)
    .eq("status", "open")
    .select("id");
  if (!cancelled || cancelled.length === 0) {
    await db.from("assigned_tasks").update({ status: "cancelled" }).eq("id", newTaskId);
    revalidateAll();
    return { ok: false, error: "Tugas berubah saat dipindah — muat ulang lalu coba lagi." };
  }
  revalidateAll();
  return { ok: true, data: { newTaskId } };
}

const moveSchema = z.object({ taskId: z.string().uuid(), startDate: z.string() });

/** Geser tanggal mulai tugas yang BELUM mulai (seret chip ke kolom lain). */
export async function moveTaskStart(input: z.input<typeof moveSchema>): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Input tidak valid" };
  const { taskId, startDate } = parsed.data;

  const today = jakartaDateString(new Date());
  const startErr = checkStartDate(startDate, today);
  if (startErr) return { ok: false, error: startErr };

  const db = createAdminClient() as any;
  const { data: task } = await db
    .from("assigned_tasks")
    .select("id, title, assignee_id, status, start_date, start_notified_at")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "Tugas tidak ditemukan" };
  if (task.status !== "open" || task.start_date <= today) {
    return { ok: false, error: "Hanya tugas terjadwal (belum mulai) yang bisa digeser." };
  }
  if (task.start_date === startDate) return { ok: true };

  const patch: Record<string, unknown> = { start_date: startDate };
  const startsNow = startDate <= today && !task.start_notified_at;
  if (startsNow) {
    patch.start_notified_at = new Date().toISOString();
    patch.last_reminded_at = new Date().toISOString();
  }
  const { data: updated } = await db
    .from("assigned_tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("status", "open")
    .gt("start_date", today)
    .select("id");
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Tugas sudah dimulai atau berubah — muat ulang." };
  }
  if (startsNow) await pushNewTask(task.assignee_id, task.title);
  revalidateAll();
  return { ok: true };
}
