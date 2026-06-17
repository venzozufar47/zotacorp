/* PDF "Perjanjian Kerja" — @react-pdf/renderer (bukan DOM). Format formal:
 * blok judul terpusat + Nomor, heading "PASAL N / JUDUL" terpusat, body
 * justified, dan blok tanda tangan kedua pihak + zona meterai Rp10.000
 * (kosong; e-meterai dibubuhkan owner via Peruri setelah ini) + Lampiran 1.
 * Sah sebagai dokumen elektronik per UU ITE 2008. */

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
  spansToText,
  type ContractBlock,
  type InlineSpan,
} from "@/lib/employment-contracts/markdown";
import { interpolate } from "@/lib/whatsapp/templates";
import type {
  ContractFields,
  ContractLampiran,
} from "@/lib/employment-contracts/types";

const C = {
  fg: "#16181d",
  muted: "#4b4f57",
  faint: "#8a8e96",
  border: "#b7bbc2",
  rule: "#2a2d33",
  box: "#f3f4f6",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 54,
    paddingBottom: 60,
    paddingHorizontal: 58,
    fontSize: 10.5,
    lineHeight: 1.6,
    color: C.fg,
    fontFamily: "Times-Roman",
  },

  // Title block
  titleWrap: { marginBottom: 14, alignItems: "center" },
  docTitle: {
    fontSize: 16,
    fontFamily: "Times-Bold",
    textAlign: "center",
    letterSpacing: 2,
  },
  docNomor: {
    fontSize: 10.5,
    textAlign: "center",
    color: C.muted,
    marginTop: 3,
  },
  titleRule: {
    marginTop: 9,
    width: "100%",
    borderBottomWidth: 1.2,
    borderBottomColor: C.rule,
    borderBottomStyle: "solid",
  },

  // Body blocks
  p: { marginBottom: 6, textAlign: "justify" },
  bold: { fontFamily: "Times-Bold" },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderBottomStyle: "solid",
    marginVertical: 9,
  },

  // Pasal heading (centered "PASAL N" + title)
  pasalNum: {
    fontSize: 11,
    fontFamily: "Times-Bold",
    textAlign: "center",
    letterSpacing: 1,
    marginTop: 13,
  },
  pasalTitle: {
    fontSize: 11,
    fontFamily: "Times-Bold",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  h2: { fontSize: 11.5, fontFamily: "Times-Bold", marginTop: 11, marginBottom: 3 },
  h3: { fontSize: 10.5, fontFamily: "Times-Bold", marginTop: 7, marginBottom: 2 },

  // Lists
  li: { flexDirection: "row", marginBottom: 4, paddingLeft: 10 },
  liMarker: { width: 22, color: C.fg },
  liBody: { flex: 1, textAlign: "justify" },

  // Signature
  sigRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 22 },
  sigCell: { width: "45%", alignItems: "center" },
  sigCaption: { fontFamily: "Times-Bold", letterSpacing: 0.5 },
  sigSub: { color: C.muted, fontSize: 9.5, marginBottom: 6 },
  sigArea: { height: 104, width: "100%", position: "relative", alignItems: "center", justifyContent: "center" },
  meteraiBox: {
    position: "absolute",
    top: 6,
    width: 96,
    height: 82,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: "dashed",
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.box,
  },
  meteraiText: { fontSize: 7.5, color: C.faint, textAlign: "center" },
  sigImg: { position: "absolute", top: 12, width: 150, height: 78, objectFit: "contain" },
  sigNameWrap: {
    width: "92%",
    borderTopWidth: 1,
    borderTopColor: C.fg,
    borderTopStyle: "solid",
    paddingTop: 3,
    alignItems: "center",
  },
  sigName: { textAlign: "center", fontFamily: "Times-Bold" },
  sigNik: { textAlign: "center", fontSize: 8.5, color: C.muted },

  closing: { marginTop: 14, textAlign: "justify" },
  note: { fontSize: 8, color: C.muted, marginTop: 18, lineHeight: 1.45, textAlign: "justify" },
  pageNum: {
    position: "absolute",
    bottom: 26,
    left: 58,
    right: 58,
    fontSize: 8,
    color: C.faint,
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

const PASAL_RE = /^Pasal\s+(\d+)\s*:?\s*(.*)$/i;

function Blocks({ blocks }: { blocks: ContractBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "hr") return <View key={i} style={s.hr} />;
        if (b.kind === "h2") {
          const m = PASAL_RE.exec(spansToText(b.spans));
          if (m) {
            return (
              <View key={i} wrap={false}>
                <Text style={s.pasalNum}>PASAL {m[1]}</Text>
                <Text style={s.pasalTitle}>{m[2]}</Text>
              </View>
            );
          }
          return (
            <Text key={i} style={s.h2}>
              <Inline spans={b.spans} />
            </Text>
          );
        }
        if (b.kind === "h3")
          return (
            <Text key={i} style={s.h3}>
              <Inline spans={b.spans} />
            </Text>
          );
        if (b.kind === "h1")
          // Sub-judul tak terduga di body — render bold tengah.
          return (
            <Text key={i} style={[s.h2, { textAlign: "center" }]}>
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
        <View style={s.sigNameWrap}>
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
        <View style={s.sigNameWrap}>
          <Text style={s.sigName}>{secondName || "( ........................ )"}</Text>
          {secondNik ? <Text style={s.sigNik}>NIK: {secondNik}</Text> : null}
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

const CLOSING_RE = /^Demikian Perjanjian/i;

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
  const all = parseContractMarkdown(
    interpolate(bodyMarkdown, fields as Record<string, string>)
  );
  // Judul + "Nomor:" dirender sebagai blok judul khusus → buang dari body.
  // Kalimat penutup ("Demikian…") dipisah agar bisa ditempel di atas TTD.
  const body: ContractBlock[] = [];
  let closing: ContractBlock | null = null;
  for (const b of all) {
    if (b.kind === "h1") continue;
    if (b.kind === "p" && spansToText(b.spans).trim().startsWith("Nomor")) continue;
    if (b.kind === "p" && CLOSING_RE.test(spansToText(b.spans).trim())) {
      closing = b;
      continue;
    }
    body.push(b);
  }

  const nomorLine = `Nomor: ${fields.nomor || "____"}/PK/YS/${fields.tahun || ""}`;
  const nik = employeeNik || fields.nik || null;
  const signedLabel = signedAt
    ? new Date(signedAt).toLocaleString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Document title="Perjanjian Kerja" author="Yeobo Space">
      <Page size="A4" style={s.page}>
        <View style={s.titleWrap}>
          <Text style={s.docTitle}>PERJANJIAN KERJA</Text>
          <Text style={s.docNomor}>{nomorLine}</Text>
          <View style={s.titleRule} />
        </View>

        <Blocks blocks={body} />

        {closing ? (
          <Text style={s.closing}>
            <Inline spans={closing.spans} />
          </Text>
        ) : null}

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
        <View style={s.titleWrap}>
          <Text style={s.docTitle}>LAMPIRAN 1</Text>
          <Text style={s.docNomor}>DESKRIPSI PEKERJAAN</Text>
          <View style={s.titleRule} />
        </View>
        <Text style={s.p}>
          Lampiran ini merupakan bagian yang tidak terpisahkan dari Perjanjian
          Kerja {nomorLine}.
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
