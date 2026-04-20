/**
 * PDF text extraction wrapper.
 *
 * Backed by `unpdf` — a Node/serverless-first wrapper around pdfjs-dist
 * that configures workers + font handling internally. Avoids the
 * brittle "fake worker" setup we had to do with raw pdfjs-dist v5.
 *
 * Exports two APIs consumed by the bank-specific parsers:
 *   - `extractPdfTextItems`  → positioned text items (x/y/page) when
 *                              a parser needs column alignment
 *   - `extractPdfPlainText`  → flat text per page joined with newlines
 *                              (what Mandiri + Jago parsers actually use)
 *
 * Both accept an optional password for encrypted rekening koran PDFs.
 * A wrong / missing password surfaces as the typed
 * `PdfPasswordRequiredError` so the API route can re-prompt cleanly.
 */

import { extractText, getDocumentProxy } from "unpdf";

export class PdfPasswordRequiredError extends Error {
  constructor(public readonly wrongPassword: boolean) {
    super(wrongPassword ? "Password PDF salah" : "PDF ini diproteksi password");
    this.name = "PdfPasswordRequiredError";
  }
}

export interface PdfTextItem {
  /** Text fragment exactly as rendered. */
  str: string;
  /** X coordinate of the item on the page (PDF user-space units). */
  x: number;
  /** Y coordinate (origin at bottom-left, PDF convention). */
  y: number;
  /** Page width in PDF units — useful for right-aligned column detection. */
  pageWidth: number;
  /** 1-indexed page number. */
  page: number;
}

type PdfJsDoc = Awaited<ReturnType<typeof getDocumentProxy>>;

async function openDoc(buffer: Uint8Array, password?: string): Promise<PdfJsDoc> {
  try {
    // unpdf forwards extra options into pdfjs `getDocument`. We pass
    // `password` plus font-related settings that keep serverless runs
    // predictable (no attempts to read system fonts, no eval).
    return await getDocumentProxy(buffer, {
      password: password ?? undefined,
      useSystemFonts: false,
      disableFontFace: true,
      isEvalSupported: false,
    } as Parameters<typeof getDocumentProxy>[1]);
  } catch (err) {
    const e = err as { name?: string; code?: number };
    if (e?.name === "PasswordException") {
      throw new PdfPasswordRequiredError(e.code === 2);
    }
    throw err;
  }
}

/**
 * Extract positioned text items from a PDF. Iteration order is page-by-
 * page; within a page items come in draw order (which for most PDFs is
 * top-down, left-right but isn't guaranteed — parsers must sort if they
 * care).
 */
export async function extractPdfTextItems(
  buffer: Uint8Array,
  password?: string
): Promise<PdfTextItem[]> {
  const doc = await openDoc(buffer, password);
  const out: PdfTextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const item of content.items as Array<{
      str: string;
      transform: number[];
    }>) {
      // transform = [scaleX, skewX, skewY, scaleY, translateX, translateY]
      out.push({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        pageWidth: viewport.width,
        page: p,
      });
    }
  }
  return out;
}

/**
 * Render a PDF to a flat plain-text string. We don't use unpdf's
 * `extractText` because it merges items on the same row with whatever
 * spacing the raw pdfjs stream emits — which for tabular layouts
 * scrambles columns (a date lands 400 chars away from the amount on
 * the same line). Instead we walk the positioned items ourselves and
 * group by Y coordinate so each visual row becomes one line. Pages
 * separated by a blank line.
 */
export async function extractPdfPlainText(
  buffer: Uint8Array,
  password?: string
): Promise<string> {
  const items = await extractPdfTextItems(buffer, password);
  if (items.length === 0) return "";

  const lines: string[] = [];
  let currentPage = 1;
  let currentY: number | null = null;
  let currentLine: string[] = [];

  const flushLine = () => {
    if (currentLine.length > 0) {
      lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
      currentLine = [];
    }
  };

  for (const item of items) {
    if (item.page !== currentPage) {
      flushLine();
      lines.push("");
      currentPage = item.page;
      currentY = null;
    }
    // Tolerance of ~2 PDF units handles baseline drift within a row.
    if (currentY === null || Math.abs(item.y - currentY) > 2) {
      flushLine();
      currentY = item.y;
    }
    if (item.str.trim()) currentLine.push(item.str);
  }
  flushLine();
  return lines.join("\n");
}

// Kept as an import-stability shim for any future caller that wants the
// raw unpdf behavior. Not used internally anymore.
export { extractText as _extractTextRaw };
