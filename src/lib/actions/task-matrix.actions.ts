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
import {
  MATRIX_DAY_OPTIONS,
  type MatrixCopy,
  type MatrixEmployee,
  type MatrixRow,
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
        "id, title, assignee_id, status, current_round, start_date, batch_id, created_at, category_id"
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
    db
      .from("profiles")
      .select("id, full_name, nickname, business_unit")
      .eq("role", "employee")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    db.from("assigned_tasks").select("assignee_id").eq("status", "open"),
    // Cetakan yang belum ditugaskan: tampil terus (tidak terikat jendela tanggal)
    // sampai punya salinan aktif, supaya bisa langsung diseret ke karyawan.
    db
      .from("assigned_tasks")
      .select("id, title, batch_id, category_id, created_at")
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
  const [{ data: items }, { data: completions }, { data: deferrals }] = taskIds.length
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
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

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
      backlogTaskId: b.id,
      categoryId: b.category_id ?? null,
      categoryName: b.category_id ? categoryNameById.get(b.category_id) ?? null : null,
    });
  }

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

  const { data: people } = await db
    .from("profiles")
    .select("id, role, is_active")
    .in("id", assigneeIds);
  const valid = new Set<string>(
    (people ?? []).filter((p: any) => p.role === "employee" && p.is_active).map((p: any) => p.id)
  );
  if (assigneeIds.some((id) => !valid.has(id))) {
    return { ok: false, error: "Penerima harus karyawan aktif." };
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
