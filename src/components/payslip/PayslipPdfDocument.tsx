/* PDF document for formal "Slip Gaji Karyawan" download. Uses
 * @react-pdf/renderer's React-like primitives -these have nothing to
 * do with browser DOM, despite the JSX. The output is a downloadable
 * A4 PDF intended as bukti legalitas yang sah per UU ITE 2008.
 *
 * Layout is deliberately formal (header band + bordered sections +
 * footer band) and Indonesian-only regardless of the UI's current
 * language setting.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { formatMonthYear, formatDateLong } from "@/lib/payslip/formatters";
import type {
  Payslip,
  PayslipBreakdown,
  PayslipDeliverable,
  PayslipSettings,
  Profile,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Tokens -keep in sync with the on-screen Oceanic palette
// ---------------------------------------------------------------------------

const C = {
  primary: "#117a8c",
  primaryDark: "#0c5d6c",
  fg: "#1d1d1f",
  mutedFg: "#6e6e73",
  border: "#d2d2d7",
  surface: "#ffffff",
  accent: "#eef7f9",
  green: "#1b7a3a",
  red: "#a8261d",
};

const styles = StyleSheet.create({
  page: {
    padding: 0,
    fontSize: 10,
    color: C.fg,
    fontFamily: "Helvetica",
    backgroundColor: C.surface,
  },
  headerBand: {
    backgroundColor: C.primary,
    color: "#ffffff",
    paddingHorizontal: 32,
    paddingVertical: 18,
  },
  brand: {
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  brandTagline: {
    fontSize: 9,
    marginTop: 4,
    opacity: 0.85,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  body: {
    paddingHorizontal: 32,
    paddingVertical: 20,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  metaCell: { flex: 1 },
  metaLabel: {
    fontSize: 8,
    color: C.mutedFg,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 11,
    color: C.fg,
    fontWeight: "bold",
  },
  section: {
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: "solid",
    borderRadius: 4,
    marginBottom: 12,
    overflow: "hidden",
  },
  sectionHeader: {
    backgroundColor: C.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderBottomStyle: "solid",
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: C.primaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionBody: {
    padding: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  rowDivider: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopStyle: "dashed",
    marginTop: 3,
  },
  rowLabel: { color: C.fg, fontSize: 10 },
  rowLabelMuted: { color: C.mutedFg, fontSize: 10 },
  rowValue: { color: C.fg, fontSize: 10, fontWeight: "bold" },
  rowValueGreen: { color: C.green, fontSize: 10, fontWeight: "bold" },
  rowValueRed: { color: C.red, fontSize: 10, fontWeight: "bold" },
  netSection: {
    backgroundColor: C.primary,
    color: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  netLabel: {
    color: "#ffffff",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  netAmount: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
  },
  notes: {
    fontSize: 8.5,
    color: C.mutedFg,
    marginTop: 8,
    lineHeight: 1.5,
  },
  notesItem: {
    flexDirection: "row",
    marginBottom: 3,
  },
  notesBullet: { width: 10, color: C.mutedFg },
  notesText: { flex: 1, color: C.mutedFg, fontSize: 8.5, lineHeight: 1.5 },
  footerBand: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.primaryDark,
    color: "#ffffff",
    paddingHorizontal: 32,
    paddingVertical: 8,
    fontSize: 8,
  },
  footerText: { color: "#ffffff", fontSize: 8, opacity: 0.85 },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtRp(n: number): string {
  return "Rp " + Math.abs(n).toLocaleString("id-ID");
}

function describeBasis(s: PayslipSettings | null): string {
  const b = s?.calculation_basis ?? "presence";
  if (b === "presence") return "Kehadiran (prorata)";
  if (b === "daily") return "Gaji harian (per hari hadir)";
  if (b === "deliverables") return "Pencapaian deliverables";
  if (b === "fixed") return "Kontrak tetap";
  const aw = Number(s?.attendance_weight_pct ?? 50);
  const dw = Number(s?.deliverables_weight_pct ?? 50);
  return `Gabungan: kehadiran ${aw}% + deliverables ${dw}%`;
}

function payslipReferenceNumber(p: Payslip): string {
  // Stable short reference using the year + month + first 8 of UUID.
  const shortId = (p.id ?? "").slice(0, 8).toUpperCase();
  return `ZTC-PSL-${p.year}${String(p.month).padStart(2, "0")}-${shortId}`;
}

// ---------------------------------------------------------------------------
// Earnings / deductions composition -mirrors PayslipEarningsCard /
// PayslipDeductionsCard logic so the PDF matches the on-screen breakdown
// for every basis.
// ---------------------------------------------------------------------------

type Line = { label: string; amount: number; sign: "+" | "-" };

function buildPdfEarnings(
  p: Payslip,
  basis: string,
  breakdown: PayslipBreakdown | null
): { lines: Line[]; subtotal: number } {
  const lines: Line[] = [];
  const base = Number(p.base_salary);
  const prorated = Number(p.prorated_salary);
  const ot = Number(p.overtime_pay);
  const extra = Number(p.extra_work_pay);
  const deliv = Number(p.deliverables_pay);
  const bonus = Number(p.monthly_bonus);
  const cakeBonus = Number(p.cake_bonus ?? 0);

  if (basis === "presence" || basis === "both" || basis === "daily") {
    if (prorated > 0) {
      const overworked = p.actual_work_days > p.expected_work_days;
      lines.push({
        label:
          basis === "daily"
            ? `Gaji harian (${p.actual_work_days} hari)`
            : overworked
              ? "Gaji prorata (termasuk hari ekstra)"
              : "Gaji prorata",
        amount: prorated,
        sign: "+",
      });
    }
    const extraDayOt = breakdown?.extra_day_overtime;
    const dailyOt = ot - (extraDayOt?.pay ?? 0);
    if (dailyOt > 0) {
      const days = breakdown?.overtime_days.length ?? 0;
      lines.push({
        label: `Bayaran lembur${days ? ` (${days} hari)` : ""}`,
        amount: dailyOt,
        sign: "+",
      });
    }
    if (extraDayOt && extraDayOt.pay > 0) {
      lines.push({
        label: `Lembur hari ekstra (${extraDayOt.days} hari)`,
        amount: extraDayOt.pay,
        sign: "+",
      });
    }
  }
  if (basis === "fixed") {
    if (base > 0) {
      lines.push({ label: "Gaji pokok kontrak tetap", amount: base, sign: "+" });
    }
  }
  if (basis === "deliverables" || basis === "both") {
    if (deliv > 0) {
      const pct = Number(p.deliverables_achievement_pct).toFixed(1);
      lines.push({
        label: `Deliverables (${pct}%)`,
        amount: deliv,
        sign: "+",
      });
    }
  }
  if (extra > 0) {
    const entries = breakdown?.extra_work_days?.length ?? 0;
    lines.push({
      label: `Kerjaan tambahan${entries ? ` (${entries} entri)` : ""}`,
      amount: extra,
      sign: "+",
    });
  }
  if (bonus > 0) {
    lines.push({
      label: "Bonus bulanan" + (p.monthly_bonus_note ? ` -${p.monthly_bonus_note}` : ""),
      amount: bonus,
      sign: "+",
    });
  }
  if (cakeBonus > 0) {
    lines.push({
      label: "Bonus Cake" + (p.cake_bonus_note ? ` -${p.cake_bonus_note}` : ""),
      amount: cakeBonus,
      sign: "+",
    });
  }

  const subtotal = lines.reduce((a, l) => a + l.amount, 0);
  return { lines, subtotal };
}

function buildPdfDeductions(
  p: Payslip,
  basis: string,
  breakdown: PayslipBreakdown | null
): { lines: Line[]; subtotal: number } {
  const lines: Line[] = [];
  const late = Number(p.late_penalty);
  const debt = Number(p.debt_deduction);
  const other = Number(p.other_penalty);

  if (
    (basis === "presence" || basis === "both" || basis === "daily") &&
    late > 0
  ) {
    const lateDays = (breakdown?.late_days ?? []).filter((d) => !d.excused).length;
    lines.push({
      label: `Denda terlambat${lateDays ? ` (${lateDays} hari)` : ""}`,
      amount: late,
      sign: "-",
    });
  }
  if (debt > 0) {
    lines.push({
      label: "Potongan utang" + (p.debt_deduction_note ? ` -${p.debt_deduction_note.split("\n")[0]}` : ""),
      amount: debt,
      sign: "-",
    });
  }
  if (other > 0) {
    lines.push({
      label: "Denda lain" + (p.other_penalty_note ? ` -${p.other_penalty_note}` : ""),
      amount: other,
      sign: "-",
    });
  }
  const subtotal = lines.reduce((a, l) => a + l.amount, 0);
  return { lines, subtotal };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaCell}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function LineRow({ line }: { line: Line }) {
  const valueStyle =
    line.sign === "+"
      ? styles.rowValueGreen
      : line.sign === "-"
        ? styles.rowValueRed
        : styles.rowValue;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabelMuted}>{line.label}</Text>
      <Text style={valueStyle}>
        {line.sign} {fmtRp(line.amount)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main document
// ---------------------------------------------------------------------------

interface Props {
  payslip: Payslip;
  deliverables: PayslipDeliverable[];
  settings: PayslipSettings | null;
  profile: Profile | null;
}

export function PayslipPdfDocument({
  payslip: p,
  settings,
  profile,
}: Props) {
  const period = formatMonthYear(p.year, p.month, "id");
  const ref = payslipReferenceNumber(p);
  const issuedAt = formatDateLong(
    (p.updated_at ?? new Date().toISOString()).slice(0, 10),
    "id"
  );
  const generatedAt = new Date().toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const basis = settings?.calculation_basis ?? "presence";
  const isAttendanceBased =
    basis === "presence" || basis === "both" || basis === "daily";
  const breakdown = p.breakdown_json as PayslipBreakdown | null;
  const earnings = buildPdfEarnings(p, basis, breakdown);
  const deductions = buildPdfDeductions(p, basis, breakdown);

  return (
    <Document title={`Slip Gaji ${period}`} author="Zota Corp">
      <Page size="A4" style={styles.page}>
        {/* Header band */}
        <View style={styles.headerBand}>
          <Text style={styles.brand}>ZOTA CORP</Text>
          <Text style={styles.brandTagline}>Slip Gaji Karyawan</Text>
        </View>

        <View style={styles.body}>
          {/* Meta */}
          <View style={styles.metaRow}>
            <MetaCell label="Periode" value={period} />
            <MetaCell label="Nomor slip" value={ref} />
            <MetaCell label="Diterbitkan" value={issuedAt} />
          </View>

          {/* Karyawan */}
          <Section title="Karyawan">
            <View style={styles.row}>
              <Text style={styles.rowLabelMuted}>Nama</Text>
              <Text style={styles.rowValue}>{profile?.full_name ?? "-"}</Text>
            </View>
            {profile?.job_role && (
              <View style={styles.row}>
                <Text style={styles.rowLabelMuted}>Jabatan</Text>
                <Text style={styles.rowValue}>
                  {profile.job_role}
                  {profile.business_unit ? ` -${profile.business_unit}` : ""}
                </Text>
              </View>
            )}
            <View style={styles.row}>
              <Text style={styles.rowLabelMuted}>Basis perhitungan</Text>
              <Text style={styles.rowValue}>{describeBasis(settings)}</Text>
            </View>
            {isAttendanceBased && (
              <View style={styles.row}>
                <Text style={styles.rowLabelMuted}>Kehadiran</Text>
                <Text style={styles.rowValue}>
                  {p.actual_work_days} dari {p.expected_work_days} hari kerja
                </Text>
              </View>
            )}
          </Section>

          {/* Pendapatan */}
          {earnings.lines.length > 0 && (
            <Section title="Pendapatan">
              {earnings.lines.map((l, i) => (
                <LineRow key={i} line={l} />
              ))}
              <View style={styles.rowDivider}>
                <Text style={styles.rowLabel}>Bruto</Text>
                <Text style={styles.rowValue}>{fmtRp(earnings.subtotal)}</Text>
              </View>
            </Section>
          )}

          {/* Potongan */}
          {deductions.lines.length > 0 && (
            <Section title="Potongan">
              {deductions.lines.map((l, i) => (
                <LineRow key={i} line={l} />
              ))}
              <View style={styles.rowDivider}>
                <Text style={styles.rowLabel}>Total potongan</Text>
                <Text style={styles.rowValueRed}>
                  - {fmtRp(deductions.subtotal)}
                </Text>
              </View>
            </Section>
          )}

          {/* Net */}
          <View style={styles.netSection}>
            <Text style={styles.netLabel}>Total Bersih (Diterima)</Text>
            <Text style={styles.netAmount}>{fmtRp(Number(p.net_total))}</Text>
          </View>

          {/* Status */}
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.rowLabelMuted}>
              Status pembayaran:{" "}
              <Text style={styles.rowValue}>
                {p.payment_status === "paid"
                  ? p.payment_at
                    ? `Sudah ditransfer pada ${formatDateLong(p.payment_at.slice(0, 10), "id")}`
                    : "Sudah ditransfer"
                  : "Menunggu transfer"}
              </Text>
            </Text>
          </View>

          {/* Notes -legal disclaimer */}
          <View style={{ marginTop: 8 }}>
            <Text
              style={{
                fontSize: 9,
                fontWeight: "bold",
                color: C.fg,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 4,
              }}
            >
              Catatan
            </Text>
            {[
              `Slip ini diterbitkan secara elektronik oleh sistem Zota Corp pada ${generatedAt}. Berdasarkan UU No. 11 Tahun 2008 tentang Informasi dan Transaksi Elektronik (sebagaimana diubah dengan UU No. 19 Tahun 2016), dokumen elektronik merupakan alat bukti hukum yang sah.`,
              "Slip ini hanya berlaku untuk karyawan atas nama tersebut di atas dan periode yang tertera.",
            ].map((line, i) => (
              <View key={i} style={styles.notesItem}>
                <Text style={styles.notesBullet}>•</Text>
                <Text style={styles.notesText}>{line}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Footer band */}
        <View style={styles.footerBand} fixed>
          <Text style={styles.footerText}>
            PT Zota Corp · Slip Gaji {period} · Ref {ref}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
