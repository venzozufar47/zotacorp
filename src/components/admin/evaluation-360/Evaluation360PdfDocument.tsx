/* PDF "Hasil Evaluasi 360°" per karyawan — untuk diunduh admin lalu
 * diberikan ke karyawan bersangkutan. Skor per metrik memakai RATA-RATA
 * semua evaluator (bukan per-evaluator) dan alasan/apresiasi/catatan
 * ditampilkan sebagai daftar "Poin 1, 2, ..." bernomor URUT POSISI
 * (lihat blendReasons.ts) — TIDAK PERNAH diberi label nama/inisial
 * evaluator dalam bentuk apa pun, dan urutan diacak secara independen
 * di tiap bagian, supaya "Poin 1" di satu metrik tidak bisa dikaitkan
 * dengan "Poin 1" di metrik lain. Konsisten dengan desain produk bahwa
 * identitas evaluator dirahasiakan dari karyawan yang dievaluasi, bahkan
 * di dokumen resminya. Murni penyusunan teks apa adanya — tanpa AI.
 *
 * Sama seperti PayslipPdfDocument: primitives @react-pdf/renderer,
 * bukan DOM. Layout formal header band (berulang tiap halaman) +
 * section + footer band.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import {
  EVALUATION_360_METRICS,
  EVALUATION_360_MAX_TOTAL,
} from "@/lib/evaluation-360/rubric";
import {
  blendMetricReasons,
  blendApresiasi,
  blendNotes,
  averageMetricScores,
} from "@/lib/evaluation-360/blendReasons";
import type { RoundResponseDTO, SubjectNotesDTO } from "@/lib/actions/evaluation-360.actions";

const C = {
  primary: "#117a8c",
  primaryDark: "#0c5d6c",
  fg: "#1d1d1f",
  mutedFg: "#6e6e73",
  border: "#d2d2d7",
  surface: "#ffffff",
  accent: "#eef7f9",
  warn: "#8a5a00",
  warnBg: "#fdf3e0",
};

const styles = StyleSheet.create({
  page: {
    paddingBottom: 40, // sisakan ruang footerBand fixed supaya konten tidak tertindih
    fontSize: 10,
    color: C.fg,
    fontFamily: "Helvetica",
    backgroundColor: C.surface,
  },
  headerBand: {
    backgroundColor: C.primary,
    color: "#ffffff",
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  brand: { fontSize: 16, fontWeight: "bold", letterSpacing: 2 },
  brandTagline: {
    fontSize: 8.5,
    marginTop: 3,
    opacity: 0.85,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  body: { paddingHorizontal: 32, paddingTop: 16, paddingBottom: 8 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  metaCell: { flex: 1 },
  metaLabel: {
    fontSize: 8,
    color: C.mutedFg,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  metaValue: { fontSize: 11, color: C.fg, fontWeight: "bold" },
  section: {
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: "solid",
    borderRadius: 4,
    marginBottom: 10,
    overflow: "hidden",
  },
  sectionHeader: {
    backgroundColor: C.accent,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderBottomStyle: "solid",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: C.primaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionScore: { fontSize: 10.5, fontWeight: "bold", color: C.primaryDark },
  sectionBody: { padding: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  rowLabelMuted: { color: C.mutedFg, fontSize: 10 },
  rowValue: { color: C.fg, fontSize: 10, fontWeight: "bold" },
  scoreTableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderBottomStyle: "solid",
    paddingBottom: 4,
    marginBottom: 4,
  },
  scoreTableRow: { flexDirection: "row", paddingVertical: 2.5 },
  scoreTableRowTotal: {
    flexDirection: "row",
    paddingTop: 5,
    marginTop: 3,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopStyle: "dashed",
  },
  scoreTableLabel: { flex: 1, fontSize: 9.5 },
  scoreTableLabelHeader: {
    flex: 1,
    fontSize: 8,
    color: C.mutedFg,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scoreTableValue: { width: 60, fontSize: 9.5, textAlign: "right" },
  scoreTableValueHeader: {
    width: 60,
    fontSize: 8,
    color: C.mutedFg,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "right",
  },
  // Daftar "Poin N" — pengganti paragraf gabungan, tiap potongan teks
  // berdiri sendiri bernomor urut posisi (bukan per-evaluator).
  pointRow: { flexDirection: "row", marginBottom: 5 },
  pointRowLast: { flexDirection: "row" },
  pointNumber: {
    width: 16,
    fontSize: 9,
    fontWeight: "bold",
    color: C.primaryDark,
  },
  pointText: { flex: 1, fontSize: 9.5, color: C.fg, lineHeight: 1.4 },
  emptyText: { fontSize: 9.5, color: C.mutedFg, fontStyle: "italic" },
  metricBlock: { marginBottom: 9 },
  metricBlockDivider: {
    marginBottom: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopStyle: "solid",
  },
  metricHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  metricTitle: { fontSize: 9.5, fontWeight: "bold", color: C.fg },
  metricScore: { fontSize: 9.5, fontWeight: "bold", color: C.primaryDark },
  // Field label+value (Ringkasan & Rencana Tindak Lanjut) — pakai
  // border-top sebagai pemisah antar field, BUKAN cuma marginBottom:
  // marginBottom pada View pembungkus tidak selalu menyisakan jarak
  // yang konsisten di react-pdf begitu isinya Text bertumpuk, jadi
  // pemisah eksplisit (border) dipakai supaya jaraknya terjamin.
  fieldBlock: { paddingBottom: 9, marginBottom: 9 },
  fieldBlockDivider: {
    paddingTop: 9,
    paddingBottom: 9,
    marginBottom: 9,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopStyle: "solid",
  },
  fieldLabel: { color: C.mutedFg, fontSize: 9, marginBottom: 3 },
  fieldValue: { fontSize: 9.5, color: C.fg, lineHeight: 1.4 },
  disclaimer: {
    backgroundColor: C.warnBg,
    borderRadius: 4,
    padding: 9,
    marginBottom: 10,
  },
  disclaimerText: { fontSize: 8.5, color: C.warn, lineHeight: 1.4 },
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

function Section({
  title,
  score,
  children,
}: {
  title: string;
  score?: string;
  children: React.ReactNode;
}) {
  // Sengaja TANPA wrap={false}: dengan kohort besar (banyak evaluator),
  // daftar poin gabungan bisa lebih panjang dari satu halaman —
  // wrap={false} akan memotong/overflow kontennya alih-alih melanjutkan
  // ke halaman berikut.
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {score && <Text style={styles.sectionScore}>{score}</Text>}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/** Daftar "Poin 1, 2, ..." — nomor murni posisional (urutan sudah
 *  diacak di blendReasons.ts), tidak pernah berupa nama/inisial. */
function PointList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <Text style={styles.emptyText}>Belum ada catatan.</Text>;
  }
  return (
    <View>
      {items.map((text, i) => (
        <View key={i} style={i === items.length - 1 ? styles.pointRowLast : styles.pointRow}>
          <Text style={styles.pointNumber}>{i + 1}.</Text>
          <Text style={styles.pointText}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

interface Props {
  subjectName: string;
  roundTitle: string;
  responses: RoundResponseDTO[];
  notes: SubjectNotesDTO | null;
}

export function Evaluation360PdfDocument({
  subjectName,
  roundTitle,
  responses,
  notes,
}: Props) {
  const evaluatorCount = responses.length;
  const averages = averageMetricScores(responses);
  const blendedReasons = blendMetricReasons(responses);
  const apresiasi = blendApresiasi(responses);
  const catatan = blendNotes(responses);
  const avgTotal =
    Math.round(
      (EVALUATION_360_METRICS.reduce((sum, m) => sum + averages[m.key], 0) /
        EVALUATION_360_METRICS.length) *
        10
    ) / 10;
  const generatedAt = new Date().toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Document title={`Hasil Evaluasi 360 - ${subjectName}`} author="Zota Corp">
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBand} fixed>
          <Text style={styles.brand}>ZOTA CORP</Text>
          <Text style={styles.brandTagline}>Hasil Evaluasi 360°</Text>
        </View>

        <View style={styles.body}>
          <View style={styles.metaRow}>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Karyawan</Text>
              <Text style={styles.metaValue}>{subjectName}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Sesi evaluasi</Text>
              <Text style={styles.metaValue}>{roundTitle}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Diterbitkan</Text>
              <Text style={styles.metaValue}>{generatedAt}</Text>
            </View>
          </View>

          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>
              Skor tiap metrik adalah rata-rata dari {evaluatorCount} rekan
              yang menilai. Poin-poin di bawah digabung dari semua evaluator
              dan diberi nomor urut acak (bukan nama) — identitas
              masing-masing evaluator dirahasiakan.
            </Text>
          </View>

          <Section title="Ringkasan Skor">
            <View style={styles.scoreTableHeader}>
              <Text style={styles.scoreTableLabelHeader}>Metrik</Text>
              <Text style={styles.scoreTableValueHeader}>Rata-rata</Text>
            </View>
            {EVALUATION_360_METRICS.map((m) => (
              <View key={m.key} style={styles.scoreTableRow}>
                <Text style={styles.scoreTableLabel}>{m.title}</Text>
                <Text style={styles.scoreTableValue}>{averages[m.key]} / 10</Text>
              </View>
            ))}
            <View style={styles.scoreTableRowTotal}>
              <Text style={[styles.scoreTableLabel, { fontWeight: "bold" }]}>
                Rata-rata keseluruhan
              </Text>
              <Text style={[styles.scoreTableValue, { fontWeight: "bold" }]}>
                {avgTotal} / {EVALUATION_360_MAX_TOTAL / EVALUATION_360_METRICS.length}
              </Text>
            </View>
          </Section>

          <Section title="Apresiasi">
            <PointList items={apresiasi} />
          </Section>

          <Section title="Detail per Metrik">
            {EVALUATION_360_METRICS.map((m, i) => (
              <View
                key={m.key}
                style={i === 0 ? styles.metricBlock : styles.metricBlockDivider}
              >
                <View style={styles.metricHeaderRow}>
                  <Text style={styles.metricTitle}>{m.title}</Text>
                  <Text style={styles.metricScore}>{averages[m.key]} / 10</Text>
                </View>
                <PointList items={blendedReasons[m.key]} />
              </View>
            ))}
          </Section>

          <Section title="Catatan Tambahan">
            <PointList items={catatan} />
          </Section>

          <Section title="Ringkasan & Rencana Tindak Lanjut">
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Kesimpulan hasil diskusi</Text>
              <Text style={styles.fieldValue}>{notes?.kesimpulan || "—"}</Text>
            </View>
            <View style={styles.fieldBlockDivider}>
              <Text style={styles.fieldLabel}>Target perbaikan (4 minggu)</Text>
              <Text style={styles.fieldValue}>{notes?.targetPerbaikan || "—"}</Text>
            </View>
            <View style={styles.fieldBlockDivider}>
              <Text style={styles.fieldLabel}>Cara pengecekan progres</Text>
              <Text style={styles.fieldValue}>{notes?.caraPengecekan || "—"}</Text>
            </View>
            <View style={[styles.fieldBlockDivider, styles.row, { marginBottom: 0 }]}>
              <Text style={styles.rowLabelMuted}>Target selesai</Text>
              <Text style={styles.rowValue}>
                {fmtDate(notes?.targetCompletionDate || null)}
              </Text>
            </View>
          </Section>
        </View>

        <View style={styles.footerBand} fixed>
          <Text style={styles.footerText}>
            PT Zota Corp · Evaluasi 360° · {subjectName} · Dibuat {generatedAt}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
