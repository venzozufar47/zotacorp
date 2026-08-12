"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  Eye,
  Images,
  Settings,
  X,
} from "lucide-react";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { ChecklistManager } from "./ChecklistManager";
import { AssignmentManager } from "./AssignmentManager";
import { BranchDutyManager } from "./BranchDutyManager";
import { PhotoReviewGallery } from "./PhotoReviewGallery";
import type { CleaningEmployee } from "./types";
import type {
  CleaningChecklist,
  CleaningAssignmentRow,
  BranchDutyRow,
  CleaningLocation,
} from "@/lib/actions/cleaning.actions";
import type { HolidayRow } from "@/lib/actions/holidays.actions";
import type { CleaningRangeReportWithNames } from "@/lib/actions/cleaning-range.actions";
import type {
  BranchReport,
  CleaningDayStatus,
  EmployeeReport,
  PointReport,
} from "@/lib/cleaning/range-report";

/**
 * Halaman Kebersihan — satu halaman, bukan 5 tab.
 *
 * Lima tab lama (Monitoring / Review Foto / Checklist / Duty Cabang /
 * Assignment) mencampur dua hal yang beda umur pakainya: memantau tiap hari,
 * dan menyusun SOP yang sekali diatur lalu jarang disentuh. Penyusunan turun ke
 * drawer "Pengaturan SOP"; halaman utama hanya menjawab dua pertanyaan —
 * seberapa bersih tiap cabang, dan siapa yang rajin menjalankannya.
 *
 * Yang BELUM ada di sini, dan sengaja: tombol verdict foto (Minta ulang / Oke)
 * dan "Kirim catatan pembinaan". Keduanya butuh kolom/tabel yang belum dibuat.
 * Menampilkannya sebagai tombol mati lebih buruk daripada tidak ada — ia
 * menjanjikan wewenang yang tidak dimiliki halaman ini.
 */

const RANGES = [
  { key: "hari", label: "Hari ini" },
  { key: "7", label: "7 hari" },
  { key: "30", label: "30 hari" },
] as const;

export type CleaningRangeKey = (typeof RANGES)[number]["key"];

/**
 * Dua tab, bukan lima.
 *
 * Desainnya satu halaman tanpa tab, dan itu benar untuk penyusunan SOP (yang
 * turun ke drawer). Tapi "kerajinan karyawan" menjawab pertanyaan yang berbeda
 * dari dua zona di atasnya — bukan "ruangan mana yang kotor" melainkan "siapa
 * yang perlu dibina" — dan sebagai zona ketiga ia selalu berada di bawah dua
 * blok besar, jadi praktis tak pernah terlihat. Tab-nya ber-URL supaya bisa
 * di-bookmark dan dibagikan.
 */
const VIEWS = [
  { key: "ringkasan", label: "Hasil kebersihan" },
  { key: "karyawan", label: "Kerajinan karyawan" },
] as const;

export type CleaningViewKey = (typeof VIEWS)[number]["key"];

const STATUS_LABEL: Record<CleaningDayStatus, string> = {
  ok: "Lengkap",
  late: "Telat",
  miss: "Belum dikerjakan",
  pending: "Menunggu jadwal",
  off: "Tidak terjadwal",
};

/** Satu skala warna untuk seluruh halaman: strip, sel heatmap, dan pill. */
const CELL_CLASS: Record<CleaningDayStatus, string> = {
  ok: "bg-emerald-500",
  late: "bg-amber-500",
  miss: "bg-destructive",
  pending: "bg-primary/25",
  off: "bg-muted",
};

const PILL_CLASS: Record<CleaningDayStatus, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  late: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  miss: "border-destructive/40 bg-destructive/10 text-destructive",
  pending: "border-border bg-muted text-muted-foreground",
  off: "border-border bg-muted text-muted-foreground",
};

const LEGEND: Array<[CleaningDayStatus, string]> = [
  ["ok", "lengkap"],
  ["late", "telat"],
  ["miss", "belum dikerjakan"],
  ["pending", "menunggu jadwal"],
  ["off", "tidak kebagian slot / libur"],
];

function StatusPill({ status }: { status: CleaningDayStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${PILL_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function Strip({
  cells,
  days,
  title,
}: {
  cells: CleaningDayStatus[];
  days: string[];
  title?: string;
}) {
  return (
    <div className="flex gap-[2px]" title={title}>
      {cells.map((s, i) => (
        <i
          key={days[i] ?? i}
          title={`${days[i]} — ${STATUS_LABEL[s]}`}
          className={`h-3 flex-1 min-w-[3px] rounded-[2px] ${CELL_CLASS[s]}`}
        />
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {LEGEND.map(([s, l]) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground"
        >
          <i className={`size-2.5 rounded-[2px] ${CELL_CLASS[s]}`} />
          {l}
        </span>
      ))}
    </div>
  );
}

const ageLabel = (n: number | null) =>
  n == null ? "belum pernah" : n === 0 ? "hari ini" : n === 1 ? "kemarin" : `${n} hari lalu`;

/** Titik yang butuh mata manajer. Diurut: belum dikerjakan → lama tak terpantau. */
function reviewQueue(points: PointReport[]) {
  const out = points
    .map((p) => {
      if (p.missStreak >= 1) return { p, kind: "miss" as const };
      if (p.ageDays == null || p.ageDays >= 4) return { p, kind: "stale" as const };
      return null;
    })
    .filter((x): x is { p: PointReport; kind: "miss" | "stale" } => x !== null);
  const w = { miss: 0, stale: 1 };
  return out.sort(
    (a, b) =>
      w[a.kind] - w[b.kind] ||
      b.p.missStreak - a.p.missStreak ||
      (b.p.ageDays ?? 999) - (a.p.ageDays ?? 999)
  );
}

export function CleaningOverview({
  report,
  range,
  view,
  checklists,
  assignments,
  branchDuties,
  locations,
  employees,
  holidays,
}: {
  report: CleaningRangeReportWithNames;
  range: CleaningRangeKey;
  view: CleaningViewKey;
  checklists: CleaningChecklist[];
  assignments: CleaningAssignmentRow[];
  branchDuties: BranchDutyRow[];
  locations: CleaningLocation[];
  employees: CleaningEmployee[];
  holidays: HolidayRow[];
}) {
  const [branchKey, setBranchKey] = useState<string | null>(
    // Default ke cabang terburuk: halaman ini untuk menemukan masalah, jadi
    // yang paling perlu dilihat yang terbuka lebih dulu.
    report.branches[0]?.key ?? null
  );
  const [setupOpen, setSetupOpen] = useState(false);
  const [gallery, setGallery] = useState<{ itemId?: string } | null>(null);
  const [person, setPerson] = useState<EmployeeReport | null>(null);
  const [allBranches, setAllBranches] = useState(false);

  const dayYmds = report.days.map((d) => d.ymd);
  /** Strip selalu 14 hari terakhir, terlepas dari rentang skor yang dipilih. */
  const stripFrom = Math.max(0, report.days.length - 14);
  const stripDays = dayYmds.slice(stripFrom);

  const queue = useMemo(() => reviewQueue(report.points), [report.points]);
  const branchOf = useMemo(
    () => new Map(report.branches.map((b) => [b.key, b])),
    [report.branches]
  );
  const activeBranch = branchKey ? branchOf.get(branchKey) ?? null : null;
  const branchPoints = report.points.filter((p) => p.branchKey === branchKey);
  const shownEmployees = report.employees.filter(
    (e) => allBranches || e.branchKey === branchKey
  );

  const scopeLabel =
    range === "hari" ? "hari ini" : range === "7" ? "7 hari terakhir" : "30 hari terakhir";

  return (
    <div className="space-y-6">
      {/* Scope bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
          Rentang
        </span>
        <div className="flex gap-1 rounded-full border border-border bg-muted/40 p-1">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/admin/cleaning?view=${view}&range=${r.key}`}
              className={
                "rounded-full px-3 py-1 text-xs font-semibold transition " +
                (range === r.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {r.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setGallery({})}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 h-9 text-sm font-semibold hover:bg-muted"
          >
            <Images size={14} /> Telusur foto
          </button>
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 h-9 text-sm font-semibold hover:bg-muted"
          >
            <Settings size={14} /> Pengaturan SOP
          </button>
        </div>
      </div>

      {/* Tab */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {VIEWS.map((v) => {
          const on = v.key === view;
          return (
            <Link
              key={v.key}
              href={`/admin/cleaning?view=${v.key}&range=${range}`}
              className={`press-feedback -mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold ${
                on
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.label}
              {v.key === "ringkasan" && queue.length > 0 && (
                <span className="ml-1.5 rounded-full bg-destructive/10 px-1.5 text-[11px] font-bold text-destructive">
                  {queue.length}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {view === "ringkasan" ? (
        <>
      {/* Zona 1 — Perlu ditinjau */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="font-display text-[15px] font-bold">Perlu ditinjau</h2>
          <span
            className={
              "rounded-full px-2 py-0.5 text-[11px] font-bold " +
              (queue.length
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground")
            }
          >
            {queue.length}
          </span>
          <span className="text-[11.5px] text-muted-foreground">
            Semua cabang · titik yang belum dikerjakan atau lama tak terpantau
          </span>
        </div>
        {queue.length === 0 ? (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Check size={16} />
            </span>
            <div>
              <b className="font-display text-[13.5px]">
                Tidak ada yang perlu ditinjau.
              </b>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                Semua titik terjadwal sudah dikerjakan. Lihat hasil per cabang &
                rekam jejak di bawah.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {queue.slice(0, 8).map(({ p, kind }) => (
              <li
                key={p.itemId}
                className="flex flex-wrap items-center gap-3 px-4 py-2.5"
              >
                <span
                  className={
                    "grid size-7 shrink-0 place-items-center rounded-full " +
                    (kind === "miss"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400")
                  }
                >
                  {kind === "miss" ? <AlertTriangle size={15} /> : <Clock size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">
                    {p.title}{" "}
                    <span className="font-normal text-muted-foreground">
                      — {branchOf.get(p.branchKey)?.name ?? "—"}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {kind === "miss"
                      ? `Belum dikerjakan ${p.missStreak} hari kerja · terakhir bersih ${ageLabel(p.ageDays)}`
                      : `Tidak ada bukti ${ageLabel(p.ageDays)} · ${p.checklistName}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setGallery({ itemId: p.itemId })}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11.5px] font-semibold hover:bg-muted"
                >
                  <Eye size={12} /> Lihat foto
                </button>
              </li>
            ))}
            {queue.length > 8 && (
              <li className="px-4 py-2 text-[11.5px] text-muted-foreground">
                +{queue.length - 8} lagi — selesaikan yang di atas dulu.
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Zona 2 — hasil per cabang */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="font-display text-[15px] font-bold">
            Hasil kebersihan per cabang
          </h2>
          <span className="text-[11.5px] text-muted-foreground">
            Skor {scopeLabel} · strip = 14 hari terakhir
          </span>
        </div>
        {report.branches.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            Belum ada checklist aktif yang ter-assign. Buka <b>Pengaturan SOP</b>{" "}
            untuk menyusunnya.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {report.branches.map((b) => (
              <BranchCard
                key={b.key}
                branch={b}
                stripDays={stripDays}
                stripFrom={stripFrom}
                active={b.key === branchKey}
                onPick={() => setBranchKey(b.key)}
              />
            ))}
          </div>
        )}

        {activeBranch && (
          <>
            <div className="flex flex-wrap items-baseline gap-2 pt-2">
              <h3 className="font-display text-sm font-bold">
                Kondisi terkini — {activeBranch.name}
              </h3>
              <span className="text-[11.5px] text-muted-foreground">
                Urut: paling perlu dilihat dulu
              </span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {branchPoints.map((p) => (
                <PointCard
                  key={p.itemId}
                  point={p}
                  stripDays={stripDays}
                  stripFrom={stripFrom}
                  names={report.names}
                  onOpen={() => setGallery({ itemId: p.itemId })}
                />
              ))}
            </div>
          </>
        )}
      </section>
        </>
      ) : (
      /* Tab kerajinan karyawan */
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-[15px] font-bold">Kerajinan karyawan</h2>
          <span className="text-[11.5px] text-muted-foreground">
            Kepatuhan {scopeLabel}
          </span>
          {/* Pemilih cabang sendiri: di tab ini kartu cabang tidak terlihat,
              jadi menumpang pilihan dari tab sebelah akan terasa seperti filter
              yang berubah sendiri tanpa sebab yang kelihatan. */}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAllBranches(true)}
              className={
                "rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold " +
                (allBranches
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted")
              }
            >
              Semua cabang
            </button>
            {report.branches.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => {
                  setAllBranches(false);
                  setBranchKey(b.key);
                }}
                className={
                  "rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold " +
                  (!allBranches && branchKey === b.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted")
                }
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11.5px] text-muted-foreground">
          Satu kotak = satu hari. Hari kosong bukan berarti bolos: duty dibagi
          dari pool cabang dengan rotasi harian, jadi ada hari ia memang tidak
          kebagian slot.
        </p>
        <Legend />
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Karyawan</th>
                <th className="px-3 py-2 text-left font-semibold">14 hari</th>
                <th className="px-3 py-2 text-right font-semibold">Kepatuhan</th>
                <th className="px-3 py-2 text-right font-semibold">Telat</th>
                <th className="px-3 py-2 text-right font-semibold">Terlewat</th>
                <th className="px-3 py-2 text-right font-semibold">Beres berturut</th>
              </tr>
            </thead>
            <tbody>
              {shownEmployees.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    Belum ada karyawan yang kebagian duty di rentang ini.
                  </td>
                </tr>
              ) : (
                shownEmployees.map((e) => (
                  <tr
                    key={e.userId}
                    onClick={() => setPerson(e)}
                    className="cursor-pointer border-t border-border hover:bg-muted/40"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <EmployeeAvatar
                          size="sm"
                          id={e.userId}
                          full_name={report.names[e.userId] ?? "—"}
                          avatar_url={null}
                          avatar_seed={null}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-[12.5px] font-semibold">
                            {report.names[e.userId] ?? "—"}
                          </div>
                          <div className="text-[10.5px] text-muted-foreground">
                            {e.dutyDays} hari kebagian duty
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 min-w-[160px]">
                      <Strip
                        cells={e.days.slice(stripFrom).map((d) => d.status)}
                        days={stripDays}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <b
                        className={
                          "font-display tabular-nums " +
                          (e.pct >= 95
                            ? ""
                            : e.pct >= 80
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-destructive")
                        }
                      >
                        {e.pct}%
                      </b>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {e.late || "—"}
                    </td>
                    <td
                      className={
                        "px-3 py-2 text-right tabular-nums " +
                        (e.miss ? "font-semibold text-destructive" : "text-muted-foreground")
                      }
                    >
                      {e.miss || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {e.streak} hari
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* Drawer: Pengaturan SOP — 3 manager lama dipakai apa adanya */}
      {setupOpen && (
        <Drawer title="Pengaturan SOP" onClose={() => setSetupOpen(false)}>
          <p className="mb-4 text-[11.5px] leading-relaxed text-muted-foreground">
            Sekali disusun, jarang dibuka lagi — itu sebabnya ia tidak lagi jadi
            tab sejajar dengan pemantauan harian. Checklist menentukan titik &
            slot fotonya, duty cabang menentukan siapa saja yang masuk pool, dan
            assignment untuk penugasan per orang.
          </p>
          <div className="space-y-8">
            <SetupSection title="Checklist & titik">
              <ChecklistManager initial={checklists} />
            </SetupSection>
            <SetupSection title="Duty cabang">
              <BranchDutyManager
                initial={branchDuties}
                checklists={checklists}
                locations={locations}
                employees={employees}
                holidays={holidays}
              />
            </SetupSection>
            <SetupSection title="Assignment per orang">
              <AssignmentManager
                initial={assignments}
                checklists={checklists}
                employees={employees}
                holidays={holidays}
              />
            </SetupSection>
          </div>
        </Drawer>
      )}

      {/* Drawer: telusur foto — kini bisa disaring ke satu titik */}
      {gallery && (
        <Drawer title="Telusur foto" onClose={() => setGallery(null)}>
          <PhotoReviewGallery
            checklists={checklists}
            employees={employees}
            initialItemId={gallery.itemId}
            items={report.points.map((p) => ({
              id: p.itemId,
              title: p.title,
              checklistId: p.checklistId,
            }))}
          />
        </Drawer>
      )}

      {/* Drawer: rekam jejak satu orang */}
      {person && (
        <Drawer
          title={report.names[person.userId] ?? "Karyawan"}
          onClose={() => setPerson(null)}
        >
          <PersonBody
            emp={person}
            name={report.names[person.userId] ?? "—"}
            days={dayYmds}
            onOpenPoint={(itemId) => {
              setPerson(null);
              setGallery({ itemId });
            }}
          />
        </Drawer>
      )}
    </div>
  );
}

function BranchCard({
  branch,
  stripDays,
  stripFrom,
  active,
  onPick,
}: {
  branch: BranchReport;
  stripDays: string[];
  stripFrom: number;
  active: boolean;
  onPick: () => void;
}) {
  const denom = branch.scheduled - branch.pending;
  return (
    <button
      type="button"
      onClick={onPick}
      className={
        "rounded-2xl border bg-card p-3 text-left transition " +
        (active ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-display text-[13.5px] font-bold">
            {branch.name}
          </div>
          <div className="truncate text-[10.5px] text-muted-foreground">
            {branch.unit ?? "Cabang"}
          </div>
        </div>
        <div className="text-right">
          <div
            className={
              "font-display text-lg font-bold tabular-nums " +
              (branch.score >= 95
                ? ""
                : branch.score >= 85
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-destructive")
            }
          >
            {branch.score}%
          </div>
          <div className="text-[10.5px] text-muted-foreground tabular-nums">
            {branch.done}/{denom} titik
          </div>
        </div>
      </div>
      <div
        className={
          "mt-1.5 text-[11px] " +
          (branch.needsAttention
            ? "font-semibold text-destructive"
            : "text-muted-foreground")
        }
      >
        {branch.needsAttention
          ? `${branch.needsAttention} titik perlu perhatian`
          : "Semua titik terpantau"}
      </div>
      <div className="mt-2">
        <Strip
          cells={branch.series.slice(stripFrom)}
          days={stripDays}
          title="14 hari terakhir"
        />
      </div>
    </button>
  );
}

function PointCard({
  point,
  stripDays,
  stripFrom,
  names,
  onOpen,
}: {
  point: PointReport;
  stripDays: string[];
  stripFrom: number;
  names: Record<string, string>;
  onOpen: () => void;
}) {
  const last = point.cells[point.cells.length - 1];
  const who = last?.userId ? names[last.userId] ?? null : null;
  const bad = point.current === "miss";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        "rounded-2xl border bg-card p-3 text-left transition hover:border-primary/40 " +
        (bad ? "border-destructive/40" : "border-border")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <b className="min-w-0 truncate text-[12.5px]">{point.title}</b>
        <StatusPill status={point.current} />
      </div>
      <div className="mt-1 text-[10.5px] text-muted-foreground">
        {point.current === "ok" || point.current === "late"
          ? `dikerjakan ${who ?? "—"}`
          : point.current === "pending"
            ? `menunggu jadwal · terakhir ${ageLabel(point.ageDays)}`
            : point.current === "miss"
              ? `belum dikerjakan ${point.missStreak} hari · terakhir ${ageLabel(point.ageDays)}`
              : `tidak terjadwal · terakhir ${ageLabel(point.ageDays)}`}
      </div>
      <div className="mt-0.5 text-[10.5px] text-muted-foreground">
        {point.photoSlots > 0 ? `${point.photoSlots} slot foto` : "tanpa foto"} ·{" "}
        {point.checklistName}
      </div>
      <div className="mt-2">
        <Strip cells={point.cells.slice(stripFrom).map((c) => c.status)} days={stripDays} />
      </div>
    </button>
  );
}

function PersonBody({
  emp,
  name,
  days,
  onOpenPoint,
}: {
  emp: EmployeeReport;
  name: string;
  days: string[];
  onOpenPoint: (itemId: string) => void;
}) {
  const dutyDays = emp.days.filter((d) => d.status !== "off").slice(-10).reverse();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <Kpi
          label={`Kepatuhan ${emp.days.length} hari`}
          value={`${emp.pct}%`}
          hint={`${emp.ok + emp.late} dari ${emp.dutyDays} hari duty`}
          tone={emp.pct >= 95 ? undefined : emp.pct >= 80 ? "warn" : "bad"}
        />
        <Kpi label="Telat" value={String(emp.late)} hint="di luar jendela waktu" />
        <Kpi
          label="Terlewat"
          value={String(emp.miss)}
          hint="hari duty tanpa bukti"
          tone={emp.miss ? "bad" : undefined}
        />
      </div>

      <div>
        <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
          Seluruh rentang
        </div>
        <Strip cells={emp.days.map((d) => d.status)} days={days} />
        <div className="mt-2">
          <Legend />
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
          Hari duty terakhir
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {dutyDays.length === 0 && (
            <li className="px-3 py-3 text-[12px] text-muted-foreground">
              {name} belum kebagian duty di rentang ini.
            </li>
          )}
          {dutyDays.map((d) => (
            <li key={d.ymd} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <b className="text-[12px]">{d.ymd}</b>
                  <span className="ml-1.5 text-[10.5px] text-muted-foreground">
                    {d.checklistName ?? "—"}
                  </span>
                </div>
                <StatusPill status={d.status} />
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {d.points.map((p) => (
                  <button
                    key={p.itemId}
                    type="button"
                    onClick={() => onOpenPoint(p.itemId)}
                    title={`${p.title} — ${STATUS_LABEL[p.status]}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted"
                  >
                    <i className={`size-2 rounded-[2px] ${CELL_CLASS[p.status]}`} />
                    <span className="max-w-[120px] truncate">{p.title}</span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "warn" | "bad";
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-2.5 py-2">
      <div className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "mt-0.5 font-display text-base font-bold tabular-nums " +
          (tone === "bad"
            ? "text-destructive"
            : tone === "warn"
              ? "text-amber-600 dark:text-amber-400"
              : "")
        }
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function SetupSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 font-display text-[13px] font-bold">
        <ChevronRight size={13} className="text-muted-foreground" />
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Slide-over kanan. <details> tidak cukup di sini: isinya form dengan state. */
function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-4xl flex-col border-l border-border bg-card shadow-xl animate-in fade-in-0 slide-in-from-right-8 duration-200">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 className="font-display text-base font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Tutup"
          >
            <X size={17} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}
