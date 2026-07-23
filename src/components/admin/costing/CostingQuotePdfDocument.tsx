/* PDF "Kutipan Harga" per produk (react-pdf). Untuk order custom: HPP
 * breakdown + harga jual rekomendasi. Indonesian-only, A4. */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { CostingProductWithHpp } from "@/lib/actions/costing.actions";

const C = {
  primary: "#117a8c",
  fg: "#1d1d1f",
  mutedFg: "#6e6e73",
  border: "#d2d2d7",
  accent: "#eef7f9",
};

const rp = (n: number) =>
  "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n));
const pct = (f: number) =>
  (f * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%";

const s = StyleSheet.create({
  page: { padding: 0, fontSize: 10, color: C.fg, fontFamily: "Helvetica" },
  band: {
    backgroundColor: C.primary,
    color: "#fff",
    paddingHorizontal: 32,
    paddingVertical: 18,
  },
  brand: { fontSize: 18, fontWeight: "bold", letterSpacing: 2 },
  tag: { fontSize: 9, marginTop: 3, opacity: 0.85, textTransform: "uppercase" },
  body: { paddingHorizontal: 32, paddingTop: 20 },
  h1: { fontSize: 15, fontWeight: "bold", marginBottom: 2 },
  sub: { fontSize: 9, color: C.mutedFg, marginBottom: 14 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  rowB: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 2,
  },
  label: { color: C.mutedFg },
  strong: { fontWeight: "bold" },
  sectionTitle: {
    fontSize: 8,
    color: C.mutedFg,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 14,
    marginBottom: 4,
  },
  priceBox: {
    backgroundColor: C.accent,
    borderRadius: 6,
    padding: 12,
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceVal: { fontSize: 20, fontWeight: "bold", color: C.primary },
  footer: {
    marginTop: 24,
    fontSize: 8,
    color: C.mutedFg,
    textAlign: "center",
  },
});

export function CostingQuotePdfDocument({
  brand,
  row,
  date,
}: {
  brand: string;
  row: CostingProductWithHpp;
  date: string;
}) {
  const b = row.breakdown;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.brand}>{brand}</Text>
          <Text style={s.tag}>Kutipan Harga</Text>
        </View>
        <View style={s.body}>
          <Text style={s.h1}>{row.product.name}</Text>
          <Text style={s.sub}>
            {row.product.category ? `${row.product.category} · ` : ""}
            Yield {row.product.yield_qty}
            {row.product.yield_unit ? ` ${row.product.yield_unit}` : ""} · {date}
          </Text>

          <Text style={s.sectionTitle}>Rincian bahan</Text>
          {b.components.map((c, i) => (
            <View style={s.row} key={i}>
              <Text style={s.label}>
                {c.name ?? "(bahan)"} × {c.qty}
              </Text>
              <Text>{rp(c.cost)}</Text>
            </View>
          ))}

          <Text style={s.sectionTitle}>Biaya</Text>
          <View style={s.row}>
            <Text style={s.label}>Total bahan</Text>
            <Text>{rp(b.totalMaterial)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Kemasan</Text>
            <Text>{rp(b.packaging)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Tenaga kerja</Text>
            <Text>{rp(b.labor)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Overhead</Text>
            <Text>{rp(b.overhead)}</Text>
          </View>
          <View style={s.rowB}>
            <Text style={s.strong}>HPP per batch</Text>
            <Text style={s.strong}>{rp(b.hppBatch)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.strong}>HPP per unit</Text>
            <Text style={s.strong}>{rp(b.hppUnit)}</Text>
          </View>

          <View style={s.priceBox}>
            <View>
              <Text style={s.label}>Harga jual rekomendasi</Text>
              {b.marginPercent != null && (
                <Text style={{ fontSize: 8, color: C.mutedFg, marginTop: 2 }}>
                  Margin {pct(b.marginPercent)}
                </Text>
              )}
            </View>
            <Text style={s.priceVal}>
              {b.finalPrice != null ? rp(b.finalPrice) : "—"}
            </Text>
          </View>

          <Text style={s.footer}>
            Kutipan ini indikatif berbasis harga bahan terkini. Dibuat oleh
            sistem Zota Corp.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
