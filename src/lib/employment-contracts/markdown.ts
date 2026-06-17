/**
 * Mini-parser markdown khusus badan kontrak. Subset yang dipakai template:
 * heading (#, ##, ###), paragraf, list ber-marker `(N)` / `- ` / `N.` / `N)`,
 * inline `**bold**`, dan horizontal rule `---`. Output `Block[]` netral yang
 * dirender SAMA oleh preview layar (→ HTML) dan PDF (→ @react-pdf) supaya
 * tampilan konsisten.
 *
 * Tidak mendukung tabel / gambar — blok tanda tangan & Lampiran dirender
 * terstruktur oleh komponen, bukan dari markdown bebas.
 */

import { interpolate } from "@/lib/whatsapp/templates";
import type { ContractFields } from "./types";

export interface InlineSpan {
  text: string;
  bold: boolean;
}

export type ContractBlock =
  | { kind: "h1"; spans: InlineSpan[] }
  | { kind: "h2"; spans: InlineSpan[] }
  | { kind: "h3"; spans: InlineSpan[] }
  | { kind: "p"; spans: InlineSpan[] }
  | { kind: "li"; marker: string; spans: InlineSpan[] }
  | { kind: "hr" };

/** Parse `**bold**` → spans. Teks di luar `**` = normal. */
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const parts = text.split("**");
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length === 0) continue;
    spans.push({ text: parts[i], bold: i % 2 === 1 });
  }
  return spans.length > 0 ? spans : [{ text: "", bold: false }];
}

const LIST_RE = /^(\(\d+\)|\d+[.)]|[-*])\s+(.*)$/;

export function parseContractMarkdown(md: string): ContractBlock[] {
  const blocks: ContractBlock[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (t.length === 0) continue;
    // Buang baris catatan/blockquote + tabel (blok TTD dirender terpisah).
    if (t.startsWith(">") || t.startsWith("|")) continue;
    if (t.startsWith("<")) continue; // <br> dsb.
    if (/^-{3,}$/.test(t)) {
      blocks.push({ kind: "hr" });
      continue;
    }
    if (t.startsWith("### ")) {
      blocks.push({ kind: "h3", spans: parseInline(t.slice(4)) });
      continue;
    }
    if (t.startsWith("## ")) {
      blocks.push({ kind: "h2", spans: parseInline(t.slice(3)) });
      continue;
    }
    if (t.startsWith("# ")) {
      blocks.push({ kind: "h1", spans: parseInline(t.slice(2)) });
      continue;
    }
    const m = LIST_RE.exec(t);
    if (m) {
      const marker = m[1] === "-" || m[1] === "*" ? "•" : m[1];
      blocks.push({ kind: "li", marker, spans: parseInline(m[2]) });
      continue;
    }
    blocks.push({ kind: "p", spans: parseInline(t) });
  }
  return blocks;
}

/** Isi placeholder `{token}` lalu parse → blocks. */
export function fillAndParse(
  bodyMarkdown: string,
  fields: ContractFields
): ContractBlock[] {
  const filled = interpolate(bodyMarkdown, fields as Record<string, string>);
  return parseContractMarkdown(filled);
}

/** Gabungkan spans jadi plain string (untuk preview sederhana / alt). */
export function spansToText(spans: InlineSpan[]): string {
  return spans.map((s) => s.text).join("");
}
