/**
 * Logika murni halaman SOP (tanpa DB, tanpa React): agregasi kepatuhan, runut penyebab,
 * daftar temuan, dan evaluasi perbaikan SOP. Semuanya diturunkan dari
 * `CleaningRangeReport` — satu sumber kebenaran, jadi angka di kartu, di tabel titik,
 * dan di kepatuhan karyawan tidak mungkin saling membantah.
 */

import { jakartaDateString } from "@/lib/utils/jakarta";
import type {
  CleaningDayStatus,
  CleaningRangeReport,
  PointCell,
  PointReport,
} from "./range-report";

/* ── status → kunci tampilan ─────────────────────────────────────────────── */

/** Kunci tampilan: `miss_absent` dipanggil `abs`, `redo` tetap `redo`. */
export type SegKey = "ok" | "late" | "redo" | "abs" | "miss";
export const SEG_LABEL: Record<SegKey, string> = {
  ok: "Tepat waktu",
  late: "Telat",
  redo: "Perlu ulang",
  abs: "Shift tidak masuk",
  miss: "Tidak dikerjakan",
};

export function segOf(status: CleaningDayStatus): SegKey | null {
  switch (status) {
    case "ok":
    case "late":
    case "redo":
    case "miss":
      return status;
    case "miss_absent":
      return "abs";
    default:
      return null; // off / pending bukan bagian dari penyebut
  }
}

export interface SegCounts {
  ok: number;
  late: number;
  redo: number;
  abs: number;
  miss: number;
  /** Penyebut: seluruh sel terjadwal yang sudah lewat (tanpa off/pending). */
  n: number;
  /** % (tepat + telat) — "beres" menurut skor cabang. */
  pct: number;
  /** % hanya yang tepat waktu. */
  tepat: number;
}

const emptyCounts = (): SegCounts => ({ ok: 0, late: 0, redo: 0, abs: 0, miss: 0, n: 0, pct: 100, tepat: 100 });

function finish(c: SegCounts): SegCounts {
  c.pct = c.n ? Math.round(((c.ok + c.late) / c.n) * 100) : 100;
  c.tepat = c.n ? Math.round((c.ok / c.n) * 100) : 100;
  return c;
}

/**
 * Hitung sel pada hari-hari tertentu. `days` = himpunan YMD; `branchKey` null = semua cabang.
 * Mengikuti persis aturan skor cabang di laporan: off & pending tidak dihitung.
 */
export function aggregate(
  report: Pick<CleaningRangeReport, "points">,
  days: ReadonlySet<string>,
  branchKey: string | null
): SegCounts {
  const c = emptyCounts();
  for (const p of report.points) {
    if (branchKey && p.branchKey !== branchKey) continue;
    for (const cell of p.cells) {
      if (!days.has(cell.ymd)) continue;
      const k = segOf(cell.status);
      if (!k) continue;
      c[k]++;
      c.n++;
    }
  }
  return finish(c);
}

/** Himpunan hari kalender [from..to] (indeks pada `report.days`, inklusif-eksklusif). */
export function daySlice(report: Pick<CleaningRangeReport, "days">, startIdx: number, endIdx?: number): Set<string> {
  return new Set(report.days.slice(Math.max(0, startIdx), endIdx).map((d) => d.ymd));
}

/** Kepatuhan harian (semua cabang / satu cabang) — untuk sparkline. Hari tanpa sel dilewati. */
export function dailySeries(
  report: Pick<CleaningRangeReport, "points" | "days">,
  branchKey: string | null
): Array<{ ymd: string; pct: number; n: number }> {
  const by = new Map<string, SegCounts>();
  for (const p of report.points) {
    if (branchKey && p.branchKey !== branchKey) continue;
    for (const cell of p.cells) {
      const k = segOf(cell.status);
      if (!k) continue;
      const c = by.get(cell.ymd) ?? emptyCounts();
      c[k]++;
      c.n++;
      by.set(cell.ymd, c);
    }
  }
  return report.days
    .filter((d) => by.has(d.ymd))
    .map((d) => {
      const c = finish(by.get(d.ymd)!);
      return { ymd: d.ymd, pct: c.pct, n: c.n };
    });
}

/* ── runut penyebab ──────────────────────────────────────────────────────── */

export interface TraceRow {
  ymd: string;
  status: CleaningDayStatus;
  userId: string | null;
}

export type CauseKind = "single" | "person" | "sop";

export interface Trace {
  /** Sel terjadwal 14 hari terakhir (termasuk pending hari ini), urut lama→baru. */
  rows: TraceRow[];
  /** Hanya yang sudah lewat jadwalnya. */
  sched: TraceRow[];
  bad: TraceRow[];
  /** Siapa yang kebagian saat gagal, terbanyak dulu. `of` = jumlah giliran terjadwalnya. */
  who: Array<{ userId: string; n: number; of: number }>;
  pct: number;
  cause: { kind: CauseKind; title: string; hint: string };
}

const isBadStatus = (s: CleaningDayStatus) => s === "miss" || s === "late" || s === "redo";

/**
 * Apakah kegagalan terpusat pada satu orang (→ pembinaan) atau tersebar di banyak orang
 * (→ SOP/titiknya yang bermasalah)? Heuristik sederhana dan sengaja transparan: ≥60% kegagalan
 * pada satu orang = terpusat. `shift tidak masuk` tidak dihitung kegagalan — bukan salah SOP
 * maupun orangnya.
 */
export function traceOf(
  point: PointReport,
  nameOf: (userId: string) => string,
  lastDays = 14
): Trace {
  const cells = point.cells.slice(-lastDays);
  const rows: TraceRow[] = cells
    .filter((c) => c.status !== "off")
    .map((c) => ({ ymd: c.ymd, status: c.status, userId: c.userId }));
  const sched = rows.filter((r) => r.status !== "pending");
  const bad = sched.filter((r) => isBadStatus(r.status));
  const by = new Map<string, number>();
  for (const r of bad) if (r.userId) by.set(r.userId, (by.get(r.userId) ?? 0) + 1);
  const turns = new Map<string, number>();
  for (const r of sched) if (r.userId) turns.set(r.userId, (turns.get(r.userId) ?? 0) + 1);
  const who = [...by.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([userId, n]) => ({ userId, n, of: turns.get(userId) ?? n }));
  // Sama dengan skor cabang: yang "beres" = tepat + telat; shift tidak masuk tetap ikut penyebut.
  const good = sched.filter((r) => r.status === "ok" || r.status === "late").length;
  const pct = sched.length ? Math.round((good / sched.length) * 100) : 100;
  const share = bad.length && who.length ? who[0].n / bad.length : 0;
  let cause: Trace["cause"];
  if (bad.length < 2) {
    cause = {
      kind: "single",
      title: "Belum ada pola",
      hint:
        bad.length === 0
          ? "Tidak ada hari bermasalah dalam 14 hari terakhir."
          : "Baru 1 hari bermasalah dalam 14 hari — belum cukup untuk menyimpulkan penyebabnya (orang atau SOP). Cukup ditindak sekali lalu dipantau; bila terulang, polanya akan terlihat di sini.",
    };
  } else if (share >= 0.6) {
    const first = nameOf(who[0].userId).split(" ")[0];
    cause = {
      kind: "person",
      title: `Terpusat pada ${first}`,
      hint: `${who[0].n} dari ${bad.length} masalah terjadi pada giliran ${first}. Catatan pembinaan lebih tepat daripada mengubah SOP.`,
    };
  } else {
    cause = {
      kind: "sop",
      title: `Tersebar di ${who.length} pelaksana`,
      hint: "Orang berganti, masalah tetap — indikasi SOP atau titiknya yang perlu diperbaiki (standar kurang jelas, alat kurang, jadwal tak masuk akal).",
    };
  }
  return { rows, sched, bad, who, pct, cause };
}

/** Jumlah hari bermasalah pada satu titik, opsional hanya untuk satu jenis. */
export function lossOf(point: PointReport, seg: SegKey | null, lastDays = 14): { loss: number; n: number } {
  const cs: Record<string, number> = {};
  let n = 0;
  for (const cell of point.cells.slice(-lastDays)) {
    const k = segOf(cell.status);
    if (!k) continue;
    cs[k] = (cs[k] ?? 0) + 1;
    n++;
  }
  const loss = seg ? cs[seg] ?? 0 : (cs.miss ?? 0) + (cs.late ?? 0) + (cs.redo ?? 0) + (cs.abs ?? 0);
  return { loss, n };
}

/* ── temuan ──────────────────────────────────────────────────────────────── */

export type FindingKind = "miss" | "redo" | "rushed" | "issue" | "stale";

export const KIND_META: Record<FindingKind, { label: string; tone: "bad" | "warn" | "muted"; priority: number }> = {
  miss: { label: "Belum dikerjakan", tone: "bad", priority: 0 },
  redo: { label: "Foto perlu ulang", tone: "warn", priority: 1 },
  rushed: { label: "Foto terlalu cepat", tone: "warn", priority: 2 },
  issue: { label: "Kendala karyawan", tone: "warn", priority: 3 },
  stale: { label: "Lama tak terpantau", tone: "muted", priority: 4 },
};

export interface Finding {
  /** Stabil antar render: jenis + titik (+ penanda kejadian). */
  id: string;
  kind: FindingKind;
  itemId: string;
  branchKey: string;
  checklistId: string;
  /** Sidik kejadian — dipakai tanda "sudah dicek". Berubah bila ada kejadian baru. */
  ackKey: string;
  /** Tanggal kejadian yang jadi acuan foto (YMD); null bila tak ada foto yang relevan. */
  ymd: string | null;
  /** Pelaksana yang pantas dihubungi; null bila tak diketahui. */
  userId: string | null;
  /** Penanggung jawab tetap titik ini (penugasan per-orang). */
  assigneeIds: string[];
  /** Isi tambahan: alasan kendala, dst. */
  reason?: string;
  issueId?: string;
  rushed?: { userId: string; date: string; checklistId: string; photos: number; minutes: number; secPerPhoto: number };
  /** Hari kerja berturut-turut terlewat (jenis miss). */
  miss?: number;
  /** Hari terjadwal sejak terakhir dikerjakan (jenis stale/miss); null = tak ada bukti di rentang. */
  lastGoodAgo: number | null;
  ageDays: number | null;
  /** Dibuat saat admin membuka sebuah titik dari tabel (bukan temuan otomatis): tak bisa "dicek". */
  manual?: boolean;
}

export interface FindingIssueInput {
  id: string;
  itemId: string;
  date: string;
  reason: string;
}

/** Hari kalender dari `ymd` ke `to` (≥0). */
function calDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const lastCell = (p: PointReport, pred: (c: PointCell) => boolean): PointCell | null => {
  for (let i = p.cells.length - 1; i >= 0; i--) if (pred(p.cells[i])) return p.cells[i];
  return null;
};

/**
 * Semua temuan terbuka, terpenting dulu. `acked` = himpunan `${itemId}|${ackKey}` yang sudah
 * ditandai dicek. `issues` = kendala terbuka dari karyawan.
 */
export function buildFindings(
  report: CleaningRangeReport,
  issues: readonly FindingIssueInput[],
  acked: ReadonlySet<string>
): Finding[] {
  const out: Finding[] = [];
  const byItem = new Map(report.points.map((p) => [p.itemId, p]));
  const push = (f: Finding) => {
    if (acked.has(`${f.itemId}|${f.ackKey}`)) return;
    out.push(f);
  };

  for (const p of report.points) {
    const base = {
      itemId: p.itemId,
      branchKey: p.branchKey,
      checklistId: p.checklistId,
      assigneeIds: p.assigneeIds,
      lastGoodAgo: p.lastGoodAgo,
      ageDays: p.ageDays,
    };
    const lastMiss = lastCell(p, (c) => c.status === "miss" || c.status === "miss_absent");
    const lastRedo = lastCell(p, (c) => c.status === "redo");
    if (p.missStreak >= 1 && lastMiss) {
      push({
        ...base,
        id: `miss:${p.itemId}`,
        kind: "miss",
        ackKey: `miss:${lastMiss.ymd}`,
        ymd: p.lastGoodYmd,
        userId: lastMiss.userId,
        miss: p.missStreak,
      });
    } else if (lastRedo && p.cells.slice(-4).some((c) => c.status === "redo")) {
      push({
        ...base,
        id: `redo:${p.itemId}`,
        kind: "redo",
        ackKey: `redo:${lastRedo.ymd}`,
        ymd: lastRedo.ymd,
        userId: lastRedo.userId,
      });
    } else if (p.ageDays == null || p.ageDays >= 4) {
      push({
        ...base,
        id: `stale:${p.itemId}`,
        kind: "stale",
        ackKey: `stale:${p.lastGoodYmd ?? "none"}`,
        ymd: p.lastGoodYmd,
        userId: p.assigneeIds.length === 1 ? p.assigneeIds[0] : null,
      });
    }
  }

  for (const i of issues) {
    const p = byItem.get(i.itemId);
    if (!p) continue; // titik sudah tak aktif/tak ter-assign: tak ada konteks untuk dirunut
    push({
      id: `issue:${i.id}`,
      kind: "issue",
      itemId: p.itemId,
      branchKey: p.branchKey,
      checklistId: p.checklistId,
      ackKey: `issue:${i.id}`,
      ymd: i.date,
      userId: null,
      assigneeIds: p.assigneeIds,
      reason: i.reason,
      issueId: i.id,
      lastGoodAgo: p.lastGoodAgo,
      ageDays: p.ageDays,
    });
  }

  // Sesi terburu-buru: dikaitkan ke titik pertama checklist-nya di cabang itu (konteks runut).
  const lastTo = report.days[report.days.length - 1]?.ymd;
  for (const r of report.rushed) {
    if (lastTo && calDaysBetween(r.date, lastTo) > 14) continue;
    const p = report.points.find((x) => x.checklistId === r.checklistId && x.branchKey === r.branchKey);
    if (!p) continue;
    push({
      id: `rushed:${r.userId}|${r.date}|${r.checklistId}`,
      kind: "rushed",
      itemId: p.itemId,
      branchKey: p.branchKey,
      checklistId: p.checklistId,
      ackKey: `rushed:${r.userId}|${r.date}|${r.checklistId}`,
      ymd: r.date,
      userId: r.userId,
      assigneeIds: p.assigneeIds,
      rushed: {
        userId: r.userId,
        date: r.date,
        checklistId: r.checklistId,
        photos: r.photos,
        minutes: r.minutes,
        secPerPhoto: r.secPerPhoto,
      },
      lastGoodAgo: p.lastGoodAgo,
      ageDays: p.ageDays,
    });
  }

  return out.sort(
    (a, b) =>
      KIND_META[a.kind].priority - KIND_META[b.kind].priority ||
      (b.miss ?? 0) - (a.miss ?? 0) ||
      (b.ageDays ?? 999) - (a.ageDays ?? 999)
  );
}

/**
 * Temuan yang punya foto/sesi untuk disidak (cakupan "Temuan" di Sidak foto dan lencana tabnya).
 * Yang belum dikerjakan sama sekali tidak ikut: tak ada foto yang bisa dinilai.
 */
export const isSidakFinding = (f: Finding): boolean => f.kind !== "miss" && !!f.ymd;

/** Filter jenis masalah di bar → temuan yang relevan. Jenis lain (telat, shift) tak punya temuan: tampil semua. */
export const matchesSeg = (f: Finding, seg: SegKey | null): boolean =>
  !seg || (seg !== "miss" && seg !== "redo") || f.kind === seg;

/** Temuan sementara untuk titik yang dibuka manual dari tabel penyumbang masalah. */
export function manualFinding(point: PointReport, userId: string | null): Finding {
  return {
    id: `manual:${point.itemId}`,
    kind: "stale",
    itemId: point.itemId,
    branchKey: point.branchKey,
    checklistId: point.checklistId,
    ackKey: `manual:${point.itemId}`,
    ymd: point.lastGoodYmd,
    userId,
    assigneeIds: point.assigneeIds,
    lastGoodAgo: point.lastGoodAgo,
    ageDays: point.ageDays,
    manual: true,
  };
}

/** "kemarin", "3 hari lalu" — hari KALENDER. */
export function agoLabel(n: number | null): string {
  if (n == null) return "belum pernah";
  if (n <= 0) return "hari ini";
  if (n === 1) return "kemarin";
  return `${n} hari lalu`;
}

/** Satu kalimat ringkas isi temuan, untuk baris daftar & kepala detail. */
export function findingLine(f: Finding, fmtDay: (ymd: string) => string): string {
  switch (f.kind) {
    case "miss":
      return `Belum dikerjakan ${f.miss} hari kerja · ${
        f.lastGoodAgo == null ? "belum pernah dikerjakan" : `terakhir dikerjakan ${agoLabel(f.lastGoodAgo)}`
      }`;
    case "redo":
      return `Foto ditandai perlu ulang${f.ymd ? ` · ${fmtDay(f.ymd)}` : ""}`;
    case "rushed":
      return f.rushed
        ? `${f.rushed.photos} foto dalam ${f.rushed.minutes} menit (${f.rushed.secPerPhoto} dtk/foto)`
        : "Foto masuk terlalu cepat";
    case "issue":
      return f.reason ?? "Kendala dari karyawan";
    case "stale":
      return f.lastGoodAgo == null
        ? "Belum pernah dikerjakan sejak ditugaskan"
        : `Terakhir dikerjakan ${agoLabel(f.lastGoodAgo)}`;
  }
}

/* ── perbaikan SOP ───────────────────────────────────────────────────────── */

export const FIX_MONITOR_DAYS = 7;

export const FIX_OPTIONS: ReadonlyArray<readonly [string, string]> = [
  ["Perjelas standar slot foto", "Tulis contoh foto & apa yang dianggap bersih"],
  ["Tambah / pecah slot foto", "Titik terlalu luas untuk satu foto"],
  ["Ubah jadwal atau pool petugas", "Rotasi tidak masuk akal untuk titik ini"],
  ["Sediakan alat / perlengkapan", "Kendala bukan di orangnya"],
  ["Hapus / gabung titik", "Titik tidak lagi relevan"],
];

export interface SopFixRow {
  id: string;
  itemId: string;
  branchKey: string;
  action: string;
  note: string | null;
  basePct: number;
  startedOn: string;
  createdAt: string;
}

/** Satu baris riwayat perubahan checklist (cleaning_checklist_revisions). */
export interface RevisionRow {
  checklistId: string;
  /** ISO timestamp. */
  at: string;
  summary: string;
}

/** Riwayat yang BUKAN perubahan isi SOP: tinjau ulang, ganti pemilik, atur jadwal tinjau. */
const NON_CONTENT_REVISION = /^(Ditinjau|Pemilik SOP|Tinjau ulang|Jadwal tinjau)/i;

/**
 * Perubahan isi checklist PERTAMA yang terjadi setelah perbaikan dicatat. null = checklist-nya
 * belum disentuh — pemantauan efek belum boleh dimulai, karena tak ada yang dievaluasi.
 */
export function sopChangeAfter(
  fixCreatedAt: string,
  checklistId: string | null | undefined,
  revisions: readonly RevisionRow[]
): { on: string; summary: string } | null {
  if (!checklistId) return null;
  const t0 = Date.parse(fixCreatedAt);
  let best: RevisionRow | null = null;
  for (const r of revisions) {
    if (r.checklistId !== checklistId || NON_CONTENT_REVISION.test(r.summary.trim())) continue;
    const t = Date.parse(r.at);
    if (Number.isNaN(t) || (!Number.isNaN(t0) && t < t0)) continue;
    if (!best || t < Date.parse(best.at)) best = r;
  }
  if (!best) return null;
  return { on: jakartaDateString(new Date(best.at)), summary: best.summary };
}

export interface FixProgress {
  /** true = checklist belum diubah sejak perbaikan dicatat; pemantauan belum dimulai. */
  waiting: boolean;
  /** Hari terjadwal yang sudah lewat sejak perbaikan (maks FIX_MONITOR_DAYS ditampilkan). */
  days: number;
  done: boolean;
  /** % kepatuhan titik sejak perbaikan; null bila belum ada hari terjadwal yang lewat. */
  afterPct: number | null;
  delta: number | null;
  effective: boolean | null;
}

/**
 * Evaluasi perbaikan: bandingkan kepatuhan titik SEJAK checklist-nya benar-benar diubah
 * (`changedOn`, lihat `sopChangeAfter`) dengan angka dasarnya. Sebelum ada perubahan, tak ada
 * yang dipantau.
 */
export function fixProgress(
  fix: Pick<SopFixRow, "basePct">,
  point: PointReport | undefined,
  changedOn: string | null
): FixProgress {
  if (!changedOn) return { waiting: true, days: 0, done: false, afterPct: null, delta: null, effective: null };
  const cells = (point?.cells ?? []).filter((c) => c.ymd > changedOn && segOf(c.status) !== null);
  const days = cells.length;
  if (days === 0) return { waiting: false, days: 0, done: false, afterPct: null, delta: null, effective: null };
  const good = cells.filter((c) => c.status === "ok" || c.status === "late").length;
  const afterPct = Math.round((good / days) * 100);
  const delta = afterPct - fix.basePct;
  const done = days >= FIX_MONITOR_DAYS;
  return { waiting: false, days: Math.min(days, FIX_MONITOR_DAYS), done, afterPct, delta, effective: done ? delta >= 5 : null };
}
