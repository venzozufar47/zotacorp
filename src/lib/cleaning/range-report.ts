/**
 * Agregasi kebersihan untuk RENTANG tanggal (7 / 30 hari), bukan satu hari.
 *
 * `getCleaningMonitor` menjawab "hari ini bagaimana". Halaman admin yang baru
 * menanyakan hal lain: seberapa bersih tiap cabang selama sebulan, titik mana
 * yang sudah lama tak tersentuh, dan siapa yang rajin. Semua itu butuh status
 * per (titik × hari) di sepanjang rentang.
 *
 * ── Kenapa TypeScript, bukan satu RPC SQL ──────────────────────────────────
 *
 * Rencana awalnya satu RPC SQL supaya tidak ada loop per hari. Yang membuat
 * rencana itu mahal bukan loop-nya, melainkan ATURANNYA: siapa yang bertugas
 * pada suatu hari ditentukan `isWorkdayFor`, `isOnDutyToday`, dan
 * `resolveBranchDuty` — tiga modul TypeScript murni yang JUGA dipakai halaman
 * checklist karyawan. Menyalinnya ke PL/pgSQL berarti dua implementasi untuk
 * satu aturan, dan begitu keduanya menyimpang, skor kepatuhan yang dilihat
 * admin akan membantah daftar tugas yang dilihat karyawannya sendiri — kelas
 * bug yang paling sulit disadari karena kedua angka tampak wajar.
 *
 * Yang sebenarnya perlu dihindari adalah round-trip per hari, dan itu
 * diselesaikan di pemanggil: seluruh rentang diambil dengan jumlah query TETAP
 * (lihat `getCleaningRangeReport`), lalu diperluas di memori di sini. 30 hari ×
 * ~20 assignment adalah ratusan iterasi — tidak terukur, sementara satu-satunya
 * sumber kebenaran aturan duty tetap satu.
 *
 * Modul ini MURNI: tanpa DB, tanpa React. Semua I/O milik pemanggil.
 */

import { isWorkdayFor } from "@/lib/utils/workdays";
import { isOnDutyToday, type RotationMode } from "@/lib/utils/cleaning-rotation";
import { resolveBranchDuty } from "@/lib/utils/cleaning-branch-duty";

/**
 * Status satu titik pada satu hari.
 *
 * `redo` = admin menandai fotonya perlu diulang (migrasi 130). Ia berdiri
 * sendiri, bukan varian `miss`: pekerjaannya DILAKUKAN dan buktinya ada, hanya
 * tidak diterima — orangnya sudah datang, jadi memperlakukannya sama dengan
 * tidak dikerjakan akan salah menghukum.
 */
export type CleaningDayStatus = "ok" | "late" | "redo" | "miss" | "pending" | "off";

export interface RangeItemInput {
  id: string;
  title: string;
  requiresPhoto: boolean;
  /** Jumlah slot foto (cleaning_item_photos). 0 = cukup satu foto/centang. */
  photoSlots: number;
  sortOrder: number;
}

export interface RangeAssignmentInput {
  id: string;
  /** `person` = assignment ke satu orang. `branch` = duty slot milik cabang. */
  kind: "person" | "branch";
  userId: string | null;
  locationId: string | null;
  dutySlot: number | null;
  checklistId: string;
  checklistName: string;
  weekdays: number;
  skipHolidays: boolean;
  rotationGroupId: string | null;
  rotationAnchor: string | null;
  rotationMode: RotationMode;
  rotationOrder: number;
  rotationMemberCount: number;
  /** "HH:MM" batas akhir jendela waktu; null = tanpa batas (tak bisa telat). */
  windowEnd: string | null;
  items: RangeItemInput[];
}

export interface RangeCompletionInput {
  itemId: string;
  userId: string;
  date: string;
  /** ISO timestamp. Dipakai membandingkan dengan `windowEnd`. */
  completedAt: string;
  photoPath: string | null;
  photoReqId: string | null;
  /** Verdict admin (migrasi 130). 'redo' membuat harinya jadi "Perlu ulang". */
  reviewStatus: "unreviewed" | "ok" | "redo";
}

export interface RangePoolMemberInput {
  locationId: string;
  userId: string;
  sortOrder: number;
}

/** Kehadiran: satu baris = satu orang tercatat absen di satu cabang, satu hari. */
export interface RangePresenceInput {
  locationId: string;
  userId: string;
  date: string;
}

/** Hari kerja seseorang, tanpa peduli lokasi: `${userId}|${ymd}`. Dipakai untuk
 *  memisahkan "tidak dikerjakan" dari "orangnya memang tidak masuk". */
export type AttendanceDaySet = ReadonlySet<string>;

export interface RangeDay {
  ymd: string;
  /** 0=Min .. 6=Sab, zona Jakarta. */
  dow: number;
  holiday: string | null;
}

export interface PointCell {
  ymd: string;
  status: CleaningDayStatus;
  /** Pelaksana yang seharusnya (atau yang mengerjakan). null saat `off`. */
  userId: string | null;
  completedAt: string | null;
}

export interface PointReport {
  itemId: string;
  title: string;
  checklistId: string;
  checklistName: string;
  branchKey: string;
  photoSlots: number;
  cells: PointCell[];
  /** Status pada hari terakhir rentang. */
  current: CleaningDayStatus;
  /** Hari terjadwal berturut-turut yang terlewat, dihitung dari hari terbaru. */
  missStreak: number;
  lastGoodYmd: string | null;
  /** Jumlah hari terjadwal sejak terakhir bersih. null = tidak pernah bersih. */
  ageDays: number | null;
}

export interface BranchReport {
  key: string;
  name: string;
  unit: string | null;
  locationId: string | null;
  /** % (ok+late) dari hari terjadwal yang sudah lewat jadwalnya. */
  score: number;
  done: number;
  scheduled: number;
  pending: number;
  miss: number;
  late: number;
  /** Difoto tapi ditolak admin. TIDAK dihitung `done`: pekerjaannya belum
   *  diterima, walau orangnya sudah datang. */
  redo: number;
  /** Satu status per hari rentang — status TERBURUK di antara titiknya. */
  series: CleaningDayStatus[];
  needsAttention: number;
}

export interface EmployeeDay {
  ymd: string;
  status: CleaningDayStatus;
  checklistName: string | null;
  points: Array<{ itemId: string; title: string; status: CleaningDayStatus }>;
}

export interface EmployeeReport {
  userId: string;
  branchKey: string;
  days: EmployeeDay[];
  /** Hari yang benar-benar kebagian duty (bukan `off`/`pending`). */
  dutyDays: number;
  ok: number;
  late: number;
  redo: number;
  miss: number;
  pct: number;
  /** Hari duty `ok` berturut-turut paling baru. */
  streak: number;
}

export interface CleaningRangeReport {
  from: string;
  to: string;
  days: RangeDay[];
  branches: BranchReport[];
  points: PointReport[];
  employees: EmployeeReport[];
}

/** Urutan keparahan — dipakai memilih status "terburuk" & mengurutkan kartu. */
const SEVERITY: Record<CleaningDayStatus, number> = {
  miss: 0,
  redo: 1,
  late: 2,
  pending: 3,
  ok: 4,
  off: 5,
};

function worst(list: readonly CleaningDayStatus[]): CleaningDayStatus {
  let out: CleaningDayStatus = "off";
  for (const s of list) if (SEVERITY[s] < SEVERITY[out]) out = s;
  return out;
}

/** "HH:MM" → menit sejak tengah malam. null bila tak terbaca. */
function hhmmToMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * Menit-dalam-hari dari sebuah timestamp, dibaca di zona `tzOffsetMinutes`.
 * Offset dititipkan pemanggil (Jakarta = +420) supaya modul ini tetap murni dan
 * tidak bergantung pada zona waktu server.
 */
function minutesOfDay(iso: string, tzOffsetMinutes: number): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const shifted = new Date(t + tzOffsetMinutes * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export interface BuildRangeReportInput {
  /** Hari-hari rentang, urut lama→baru. */
  days: RangeDay[];
  /** Hari "sekarang" (Jakarta) — hanya hari ini yang boleh berstatus pending. */
  today: string;
  /**
   * Berapa hari TERAKHIR yang dihitung ke skor cabang. Strip di kartu selalu 14
   * hari, jadi rentang selalu diambil ≥14 hari — tanpa pemisahan ini, memilih
   * "Hari ini" tetap menghasilkan skor 14 hari sementara labelnya bilang hari
   * ini. Default: seluruh rentang.
   */
  scoreDays?: number;
  /** Menit-dalam-hari saat ini, untuk memutuskan pending vs miss hari ini. */
  nowMinutes: number;
  tzOffsetMinutes: number;
  assignments: RangeAssignmentInput[];
  completions: RangeCompletionInput[];
  pool: RangePoolMemberInput[];
  presence: RangePresenceInput[];
  /**
   * Hari kerja tiap orang (`${userId}|${ymd}`), lepas dari lokasi.
   *
   * Rotasi per-orang berbasis KALENDER: `isOnDutyToday` tidak tahu apa-apa soal
   * cuti. Tanpa data ini, hari saat orangnya tidak masuk tetap tercatat sebagai
   * kelalaiannya — halaman menuduh orang yang sedang tidak bekerja. Skor cabang
   * TETAP menghitungnya terlewat (ruangannya memang tidak dibersihkan); yang
   * tidak boleh adalah menagihnya ke seseorang.
   */
  attendance: AttendanceDaySet;
  /** locationId → nama cabang. */
  locationNames: ReadonlyMap<string, string>;
  /** userId → business_unit, untuk mengelompokkan assignment per-orang. */
  userUnits: ReadonlyMap<string, string | null>;
}

/** Kunci cabang: pakai lokasi bila ada, kalau tidak jatuh ke unit bisnis. */
function branchKeyOf(a: RangeAssignmentInput, userUnits: BuildRangeReportInput["userUnits"]): string {
  if (a.locationId) return `loc:${a.locationId}`;
  const unit = a.userId ? userUnits.get(a.userId) ?? null : null;
  return unit ? `unit:${unit}` : "unit:—";
}

export function buildCleaningRangeReport(
  input: BuildRangeReportInput
): CleaningRangeReport {
  const {
    days,
    today,
    nowMinutes,
    tzOffsetMinutes,
    assignments,
    completions,
    pool,
    presence,
    attendance,
    locationNames,
    userUnits,
  } = input;

  const holidaySet = new Set(days.filter((d) => d.holiday).map((d) => d.ymd));

  // Completion diindeks per (item|date) — TANPA user.
  //
  // Ini bukan detail teknis, ini definisi: pertanyaan halaman ini adalah
  // "apakah titik ini dikerjakan hari itu", dan jawabannya tidak boleh
  // bergantung pada SIAPA yang mengerjakan. Rotasi menentukan siapa yang
  // bertanggung jawab, bukan apakah ruangannya bersih.
  //
  // Versi pertama modul ini mengunci per (user|item|date) memakai pelaksana
  // hasil hitungan rotasi. Akibatnya fatal dan senyap: pada rotasi 2 orang,
  // hari yang dikerjakan rekannya tidak pernah cocok, seluruh completion
  // dibuang, dan Haengbocake tampil 0% padahal ada 2.024 completion dalam 30
  // hari. Angka nol itu terlihat masuk akal — itu yang membuatnya berbahaya.
  // Satu titik bisa punya beberapa baris (satu per slot foto). Kalau SATU saja
  // ditolak, titiknya perlu diulang — verdict tidak bisa dirata-rata.
  const redoKeys = new Set<string>();
  for (const c of completions)
    if (c.reviewStatus === "redo") redoKeys.add(`${c.itemId}|${c.date}`);
  const compByKey = new Map<string, RangeCompletionInput>();
  for (const c of completions) {
    const k = `${c.itemId}|${c.date}`;
    const prev = compByKey.get(k);
    // Satu item bisa punya banyak baris (satu per slot foto). Yang dipakai
    // sebagai penanda waktu adalah yang PALING AKHIR — telat/tidaknya sebuah
    // titik ditentukan saat pekerjaan itu benar-benar tuntas.
    if (!prev || c.completedAt > prev.completedAt) compByKey.set(k, c);
  }

  // Kehadiran per (lokasi, hari) → daftar userId ANGGOTA POOL cabang itu,
  // diurut pangkat pool.
  //
  // Disaring ke pool WAJIB, bukan opsional: attendance_logs mencatat SIAPA
  // PUN yang check-in di lokasi itu — kasir, admin, siapa saja yang lokasi
  // absennya kebetulan sama — bukan cuma anggota pool kebersihan. Sebelum
  // saringan ini ada, resolveBranchDuty memperlakukan mereka sebagai
  // kandidat duty yang sah dan bisa mengambil slot checklist dari anggota
  // pool yang sesungguhnya; checklist-nya lalu tidak pernah dikerjakan
  // karena orang itu tidak tahu dirinya "ditugaskan". Pola (pool ∩ present)
  // yang sama sudah dipakai getCleaningMonitor / buildBranchDutyMonitorRows
  // (monitor satu-hari) — di jalur rentang inilah pola itu sempat terlewat.
  const poolRank = new Map<string, number>();
  const poolMembersByLoc = new Map<string, Set<string>>();
  for (const p of pool) {
    poolRank.set(`${p.locationId}|${p.userId}`, p.sortOrder);
    const set = poolMembersByLoc.get(p.locationId) ?? new Set<string>();
    set.add(p.userId);
    poolMembersByLoc.set(p.locationId, set);
  }
  const presentByLocDay = new Map<string, string[]>();
  for (const p of presence) {
    if (!poolMembersByLoc.get(p.locationId)?.has(p.userId)) continue;
    const k = `${p.locationId}|${p.date}`;
    const list = presentByLocDay.get(k) ?? [];
    list.push(p.userId);
    presentByLocDay.set(k, list);
  }
  for (const [k, list] of presentByLocDay) {
    const locationId = k.split("|")[0];
    list.sort((a, b) => {
      const ra = poolRank.get(`${locationId}|${a}`) ?? Number.MAX_SAFE_INTEGER;
      const rb = poolRank.get(`${locationId}|${b}`) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.localeCompare(b);
    });
  }

  // Jumlah duty slot per cabang = banyaknya assignment cabang di lokasi itu.
  const slotCountByLoc = new Map<string, number>();
  for (const a of assignments) {
    if (a.kind !== "branch" || !a.locationId) continue;
    slotCountByLoc.set(a.locationId, (slotCountByLoc.get(a.locationId) ?? 0) + 1);
  }

  /** Pelaksana assignment pada satu hari, atau null bila tidak terjadwal. */
  function performerOn(a: RangeAssignmentInput, day: RangeDay): string | null {
    if (!isWorkdayFor(a.weekdays, day.dow)) return null;
    if (a.skipHolidays && day.holiday) return null;
    if (a.kind === "person") {
      if (!a.userId) return null;
      const onDuty = isOnDutyToday({
        dateYmd: day.ymd,
        anchorYmd: a.rotationAnchor ?? day.ymd,
        dow: day.dow,
        weekdays: a.weekdays,
        mode: a.rotationMode,
        memberOrder: a.rotationOrder,
        memberCount: a.rotationMemberCount,
        holidays: holidaySet,
        skipHolidays: a.skipHolidays,
      });
      return onDuty ? a.userId : null;
    }
    if (!a.locationId || a.dutySlot == null) return null;
    const present = presentByLocDay.get(`${a.locationId}|${day.ymd}`) ?? [];
    if (present.length === 0) return null;
    const slotMap = resolveBranchDuty({
      dateYmd: day.ymd,
      anchorYmd: a.rotationAnchor ?? day.ymd,
      dow: day.dow,
      weekdays: a.weekdays,
      slotCount: slotCountByLoc.get(a.locationId) ?? 1,
      presentUserIds: present,
      holidays: holidaySet,
      skipHolidays: a.skipHolidays,
    });
    for (const [userId, slot] of slotMap) {
      if (slot === a.dutySlot) return userId;
    }
    return null;
  }

  const windowEndMin = new Map<string, number | null>();
  for (const a of assignments) windowEndMin.set(a.id, hhmmToMinutes(a.windowEnd));

  // ── Perluasan utama: satu sel per (item × hari) ───────────────────────────
  //
  // Titik dikunci per (cabang, item), BUKAN per assignment. Rotasi 2 orang atas
  // satu checklist adalah DUA assignment yang berbagi item yang sama; kalau
  // titiknya dibuat per assignment, "Matikan AC" muncul dua kali di grid dan
  // rentetan miss-nya terpecah dua. Satu ruangan tetap satu ruangan berapa pun
  // banyak orang yang bergilir mengurusnya.
  const pointAcc = new Map<
    string,
    { base: Omit<PointReport, "cells" | "current" | "missStreak" | "lastGoodYmd" | "ageDays">; byDay: Map<string, PointCell> }
  >();
  const empDays = new Map<string, Map<string, EmployeeDay>>();

  for (const a of assignments) {
    const branchKey = branchKeyOf(a, userUnits);
    const limit = windowEndMin.get(a.id) ?? null;

    for (const item of a.items) {
      const pointKey = `${branchKey}|${item.id}`;
      const acc =
        pointAcc.get(pointKey) ??
        {
          base: {
            itemId: item.id,
            title: item.title,
            checklistId: a.checklistId,
            checklistName: a.checklistName,
            branchKey,
            photoSlots: item.photoSlots,
          },
          byDay: new Map<string, PointCell>(),
        };
      pointAcc.set(pointKey, acc);
      for (const day of days) {
        const expected = performerOn(a, day);
        const done = compByKey.get(`${item.id}|${day.ymd}`);
        // Tidak terjadwal DAN tidak dikerjakan → hari itu memang bukan urusan
        // siapa pun. Tidak terjadwal TAPI dikerjakan tetap dihitung bersih:
        // ruangannya nyata-nyata dibersihkan, dan membuangnya justru
        // meremehkan kebersihan yang benar-benar terjadi.
        if (!expected && !done) {
          // Hanya tulis `off` kalau assignment lain belum mengisi hari ini —
          // pada rotasi, hari ini bisa jadi milik assignment pasangannya.
          if (!acc.byDay.has(day.ymd))
            acc.byDay.set(day.ymd, {
              ymd: day.ymd,
              status: "off",
              userId: null,
              completedAt: null,
            });
          continue;
        }
        // Kredit jatuh ke yang BENAR-BENAR mengerjakan; kalau terlewat, ke yang
        // seharusnya bertugas — itulah orang yang perlu dibina.
        const performer = done?.userId ?? expected;
        let status: CleaningDayStatus;
        if (done) {
          // Verdict mengalahkan jam: foto yang ditolak tetap perlu diulang
          // walau dikirim tepat waktu.
          if (redoKeys.has(`${item.id}|${day.ymd}`)) status = "redo";
          else {
            const at = minutesOfDay(done.completedAt, tzOffsetMinutes);
            status = limit != null && at != null && at > limit ? "late" : "ok";
          }
        } else if (day.ymd > today) {
          status = "pending";
        } else if (day.ymd === today) {
          // Hari ini belum tentu terlewat: selama jendela waktunya belum tutup
          // ia masih "menunggu jadwal", bukan kelalaian. Tanpa jendela, hari
          // ini dianggap masih berjalan sampai tengah malam.
          status = limit != null && nowMinutes > limit ? "miss" : "pending";
        } else {
          status = "miss";
        }
        // Merge antar assignment yang berbagi titik (rotasi): hari yang sudah
        // tercatat dikerjakan tidak boleh ditimpa `off`/`miss` oleh assignment
        // pasangannya. Aturannya satu baris: status NYATA mengalahkan `off`,
        // dan di antara dua status nyata yang paling ringan yang menang —
        // ruangannya bersih walau bukan orang yang dijadwalkan yang mengerjakan.
        const prev = acc.byDay.get(day.ymd);
        const better =
          !prev || prev.status === "off"
            ? true
            : SEVERITY[status] > SEVERITY[prev.status];
        if (better)
          acc.byDay.set(day.ymd, {
            ymd: day.ymd,
            status,
            userId: performer,
            completedAt: done?.completedAt ?? null,
          });

        // Rekap per karyawan — hanya hari yang benar-benar ia pegang. Bisa
        // tanpa pemilik: duty cabang yang tidak ada anggota pool hadir hari itu
        // tetap terhitung sebagai titik terlewat, tapi tidak ada orang yang
        // pantas ditagih.
        if (!performer) continue;
        // Terlewat pada hari orangnya tidak masuk BUKAN kelalaiannya. Selnya
        // tetap `miss` untuk skor cabang di atas; yang dilewati hanya
        // penagihannya ke orang, sehingga harinya jadi `off` di heatmap-nya.
        if (status === "miss" && !attendance.has(`${performer}|${day.ymd}`))
          continue;
        const perUser = empDays.get(performer) ?? new Map<string, EmployeeDay>();
        const ed =
          perUser.get(day.ymd) ??
          ({
            ymd: day.ymd,
            status: "off",
            checklistName: a.checklistName,
            points: [],
          } satisfies EmployeeDay);
        ed.points.push({ itemId: item.id, title: item.title, status });
        ed.status = worst(ed.points.map((p) => p.status));
        perUser.set(day.ymd, ed);
        empDays.set(performer, perUser);
      }

    }
  }

  // Titik jadi bentuk akhir setelah SEMUA assignment tergabung — turunan
  // (rentetan miss, umur bukti terakhir) hanya benar di atas sel yang lengkap.
  const points: PointReport[] = [];
  for (const acc of pointAcc.values()) {
    const cells = days.map(
      (d) =>
        acc.byDay.get(d.ymd) ?? {
          ymd: d.ymd,
          status: "off" as CleaningDayStatus,
          userId: null,
          completedAt: null,
        }
    );
    // Riwayat terbaru → terlama, hanya hari yang terjadwal.
    const rev = [...cells].reverse().filter((c) => c.status !== "off");
    let missStreak = 0;
    for (const c of rev) {
      if (c.status === "miss") missStreak++;
      else if (c.status === "pending") continue;
      else break;
    }
    const lastGood = rev.find((c) => c.status === "ok" || c.status === "late");
    const scheduledYmds = rev.map((c) => c.ymd);
    const ageDays = lastGood ? scheduledYmds.indexOf(lastGood.ymd) : null;

    points.push({
      ...acc.base,
      cells,
      current: cells[cells.length - 1]?.status ?? "off",
      missStreak,
      lastGoodYmd: lastGood?.ymd ?? null,
      ageDays,
    });
  }

  // ── Ringkasan per cabang ─────────────────────────────────────────────────
  // Skor hanya menghitung `scoreDays` hari terakhir; STRIP tetap seluruh
  // rentang supaya kartunya punya konteks walau skornya cuma hari ini.
  const scoreFrom = Math.max(0, days.length - (input.scoreDays ?? days.length));
  const branchMap = new Map<string, BranchReport>();
  for (const p of points) {
    let b = branchMap.get(p.branchKey);
    if (!b) {
      const locationId = p.branchKey.startsWith("loc:")
        ? p.branchKey.slice(4)
        : null;
      b = {
        key: p.branchKey,
        name: locationId
          ? locationNames.get(locationId) ?? "Cabang"
          : p.branchKey.replace(/^unit:/, ""),
        unit: locationId ? null : p.branchKey.replace(/^unit:/, ""),
        locationId,
        score: 100,
        done: 0,
        scheduled: 0,
        pending: 0,
        miss: 0,
        late: 0,
        redo: 0,
        series: days.map(() => "off" as CleaningDayStatus),
        needsAttention: 0,
      };
      branchMap.set(p.branchKey, b);
    }
    p.cells.forEach((c, i) => {
      if (i < scoreFrom) return; // di luar rentang skor yang dipilih
      if (c.status === "off") return;
      b!.scheduled++;
      if (c.status === "ok") b!.done++;
      else if (c.status === "late") {
        b!.done++;
        b!.late++;
      } else if (c.status === "redo") b!.redo++;
      else if (c.status === "miss") b!.miss++;
      else if (c.status === "pending") b!.pending++;
      if (SEVERITY[c.status] < SEVERITY[b!.series[i]]) b!.series[i] = c.status;
    });
    if (p.missStreak > 0 || (p.ageDays != null && p.ageDays >= 4) || p.ageDays == null)
      b.needsAttention++;
  }
  for (const b of branchMap.values()) {
    // Penyebut mengecualikan `pending`: menghitung hari yang jendelanya belum
    // tutup sebagai kegagalan membuat skor pagi hari selalu terlihat buruk.
    const denom = b.scheduled - b.pending;
    b.score = denom > 0 ? Math.round((b.done / denom) * 100) : 100;
  }

  // ── Rekam jejak karyawan ─────────────────────────────────────────────────
  const employees: EmployeeReport[] = [];
  for (const [userId, perDay] of empDays) {
    const rows = days.map(
      (d) =>
        perDay.get(d.ymd) ??
        ({ ymd: d.ymd, status: "off", checklistName: null, points: [] } satisfies EmployeeDay)
    );
    const duty = rows.filter((r) => r.status !== "off" && r.status !== "pending");
    const ok = duty.filter((r) => r.status === "ok").length;
    const late = duty.filter((r) => r.status === "late").length;
    const redo = duty.filter((r) => r.status === "redo").length;
    const miss = duty.filter((r) => r.status === "miss").length;
    let streak = 0;
    for (const r of [...rows].reverse()) {
      if (r.status === "off" || r.status === "pending") continue;
      if (r.status === "ok") streak++;
      else break;
    }
    const unit = userUnits.get(userId) ?? null;
    const branchKey =
      points.find((p) => p.cells.some((c) => c.userId === userId))?.branchKey ??
      (unit ? `unit:${unit}` : "unit:—");
    employees.push({
      userId,
      branchKey,
      days: rows,
      dutyDays: duty.length,
      ok,
      late,
      redo,
      miss,
      pct: duty.length ? Math.round(((ok + late) / duty.length) * 100) : 100,
      streak,
    });
  }

  const branches = [...branchMap.values()].sort(
    (a, b) => a.score - b.score || a.name.localeCompare(b.name)
  );
  points.sort(
    (a, b) =>
      SEVERITY[a.current] - SEVERITY[b.current] ||
      (b.ageDays ?? 999) - (a.ageDays ?? 999) ||
      a.title.localeCompare(b.title)
  );
  employees.sort((a, b) => a.pct - b.pct || b.miss - a.miss);

  return {
    from: days[0]?.ymd ?? today,
    to: days[days.length - 1]?.ymd ?? today,
    days,
    branches,
    points,
    employees,
  };
}
