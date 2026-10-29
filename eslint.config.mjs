import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Aturan tema (docs/THEMING.md): komponen memakai token (bg-primary, text-foreground, …), bukan warna literal.
// Peringatan, bukan error: masih ada literal lama yang belum dirapikan (lihat "Penyimpangan yang diketahui").
const HEX = String.raw`#[0-9a-fA-F]{6}\b`;
const noHexColor = [
  "warn",
  {
    selector: `Literal[value=/${HEX}/]`,
    message: "Jangan menulis warna heksadesimal di komponen; pakai token tema (lihat docs/THEMING.md).",
  },
  {
    selector: `TemplateElement[value.raw=/${HEX}/]`,
    message: "Jangan menulis warna heksadesimal di komponen; pakai token tema (lihat docs/THEMING.md).",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": noHexColor },
  },
  {
    // Pengecualian sah: konteks yang tidak bisa membaca variabel CSS (PDF, email), desain slip gaji yang sengaja
    // tetap sama di semua tema, dan grafik yang butuh nilai literal.
    files: [
      "src/lib/email/**",
      "src/components/payslip/**",
      "src/lib/payslip/**",
      "src/**/*PdfDocument.tsx",
      "src/components/investor/InvestorCharts.tsx",
      "src/**/*.test.{ts,tsx}",
    ],
    rules: { "no-restricted-syntax": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
