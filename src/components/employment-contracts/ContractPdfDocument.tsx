/* PDF "Perjanjian Kerja" — @react-pdf/renderer (bukan DOM). Badan kontrak
 * dirender dari markdown (parseContractMarkdown), lalu blok tanda tangan kedua
 * pihak + zona meterai Rp10.000 (kosong; e-meterai dibubuhkan owner via Peruri
 * setelah ini) + Lampiran 1 (Deskripsi Pekerjaan). Sah sebagai dokumen
 * elektronik per UU ITE 2008 (e-signature + consent + timestamp). */

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  parseContractMarkdown,
  type ContractBlock,
  type InlineSpan,
} from "@/lib/employment-contracts/markdown";
import { interpolate } from "@/lib/whatsapp/templates";
import type {
  ContractFields,
  ContractLampiran,
} from "@/lib/employment-contracts/types";

const C = {
  fg: "#1d1d1f",
  muted: "#55555a",
  border: "#9a9aa0",
  box: "#f5f5f7",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 52,
    fontSize: 10,
    lineHeight: 1.5,
    color: C.fg,
    fontFamily: "Times-Roman",
  },
  h1: { fontSize: 14, fontFamily: "Times-Bold", textAlign: "center", marginBottom: 4 },
  h2: { fontSize: 11.5, fontFamily: "Times-Bold", marginTop: 10, marginBottom: 3 },
  h3: { fontSize: 10.5, fontFamily: "Times-Bold", marginTop: 7, marginBottom: 2 },
  p: { marginBottom: 5, textAlign: "justify" },
  li: { flexDirection: "row", marginBottom: 3, paddingLeft: 8 },
  liMarker: { width: 20, color: C.fg },
  liBody: { flex: 1, textAlign: "justify" },
  hr: { borderBottomWidth: 1, borderBottomColor: C.border, borderBottomStyle: "solid", marginVertical: 8 },
  bold: { fontFamily: "Times-Bold" },

  sigRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 18 },
  sigCell: { width: "46%" },
  sigCaption: { fontFamily: "Times-Bold", textAlign: "center", marginBottom: 2 },
  sigSub: { textAlign: "center", color: C.muted, fontSize: 9, marginBottom: 4 },
  sigArea: { height: 96, position: "relative", alignItems: "center", justifyContent: "center" },
  meteraiBox: {
    position: "absolute",
    top: 4,
    width: 92,
    height: 78,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: "dashed",
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.box,
  },
  meteraiText: { fontSize: 7.5, color: C.muted, textAlign: "center" },
  sigImg: { position: "absolute", top: 10, width: 130, height: 70, objectFit: "contain" },
  sigName: { textAlign: "center", fontFamily: "Times-Bold", marginTop: 2 },
  sigLineRow: { borderTopWidth: 1, borderTopColor: C.fg, borderTopStyle: "solid", marginTop: 2, paddingTop: 2 },
  note: { fontSize: 8, color: C.muted, marginTop: 14, lineHeight: 1.45 },
  pageNum: {
    position: "absolute",
    bottom: 24,
    left: 52,
    right: 52,
    fontSize: 8,
    color: C.muted,
    textAlign: "center",
  },
});

function Inline({ spans }: { spans: InlineSpan[] }) {
  return (
    <>
      {spans.map((sp, i) =>
        sp.bold ? (
          <Text key={i} style={s.bold}>
            {sp.text}
          </Text>
        ) : (
          <Text key={i}>{sp.text}</Text>
        )
      )}
    </>
  );
}

function Blocks({ blocks }: { blocks: ContractBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "hr") return <View key={i} style={s.hr} />;
        if (b.kind === "h1")
          return (
            <Text key={i} style={s.h1}>
              <Inline spans={b.spans} />
            </Text>
          );
        if (b.kind === "h2")
          return (
            <Text key={i} style={s.h2}>
              <Inline spans={b.spans} />
            </Text>
          );
        if (b.kind === "h3")
          return (
            <Text key={i} style={s.h3}>
              <Inline spans={b.spans} />
            </Text>
          );
        if (b.kind === "li")
          return (
            <View key={i} style={s.li} wrap={false}>
              <Text style={s.liMarker}>{b.marker}</Text>
              <Text style={s.liBody}>
                <Inline spans={b.spans} />
              </Text>
            </View>
          );
        return (
          <Text key={i} style={s.p}>
            <Inline spans={b.spans} />
          </Text>
        );
      })}
    </>
  );
}

function SignatureBlock({
  firstName,
  firstRole,
  secondName,
  secondRole,
  secondNik,
  employerSig,
  employeeSig,
  withMeterai,
}: {
  firstName: string;
  firstRole: string;
  secondName: string;
  secondRole: string;
  secondNik?: string | null;
  employerSig?: string | null;
  employeeSig?: string | null;
  withMeterai?: boolean;
}) {
  return (
    <View style={s.sigRow} wrap={false}>
      <View style={s.sigCell}>
        <Text style={s.sigCaption}>PIHAK PERTAMA</Text>
        <Text style={s.sigSub}>{firstRole}</Text>
        <View style={s.sigArea}>
          {employerSig ? <Image style={s.sigImg} src={employerSig} /> : null}
        </View>
        <View style={s.sigLineRow}>
          <Text style={s.sigName}>{firstName || "( ........................ )"}</Text>
        </View>
      </View>
      <View style={s.sigCell}>
        <Text style={s.sigCaption}>PIHAK KEDUA</Text>
        <Text style={s.sigSub}>{secondRole}</Text>
        <View style={s.sigArea}>
          {withMeterai ? (
            <View style={s.meteraiBox}>
              <Text style={s.meteraiText}>Meterai{"\n"}Rp10.000</Text>
            </View>
          ) : null}
          {employeeSig ? <Image style={s.sigImg} src={employeeSig} /> : null}
        </View>
        <View style={s.sigLineRow}>
          <Text style={s.sigName}>{secondName || "( ........................ )"}</Text>
          {secondNik ? (
            <Text style={{ textAlign: "center", fontSize: 8, color: C.muted }}>
              NIK: {secondNik}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function LampiranList({ title, items }: { title: string; items: string[] }) {
  const clean = (items ?? []).map((x) => (x ?? "").trim()).filter(Boolean);
  return (
    <View>
      <Text style={s.h3}>{title}</Text>
      {clean.length === 0 ? (
        <Text style={s.p}>—</Text>
      ) : (
        clean.map((it, i) => (
          <View key={i} style={s.li} wrap={false}>
            <Text style={s.liMarker}>{i + 1}.</Text>
            <Text style={s.liBody}>{it}</Text>
          </View>
        ))
      )}
    </View>
  );
}

export interface ContractPdfProps {
  bodyMarkdown: string;
  fields: ContractFields;
  lampiran: ContractLampiran;
  employerName: string;
  employerRole: string;
  employeeName: string;
  employeeNik?: string | null;
  signedAt?: string | null;
  employerSignatureDataUrl?: string | null;
  employeeSignatureDataUrl?: string | null;
}

export function ContractPdfDocument({
  bodyMarkdown,
  fields,
  lampiran,
  employerName,
  employerRole,
  employeeName,
  employeeNik,
  signedAt,
  employerSignatureDataUrl,
  employeeSignatureDataUrl,
}: ContractPdfProps) {
  const blocks = parseContractMarkdown(
    interpolate(bodyMarkdown, fields as Record<string, string>)
  );
  const signedLabel = signedAt
    ? new Date(signedAt).toLocaleString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const nik = employeeNik || fields.nik || null;

  return (
    <Document title="Perjanjian Kerja" author="Yeobo Space">
      <Page size="A4" style={s.page}>
        <Blocks blocks={blocks} />
        <SignatureBlock
          firstName={employerName}
          firstRole={employerRole || "Pemberi Kerja"}
          secondName={employeeName}
          secondRole="Karyawan"
          secondNik={nik}
          employerSig={employerSignatureDataUrl}
          employeeSig={employeeSignatureDataUrl}
          withMeterai
        />
        <Text style={s.note}>
          Dokumen ini ditandatangani secara elektronik
          {signedLabel ? ` pada ${signedLabel}` : ""} dan merupakan alat bukti
          hukum yang sah berdasarkan UU No. 11 Tahun 2008 tentang Informasi dan
          Transaksi Elektronik (sebagaimana diubah dengan UU No. 19 Tahun 2016).
          Meterai Rp10.000 dibubuhkan secara terpisah pada zona yang tersedia.
        </Text>
        <Text
          style={s.pageNum}
          render={({ pageNumber, totalPages }) =>
            `Perjanjian Kerja${employeeName ? ` — ${employeeName}` : ""} · Hal. ${pageNumber}/${totalPages}`
          }
          fixed
        />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h1}>LAMPIRAN 1: DESKRIPSI PEKERJAAN</Text>
        <Text style={s.p}>
          Lampiran ini merupakan bagian yang tidak terpisahkan dari Perjanjian
          Kerja{fields.nomor ? ` Nomor ${fields.nomor}/PK/YS/${fields.tahun ?? ""}` : ""}.
        </Text>

        <Text style={s.h3}>A. Identitas Posisi</Text>
        <Text style={s.p}>
          Nama Karyawan: {lampiran.nama || fields.nama || "—"}
          {"\n"}Posisi / Jabatan: {lampiran.posisi || fields.jabatan || "—"}
          {"\n"}Cabang Penempatan: {lampiran.cabang || fields.cabang || "—"}
        </Text>

        <LampiranList title="B. Tujuan Posisi" items={lampiran.tujuan} />
        <LampiranList title="C. Tanggung Jawab Utama" items={lampiran.tanggung_jawab} />
        <LampiranList title="D. SOP yang Relevan dengan Posisi" items={lampiran.sop} />
        <LampiranList title="E. Indikator Kinerja Utama (KPI)" items={lampiran.kpi} />
        <LampiranList title="F. Waktu Kerja / Shift" items={lampiran.shift} />

        <Text style={[s.p, { marginTop: 10 }]}>
          Karyawan menyatakan telah memahami dan menyetujui Deskripsi Pekerjaan
          ini sebagai bagian dari Perjanjian Kerja.
        </Text>

        <SignatureBlock
          firstName={employerName}
          firstRole={employerRole || "Pemberi Kerja"}
          secondName={employeeName}
          secondRole="Karyawan"
          secondNik={nik}
          employerSig={employerSignatureDataUrl}
          employeeSig={employeeSignatureDataUrl}
        />
        <Text
          style={s.pageNum}
          render={({ pageNumber, totalPages }) =>
            `Lampiran 1 · Hal. ${pageNumber}/${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
