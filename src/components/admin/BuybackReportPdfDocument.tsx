/* PDF laporan buyback aset bergerak (react-pdf). Snapshot beku — dirender
 * apa adanya dari data laporan, tidak dihitung ulang. Indonesian-only, A4. */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from "@/lib/investor/buyback-depreciation";
import type { BuybackReportDetail } from "@/lib/actions/yeobo-buyback.actions";

const C = {
  primary: "#117a8c",
  fg: "#1d1d1f",
  mutedFg: "#6e6e73",
  border: "#d2d2d7",
  accent: "#eef7f9",
  amber: "#b45309",
};

const rp = (n: number) => "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n));
const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
};

const s = StyleSheet.create({
  page: { padding: 0, fontSize: 9, color: C.fg, fontFamily: "Helvetica" },
  band: {
    backgroundColor: C.primary,
    color: "#fff",
    paddingHorizontal: 32,
    paddingVertical: 18,
  },
  brand: { fontSize: 16, fontWeight: "bold" },
  tag: { fontSize: 9, marginTop: 3, opacity: 0.85 },
  body: { paddingHorizontal: 32, paddingTop: 16, paddingBottom: 32 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: C.accent,
    borderRadius: 6,
    padding: 10,
    marginBottom: 14,
  },
  summaryItem: { alignItems: "flex-start" },
  summaryLabel: { fontSize: 7.5, color: C.mutedFg, textTransform: "uppercase" },
  summaryValue: { fontSize: 11, fontWeight: "bold", marginTop: 2 },
  policyLine: { fontSize: 8, color: C.mutedFg, marginBottom: 12 },
  categoryTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: C.primary,
    marginTop: 10,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#f4f4f5",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerCell: {
    fontSize: 7.5,
    fontWeight: "bold",
    color: C.mutedFg,
    textTransform: "uppercase",
  },
  dataRow: {
    flexDirection: "row",
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  cell: { fontSize: 8.5 },
  overrideNote: { fontSize: 6.5, color: C.amber, marginTop: 1 },
  subtotalRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: "#f4f4f5",
  },
  // paddingRight di tiap kolom (kecuali terakhir) WAJIB ada — tanpa itu,
  // kolom rata-kanan (mis. Nilai awal) yang diikuti kolom rata-kiri (Tgl
  // beli) sama-sama menempel ke garis batas bersama dan teksnya menyatu
  // tanpa jarak sama sekali (ditemukan nyata: "Rp 6.500.0001 Juli 2023").
  colName: { width: "32%", paddingRight: 6 },
  colQty: { width: "10%", textAlign: "right", paddingRight: 6 },
  colCost: { width: "18%", textAlign: "right", paddingRight: 8 },
  colDate: { width: "16%", paddingRight: 6 },
  colMonths: { width: "10%", textAlign: "right", paddingRight: 6 },
  colBv: { width: "14%", textAlign: "right" },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 10,
    borderTopWidth: 1.5,
    borderTopColor: C.fg,
  },
  grandLabel: { fontSize: 10, fontWeight: "bold" },
  grandValue: { fontSize: 13, fontWeight: "bold", color: C.primary },
  footer: { marginTop: 24, fontSize: 7.5, color: C.mutedFg, textAlign: "center" },
  invBox: {
    backgroundColor: C.accent,
    borderRadius: 6,
    padding: 10,
    marginBottom: 14,
  },
  invTitle: { fontSize: 10, fontWeight: "bold", marginBottom: 2 },
  invSub: { fontSize: 7.5, color: C.mutedFg, marginBottom: 8 },
  invHeaderRow: {
    flexDirection: "row",
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  invRow: { flexDirection: "row", paddingVertical: 3 },
  invTotalRow: {
    flexDirection: "row",
    paddingTop: 4,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  colInvName: { width: "40%", paddingRight: 6 },
  colInvPct: { width: "25%", textAlign: "right", paddingRight: 8 },
  colInvAmount: { width: "35%", textAlign: "right" },
});

export function BuybackReportPdfDocument({
  report,
}: {
  report: BuybackReportDetail;
}) {
  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <View style={s.band} fixed>
          <Text style={s.brand}>{report.title}</Text>
          <Text style={s.tag}>
            Laporan Buyback Aset Bergerak — Yeobo Space Tlogosari
          </Text>
        </View>
        <View style={s.body}>
          <View style={s.summaryRow}>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Dihitung s/d</Text>
              <Text style={s.summaryValue}>{fmtDate(report.asOfDate)}</Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Nilai awal</Text>
              <Text style={s.summaryValue}>{rp(report.totalCostIdr)}</Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Nilai terdepresiasi</Text>
              <Text style={[s.summaryValue, { color: C.primary }]}>
                {rp(report.totalBookValueIdr)}
              </Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>% dari nilai awal</Text>
              <Text style={s.summaryValue}>
                {report.totalCostIdr > 0
                  ? `${((report.totalBookValueIdr / report.totalCostIdr) * 100).toFixed(2)}%`
                  : "—"}
              </Text>
            </View>
          </View>

          <Text style={s.policyLine}>
            Metode garis lurus · Nilai sisa {report.residualPct}% · Umur
            ekonomis — Elektronik {report.lifeMonths.elektronik} bln, Perabot{" "}
            {report.lifeMonths.perabot} bln, Aksesoris{" "}
            {report.lifeMonths.aksesoris} bln
          </Text>
          {report.note && <Text style={s.policyLine}>Catatan: {report.note}</Text>}
          {report.lines.some((l) => l.isOverridden) && (
            <Text style={s.policyLine}>
              * = nilai disesuaikan manual dari riset pasar (bukan formula
              garis lurus) — sumber tercantum di bawah nama aset terkait.
              Baris tanpa tanda tetap formula.
            </Text>
          )}

          {report.investorShares && report.investorShares.length > 0 && (
            <View style={s.invBox} wrap={false}>
              <Text style={s.invTitle}>Alokasi ke investor Tlogosari</Text>
              <Text style={s.invSub}>
                100% nilai terdepresiasi, dibagi proporsional porsi modal
                masing-masing — nama disamarkan
              </Text>
              <View style={s.invHeaderRow}>
                <Text style={[s.headerCell, s.colInvName]}>Investor</Text>
                <Text style={[s.headerCell, s.colInvPct]}>Porsi modal</Text>
                <Text style={[s.headerCell, s.colInvAmount]}>Nilai buyback</Text>
              </View>
              {report.investorShares.map((sh) => (
                <View style={s.invRow} key={sh.label}>
                  <Text style={[s.cell, s.colInvName]}>{sh.label}</Text>
                  <Text style={[s.cell, s.colInvPct]}>{sh.pct.toFixed(2)}%</Text>
                  <Text
                    style={[s.cell, s.colInvAmount, { color: C.primary, fontWeight: "bold" }]}
                  >
                    {rp(sh.amountIdr)}
                  </Text>
                </View>
              ))}
              <View style={s.invTotalRow}>
                <Text style={[s.cell, s.colInvName, { fontWeight: "bold" }]}>
                  Total
                </Text>
                <Text style={[s.cell, s.colInvPct, { fontWeight: "bold" }]}>
                  {report.investorShares.reduce((sum, x) => sum + x.pct, 0).toFixed(2)}%
                </Text>
                <Text
                  style={[s.cell, s.colInvAmount, { fontWeight: "bold", color: C.primary }]}
                >
                  {rp(report.investorShares.reduce((sum, x) => sum + x.amountIdr, 0))}
                </Text>
              </View>
            </View>
          )}

          {CATEGORY_ORDER.map((cat) => {
            const rows = report.lines.filter((l) => l.category === cat);
            if (rows.length === 0) return null;
            const subtotal = report.subtotals.find((sub) => sub.category === cat);
            return (
              <View key={cat}>
                <Text style={s.categoryTitle}>{CATEGORY_LABELS[cat]}</Text>
                <View style={s.headerRow}>
                  <Text style={[s.headerCell, s.colName]}>Nama</Text>
                  <Text style={[s.headerCell, s.colQty]}>Qty</Text>
                  <Text style={[s.headerCell, s.colCost]}>Nilai awal</Text>
                  <Text style={[s.headerCell, s.colDate]}>Tgl beli</Text>
                  <Text style={[s.headerCell, s.colMonths]}>Bln jalan</Text>
                  <Text style={[s.headerCell, s.colBv]}>Terdepresiasi</Text>
                </View>
                {rows.map((l) => (
                  <View style={s.dataRow} key={l.id} wrap={false}>
                    <View style={s.colName}>
                      <Text style={s.cell}>
                        {l.name}
                        {l.isOverridden && (
                          <Text style={{ color: C.amber, fontWeight: "bold" }}> *</Text>
                        )}
                      </Text>
                      {l.isOverridden && l.overrideSource && (
                        <Text style={s.overrideNote}>{l.overrideSource}</Text>
                      )}
                    </View>
                    <Text style={[s.cell, s.colQty]}>
                      {l.qty} {l.unit}
                    </Text>
                    <Text style={[s.cell, s.colCost]}>{rp(l.totalIdr)}</Text>
                    <Text style={[s.cell, s.colDate]}>{fmtDate(l.purchaseDate)}</Text>
                    <Text style={[s.cell, s.colMonths]}>{l.elapsedMonths}</Text>
                    <Text style={[s.cell, s.colBv, { color: C.primary, fontWeight: "bold" }]}>
                      {rp(l.bookValueIdr)}
                    </Text>
                  </View>
                ))}
                <View style={s.subtotalRow} wrap={false}>
                  <Text style={[s.cell, s.colName, { fontWeight: "bold" }]}>
                    Subtotal
                  </Text>
                  <Text style={[s.cell, s.colQty]} />
                  <Text style={[s.cell, s.colCost, { fontWeight: "bold" }]}>
                    {subtotal ? rp(subtotal.totalCostIdr) : "—"}
                  </Text>
                  <Text style={[s.cell, s.colDate]} />
                  <Text style={[s.cell, s.colMonths]} />
                  <Text
                    style={[s.cell, s.colBv, { fontWeight: "bold", color: C.primary }]}
                  >
                    {subtotal ? rp(subtotal.totalBookValueIdr) : "—"}
                  </Text>
                </View>
              </View>
            );
          })}

          <View style={s.grandTotal} wrap={false}>
            <Text style={s.grandLabel}>Total nilai terdepresiasi</Text>
            <Text style={s.grandValue}>{rp(report.totalBookValueIdr)}</Text>
          </View>

          <Text style={s.footer}>
            Laporan ini adalah nilai buku akuntansi (depresiasi garis lurus),
            bukan otomatis harga pasar wajar. Dibuat oleh sistem Zota Corp.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
