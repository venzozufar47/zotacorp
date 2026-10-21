"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  Images,
  Loader2,
  MessageSquarePlus,
  Settings,
  X,
} from "lucide-react";
import { createCoachingNote } from "@/lib/actions/cleaning-review.actions";
import { MONTH_NAMES } from "@/lib/utils/date-formats";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { ChecklistManager } from "./ChecklistManager";
import { AssignmentManager } from "./AssignmentManager";
import { BranchDutyManager } from "./BranchDutyManager";
import { PhotoReviewGallery, type GalleryFilter } from "./PhotoReviewGallery";
import { SopGovernanceZone } from "./SopGovernanceZone";
import { SopProvider } from "./sop/SopProvider";
import { SopDocsAdminClient } from "@/components/admin/sop-docs/SopDocsAdminClient";
import type { SopDocumentAdminView } from "@/lib/actions/sop-documents.actions";
import { STATUS_TEXT } from "./sop/shared";
import { SopKepatuhan } from "./sop/SopKepatuhan";
import { SopSidak } from "./sop/SopSidak";
import type { FindingIssueInput, RevisionRow, SopFixRow } from "@/lib/cleaning/sop-findings";
import { SopGuideBody, SopGuideReminder } from "./SopGuide";
import type { ItemIssueRow } from "@/lib/actions/cleaning-governance.actions";
import type { CleaningEmployee } from "./types";
import type {
  CleaningChecklist,
  CleaningAssignmentRow,
  BranchDutyRow,
  CleaningLocation,
} from "@/lib/actions/cleaning.actions";
import type { HolidayRow } from "@/lib/actions/holidays.actions";
import type { CleaningRangeReportWithNames } from "@/lib/actions/cleaning-range.actions";
import type { CleaningDayStatus, EmployeeReport } from "@/lib/cleaning/range-report";

/**
 * Halaman Kebersihan — satu halaman, bukan 5 tab.
 *
 * Lima tab lama (Monitoring / Review Foto / Checklist / Duty Cabang /
 * Assignment) mencampur dua hal yang beda umur pakainya: memantau tiap hari,
 * dan menyusun SOP yang sekali diatur lalu jarang disentuh. Penyusunan turun ke
 * drawer "Pengaturan SOP"; halaman ini punya tiga tampilan (lihat VIEWS):
 * Kepatuhan SOP & Sidak foto (komponen di ./sop/) dan Kerajinan karyawan.
 */

/**
 * Tiga tampilan ber-URL (`?view=`) supaya bisa di-bookmark dan dibagikan. "Kerajinan karyawan"
 * menjawab pertanyaan berbeda ("siapa yang perlu dibina") dari dua halaman SOP lainnya.
 */
const VIEWS = [
  { key: "ringkasan", label: "Kepatuhan SOP" },
  { key: "sidak", label: "Sidak foto" },
  { key: "karyawan", label: "Kerajinan karyawan" },
  { key: "pengakuan", label: "Pengakuan SOP" },
] as const;

export type CleaningViewKey = (typeof VIEWS)[number]["key"];

/** Satu skala warna untuk seluruh halaman: strip, sel heatmap, dan pill. */
const CELL_CLASS: Record<CleaningDayStatus, string> = {
  ok: "bg-emerald-500",
  late: "bg-amber-500",
  // Oranye, bukan merah: pekerjaannya dilakukan dan buktinya ada, hanya belum
  // diterima — beda derajat dengan tidak dikerjakan sama sekali.
  redo: "bg-orange-500",
  miss: "bg-destructive",
  // Slate, BUKAN merah: ruangannya tetap tidak dibersihkan (skor cabang tetap
  // turun), tapi shift yang bertugas hari itu memang tidak masuk — bukan
  // kelalaian siapa pun yang hadir, jadi tidak boleh terbaca sama dengan
  // `miss` yang murni diabaikan.
  miss_absent: "bg-slate-400",
  pending: "bg-primary/25",
  off: "bg-muted",
};

const PILL_CLASS: Record<CleaningDayStatus, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  late: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  redo: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  miss: "border-destructive/40 bg-destructive/10 text-destructive",
  miss_absent:
    "border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-400",
  pending: "border-border bg-muted text-muted-foreground",
  off: "border-border bg-muted text-muted-foreground",
};

const LEGEND: Array<[CleaningDayStatus, string]> = [
  ["ok", "lengkap"],
  ["late", "telat"],
  ["miss", "belum dikerjakan"],
  ["miss_absent", "shift tidak masuk"],
  ["pending", "menunggu jadwal"],
  ["off", "tidak kebagian slot / libur"],
];

function StatusPill({ status }: { status: CleaningDayStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${PILL_CLASS[status]}`}
    >
      {STATUS_TEXT[status]}
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
    <div title={title}>
      <div className="flex gap-[2px]">
        {cells.map((s, i) => (
          <i
            key={days[i] ?? i}
            title={`${days[i]} — ${STATUS_TEXT[s]}`}
            className={`h-3 flex-1 min-w-[3px] rounded-[2px] ${CELL_CLASS[s]}`}
          />
        ))}
      </div>
      {/* Label tanggal ujung-ujung strip — tanpa ini orang harus hover tiap
          sel satu-satu untuk tahu strip-nya mencakup tanggal berapa saja. */}
      {days.length > 1 && (
        <div className="mt-0.5 flex justify-between text-[9px] leading-none text-muted-foreground/70">
          <span>{shortDay(days[0])}</span>
          <span>{shortDay(days[days.length - 1])}</span>
        </div>
      )}
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

/** "2026-09-28" → "28 Sep" — tanpa tahun, cukup untuk label ujung strip. */
function shortDay(ymd: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  return `${m[2]} ${MONTH_NAMES[Number(m[1]) - 1] ?? m[1]}`;
}

/** Titik yang butuh mata manajer. Diurut: belum dikerjakan → lama tak terpantau. */
/**
 * Kirim catatan pembinaan ke satu karyawan.
 *
 * Rentang yang sedang dilihat ikut disimpan, supaya catatannya bisa dibaca
 * ulang bersama angka yang memicunya alih-alih menggantung tanpa konteks.
 * Karyawan membacanya di dashboard-nya sendiri — tidak ada notifikasi WA.
 */
function CoachingDialog({
  userId,
  name,
  periodFrom,
  periodTo,
  onClose,
}: {
  userId: string;
  name: string;
  periodFrom: string;
  periodTo: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  function submit() {
    if (!body.trim()) {
      toast.error("Catatan tidak boleh kosong");
      return;
    }
    startTransition(async () => {
      const res = await createCoachingNote({
        userId,
        body: body.trim(),
        context: "cleaning",
        periodFrom,
        periodTo,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Gagal mengirim");
        return;
      }
      toast.success(`Catatan terkirim ke ${name.split(" ")[0]}`);
      onClose();
      router.refresh();
    });
  }

  // Portal ke <body>: nenek moyangnya (animasi halaman) membuat fixed relatif ke dirinya,
  // sehingga dialog terpotong/miring di dalam konten alih-alih menutup layar.
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid w-screen h-screen place-items-center bg-foreground/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="font-display text-base font-bold">
            Catatan pembinaan — {name}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Tampil di dashboard {name.split(" ")[0]} saat ia masuk. Tidak
            dikirim sebagai notifikasi.
          </p>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="Apa yang perlu diperbaiki, dan apa yang diharapkan minggu depan?"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-9 rounded-lg border border-border px-3 text-sm font-semibold"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !body.trim()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Kirim catatan
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


export function CleaningOverview({
  report,
  view,
  checklists,
  assignments,
  branchDuties,
  locations,
  employees,
  holidays,
  issues,
  acks,
  fixes,
  revisions,
  sidakTab,
  sopDocuments,
  initialGalleryOpen,
  initialSetupOpen,
}: {
  report: CleaningRangeReportWithNames;
  view: CleaningViewKey;
  checklists: CleaningChecklist[];
  assignments: CleaningAssignmentRow[];
  branchDuties: BranchDutyRow[];
  locations: CleaningLocation[];
  employees: CleaningEmployee[];
  holidays: HolidayRow[];
  /** Kendala SOP terbuka dari karyawan. */
  issues: ItemIssueRow[];
  /** Temuan yang sudah dicek (`${itemId}|${ackKey}`). */
  acks: string[];
  /** Perbaikan SOP yang dipantau. */
  fixes: SopFixRow[];
  /** Riwayat perubahan checklist — untuk mendeteksi apakah perbaikan benar-benar dilakukan. */
  revisions: RevisionRow[];
  /** Tab awal Sidak foto: "acak" = Acak 10; kosong = cabang pertama. */
  sidakTab?: "acak";
  /** Dokumen SOP tertulis untuk tab "Pengakuan SOP" (hanya dimuat saat tab itu dibuka). */
  sopDocuments?: SopDocumentAdminView[];
  /** Buka drawer "Pengaturan SOP" saat halaman dimuat (`?setup=1`, dari pengingat tinjau ulang). */
  initialSetupOpen?: boolean;
  /** Buka drawer "Telusur foto" langsung saat halaman dimuat — dipakai
   *  quick-access "Review foto kebersihan" di Beranda admin (`?gallery=1`). */
  initialGalleryOpen?: boolean;
}) {
  const [branchKey, setBranchKey] = useState<string | null>(
    // Default ke cabang terburuk: halaman ini untuk menemukan masalah, jadi
    // yang paling perlu dilihat yang terbuka lebih dulu.
    report.branches[0]?.key ?? null
  );
  const [setupOpen, setSetupOpen] = useState(!!initialSetupOpen);
  const [setupTab, setSetupTab] = useState<"checklist" | "duty" | "assignment">("checklist");
  // Saat datang dari "Ubah jadwal" di tab Checklist, tab Penugasan disaring ke checklist itu.
  const [assignFocus, setAssignFocus] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [gallery, setGallery] = useState<GalleryFilter | null>(
    initialGalleryOpen ? {} : null
  );
  const [coaching, setCoaching] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [person, setPerson] = useState<EmployeeReport | null>(null);
  const [allBranches, setAllBranches] = useState(false);

  const dayYmds = report.days.map((d) => d.ymd);
  /** Strip selalu 14 hari terakhir, terlepas dari rentang skor yang dipilih. */
  const stripFrom = Math.max(0, report.days.length - 14);
  const stripDays = dayYmds.slice(stripFrom);

  const issueInputs = useMemo<FindingIssueInput[]>(
    () =>
      issues
        .filter((i): i is ItemIssueRow & { item_id: string } => !!i.item_id)
        .map((i) => ({ id: i.id, itemId: i.item_id, date: i.date, reason: i.reason })),
    [issues]
  );
  const shownEmployees = report.employees.filter(
    (e) => allBranches || e.branchKey === branchKey
  );

  // Skor & kepatuhan SELALU 14 hari terakhir — sama dengan lebar strip, jadi
  // tidak ada lagi rentang terpilih yang bisa membuat angkanya tidak sinkron
  // dengan visualnya.
  const scopeLabel = "14 hari terakhir";

  return (
    <div className="space-y-6">
      {/* Scope bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 h-9 text-sm font-semibold hover:bg-muted"
          >
            <BookOpen size={14} /> Panduan SOP
          </button>
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

      {/* Halaman: seg control seperti di desain (Kepatuhan SOP · Sidak foto · Kerajinan karyawan) */}
      <div className="flex">
        <div className="inline-flex max-w-full gap-[2px] overflow-x-auto rounded-[10px] bg-muted p-[3px]">
          {VIEWS.map((v) => {
            const on = v.key === view;
            return (
              <Link
                key={v.key}
                href={`/admin/cleaning?view=${v.key}`}
                scroll={false}
                className={`press-feedback whitespace-nowrap rounded-[8px] px-3 py-1.5 font-display text-[12px] !font-semibold ${
                  on ? "bg-card text-primary shadow-[0_1px_3px_rgba(0,40,46,0.14)]" : "text-muted-foreground"
                }`}
              >
                {v.label}
              </Link>
            );
          })}
        </div>
      </div>

      {view === "pengakuan" ? (
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            SOP tertulis yang wajib dibaca & diakui setiap karyawan. Mengedit isi menaikkan versi dan
            meminta pengakuan ulang dari semua orang.
          </p>
          <SopDocsAdminClient documents={sopDocuments ?? []} />
        </section>
      ) : view !== "karyawan" ? (
        <SopProvider
          report={report}
          issues={issueInputs}
          acks={acks}
          fixes={fixes}
          revisions={revisions}
          onOpenSetup={() => setSetupOpen(true)}
        >
          <SopPages view={view} sidakTab={sidakTab} checklists={checklists} onOpenSetup={() => setSetupOpen(true)} />
        </SopProvider>
      ) : (
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
                <th className="px-3 py-2 text-right font-semibold sr-only">Aksi</th>
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
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setCoaching({
                            userId: e.userId,
                            name: report.names[e.userId] ?? "—",
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <MessageSquarePlus size={12} /> Bina
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {coaching && (
        <CoachingDialog
          userId={coaching.userId}
          name={coaching.name}
          periodFrom={report.from}
          periodTo={report.to}
          onClose={() => setCoaching(null)}
        />
      )}

      {/* Drawer: Pengaturan SOP — 3 manager lama dipakai apa adanya */}
      {setupOpen && (
        <Drawer title="Pengaturan SOP" onClose={() => setSetupOpen(false)}>
          <SopGuideReminder onOpenGuide={() => setGuideOpen(true)} />
          {(() => {
            const tabs = [
              { key: "checklist", label: "Checklist", count: checklists.length, hint: "Isi SOP: titik yang harus dikerjakan beserta foto yang diminta. Dikelompokkan per cabang." },
              { key: "duty", label: "Duty cabang", count: branchDuties.length, hint: "Giliran bertugas per cabang: siapa saja yang masuk pool dan bagaimana rotasinya." },
              { key: "assignment", label: "Penugasan", count: assignments.length, hint: "Menugaskan checklist ke orang tertentu: hari, jam batas, dan wajib selesai sebelum pulang." },
            ] as const;
            const cur = tabs.find((t) => t.key === setupTab) ?? tabs[0];
            return (
              <>
                <div role="tablist" aria-label="Bagian Pengaturan SOP" className="mb-2 inline-flex rounded-xl border border-border bg-muted/40 p-1">
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={setupTab === t.key}
                      onClick={() => {
                        setAssignFocus(null);
                        setSetupTab(t.key);
                      }}
                      className={
                        "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition " +
                        (setupTab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      {t.label} <span className="font-normal text-muted-foreground">{t.count}</span>
                    </button>
                  ))}
                </div>
                <p className="mb-4 text-[12px] text-muted-foreground">{cur.hint}</p>
                {setupTab === "checklist" && (
                  <ChecklistManager
                    initial={checklists}
                    employees={employees}
                    assignments={assignments}
                    branchDuties={branchDuties}
                    onEditDuty={() => {
                      setAssignFocus(null);
                      setSetupTab("duty");
                    }}
                    onEditSchedule={(id) => {
                      setAssignFocus(id);
                      setSetupTab("assignment");
                    }}
                  />
                )}
                {setupTab === "duty" && (
                  <BranchDutyManager
                    initial={branchDuties}
                    checklists={checklists}
                    locations={locations}
                    employees={employees}
                    holidays={holidays}
                  />
                )}
                {setupTab === "assignment" && (
                  <AssignmentManager
                    key={assignFocus ?? "all"}
                    initial={assignments}
                    checklists={checklists}
                    employees={employees}
                    holidays={holidays}
                    focusChecklistId={assignFocus}
                    onClearFocus={() => setAssignFocus(null)}
                  />
                )}
              </>
            );
          })()}
        </Drawer>
      )}

      {/* Drawer: panduan menyusun SOP — dirender setelah drawer Pengaturan SOP supaya
          terbuka DI ATASNYA bila dibuka dari pengingat di dalamnya. */}
      {guideOpen && (
        <Drawer title="Panduan menyusun SOP: seberapa detail?" onClose={() => setGuideOpen(false)}>
          <SopGuideBody />
        </Drawer>
      )}

      {/* Drawer: telusur foto — kini bisa disaring ke satu titik */}
      {gallery && (
        <Drawer title="Telusur foto" onClose={() => setGallery(null)}>
          <PhotoReviewGallery
            checklists={checklists}
            employees={employees}
            // key: dibuka ulang dengan saringan lain (tanpa menutup drawer) harus
            // memuat ulang — state awal galeri hanya dibaca saat mount.
            key={`${gallery.itemId ?? ""}|${gallery.userId ?? ""}|${gallery.checklistId ?? ""}|${gallery.date ?? ""}`}
            initialItemId={gallery.itemId}
            initialUserId={gallery.userId}
            initialChecklistId={gallery.checklistId}
            initialDate={gallery.date}
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
            scoreDays={report.scoreDays}
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



/** Isi halaman Kepatuhan SOP / Sidak foto — dirender di dalam SopProvider. */
function SopPages({
  view,
  sidakTab,
  checklists,
  onOpenSetup,
}: {
  view: CleaningViewKey;
  sidakTab?: "acak";
  checklists: CleaningChecklist[];
  onOpenSetup: () => void;
}) {
  const router = useRouter();
  const go = (v: CleaningViewKey) => router.push(`/admin/cleaning?view=${v}`, { scroll: false });
  if (view === "sidak") return <SopSidak initialTab={sidakTab} onBack={() => go("ringkasan")} />;
  return (
    <SopKepatuhan
      onOpenSidak={() => go("sidak")}
      footer={<SopGovernanceZone checklists={checklists} onOpenSetup={onOpenSetup} />}
    />
  );
}

function PersonBody({
  emp,
  name,
  days,
  scoreDays,
  onOpenPoint,
}: {
  emp: EmployeeReport;
  name: string;
  days: string[];
  /** Jendela yang dihitung ke kepatuhan (laporan bisa lebih panjang). */
  scoreDays: number;
  onOpenPoint: (itemId: string) => void;
}) {
  const dutyDays = emp.days
    .filter((d) => d.status !== "off" || (d.trialMissed?.length ?? 0) > 0)
    .slice(-10)
    .reverse();
  const hasTrialMissed = dutyDays.some((d) => (d.trialMissed?.length ?? 0) > 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <Kpi
          label={`Kepatuhan ${scoreDays} hari`}
          value={`${emp.pct}%`}
          hint={`${emp.ok + emp.late} dari ${emp.dutyDays} hari duty`}
          tone={emp.pct >= 95 ? undefined : emp.pct >= 80 ? "warn" : "bad"}
        />
        <Kpi label="Telat" value={String(emp.late)} hint="lewat batas waktu" />
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
                {d.trialMissed?.length ? (
                  <span className="inline-flex shrink-0 items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap text-amber-700 dark:text-amber-400">
                    Belum lengkap · {d.trialMissed.length} item
                  </span>
                ) : (
                  <StatusPill status={d.status} />
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {d.trialMissed?.map((p) => (
                  <button
                    key={`miss-${p.itemId}`}
                    type="button"
                    onClick={() => onOpenPoint(p.itemId)}
                    title={`${p.title} — tidak dikerjakan`}
                    className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-1.5 py-0.5 text-[10px] text-destructive hover:bg-destructive/10"
                  >
                    <X size={9} />
                    <span className="max-w-[140px] truncate">{p.title} — tidak dikerjakan</span>
                  </button>
                ))}
                {d.points.map((p) => (
                  <button
                    key={p.itemId}
                    type="button"
                    onClick={() => onOpenPoint(p.itemId)}
                    title={`${p.title} — ${STATUS_TEXT[p.status]}`}
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
        {hasTrialMissed && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Masa uji: item yang tidak dikerjakan ditandai di sini, tetapi belum dihitung ke
            kepatuhan maupun skor cabang.
          </p>
        )}
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

/**
 * Slide-over kanan. <details> tidak cukup di sini: isinya form dengan state.
 *
 * Di-portal ke `document.body` (bukan dirender apa adanya di tempat) supaya
 * `fixed inset-0` benar-benar menutup viewport. Halaman ini dirender di
 * dalam wrapper `.animate-fade-up` (dipakai puluhan halaman lain juga) —
 * selama animation-nya masih "filling" (selalu, karena `both`), elemen itu
 * jadi containing block baru bagi descendant `position:fixed`, jadi drawer
 * ter-clip ke kotak wrapper itu alih-alih layar penuh. Portal keluar dari
 * subtree itu sepenuhnya menghindarinya, terlepas dari animasi ancestor
 * mana pun sekarang atau nanti.
 */
function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  if (!mounted) return null;

  return createPortal(
    <div
      // w-screen/h-screen SENGAJA eksplisit, bukan cuma andalkan inset-0:
      // di viewport mobile, `position:fixed` + `inset:0` tidak selalu
      // ter-resolve ke lebar/tinggi viewport visual yang benar (klasik di
      // browser mobile — device-width vs layout-width bisa beda). vw/vh
      // eksplisit memaksa ukurannya benar; sudah diverifikasi lebar overlay
      // ini 434px vs seharusnya 375px sebelum fix ini.
      className="fixed inset-0 z-50 flex w-screen h-screen justify-end"
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
    </div>,
    document.body
  );
}
