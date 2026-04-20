/**
 * Bank Jago rekening koran parser — Gemini 2.0 Flash vision variant.
 *
 * We hand the raw PDF to Gemini with a strict JSON schema and let the
 * model do the table-reading that our column-clustering parser kept
 * getting wrong on edge cases ("Date & Time" header splits, multi-line
 * rows, unlabeled columns). Two safety nets keep hallucinations out of
 * the DB:
 *
 *   1. zod validation of the JSON shape.
 *   2. End-to-end balance check: opening + Σcredit − Σdebit === closing.
 *      Any drift and we throw, and the caller falls back to the
 *      deterministic parser.
 *
 * Deterministic? No. But the balance invariant makes "wrong numbers"
 * detectable, and the column boundaries are no longer a moving target.
 */
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import type { ParsedStatement, ParsedTransaction } from "../types";
import type { ReferenceExample } from "../categorize";
import { verifyBalance } from "./shared";
import { sortChronologicalDesc } from "../chronological";

const MODEL = "gemini-2.5-pro";

const PROMPT = `You are parsing a Bank Jago rekening koran (Indonesian bank statement) PDF.
Extract EVERY transaction into the JSON schema provided.

Rules:
- Ignore all "ID# XXXXXXXX" tokens — they are internal refs, not data.
- \`sourceDestination\`: counterparty bank + account number (e.g. "Mandiri 1350019865748", "GoPay", "Main Pocket").
- \`transactionDetails\`: transaction type label (e.g. "Outgoing Transfer", "Outgoing Transfer Fee", "Digital Product Payment", "Payment with Jago Pay", "Main Pocket Movement", "Deposit from GoPay", "Movement between Pockets").
- \`notes\`: free-text user memo (e.g. "Pindah dana qris haengbo"). Empty string if none.
- \`debit\`: money out (positive, else 0). \`credit\`: money in (positive, else 0). Never both non-zero.
- \`runningBalance\`: balance AFTER this transaction (always required).
- \`date\`: YYYY-MM-DD. \`time\`: HH:mm or null.
- Amounts in IDR integer rupiah (strip "Rp", dots, commas).
- \`openingBalance\`: balance BEFORE first tx. \`closingBalance\`: balance AFTER last tx.
- \`periodMonth\`: 1-12. \`periodYear\`: 4-digit year.

Ordering (CRITICAL — a bank statement is impossible to be out of order):
- Output transactions in the EXACT top-to-bottom reading order of the PDF.
- Jago prints NEWEST first at the top of each page. So the first transaction in your output array is the newest transaction on the statement, and the last is the oldest.
- Within a single calendar day, times must be strictly non-increasing from top to bottom (e.g. 22:29 before 16:59 before 10:50). If you see an out-of-order sequence, you misread a time — double-check.
- \`runningBalance\` moves row-by-row in the same direction as the printed column. Use it as a sanity check: consecutive rows' balances differ by exactly the row's signed amount.

SELF-VERIFICATION BEFORE RESPONDING (mandatory):
1. Confirm openingBalance + sum(credit) - sum(debit) === closingBalance EXACTLY. Even a 1 rupiah difference means you misread a number — recheck.
2. Confirm every consecutive pair follows: row[i].runningBalance === row[i-1].runningBalance + row[i].credit - row[i].debit. (Remember Jago prints newest-first, so row[i-1] here means the row BELOW row[i] in the array — the earlier transaction.)
3. If any check fails, re-read the offending row(s) and correct BEFORE emitting JSON. Do not emit JSON that fails these invariants.
4. If you cannot reconcile, still emit your best-effort JSON — the server will surface the mismatch for a retry.`;

// JSON schema Gemini will conform its output to. Kept in-sync with the
// zod schema below — zod is our runtime guarantee; this is Gemini's
// generation hint.
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    openingBalance: { type: Type.NUMBER },
    closingBalance: { type: Type.NUMBER },
    periodMonth: { type: Type.INTEGER },
    periodYear: { type: Type.INTEGER },
    transactions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING },
          time: { type: Type.STRING, nullable: true },
          sourceDestination: { type: Type.STRING },
          transactionDetails: { type: Type.STRING },
          notes: { type: Type.STRING },
          debit: { type: Type.NUMBER },
          credit: { type: Type.NUMBER },
          runningBalance: { type: Type.NUMBER },
        },
        required: [
          "date",
          "sourceDestination",
          "transactionDetails",
          "notes",
          "debit",
          "credit",
          "runningBalance",
        ],
      },
    },
  },
  required: [
    "openingBalance",
    "closingBalance",
    "periodMonth",
    "periodYear",
    "transactions",
  ],
} as const;

const GeminiTransaction = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/)
    .nullable()
    .optional(),
  sourceDestination: z.string(),
  transactionDetails: z.string(),
  notes: z.string(),
  debit: z.number().finite().nonnegative(),
  credit: z.number().finite().nonnegative(),
  runningBalance: z.number().finite(),
});

const GeminiResponse = z.object({
  openingBalance: z.number().finite(),
  closingBalance: z.number().finite(),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(1900).max(2999),
  transactions: z.array(GeminiTransaction),
});

/**
 * Parse a Jago PDF via Gemini. Throws if:
 *   - `GOOGLE_GENAI_API_KEY` not set ("gemini not configured")
 *   - API call fails
 *   - Response JSON is malformed / schema-invalid
 *   - Zero transactions returned
 *   - Balance invariant fails
 *
 * Configuration-level errors (missing key, encrypted PDF) bubble up
 * to the caller which falls back to the deterministic parser for
 * onboarding. Runtime errors (balance mismatch, malformed JSON) are
 * retried up to MAX_ATTEMPTS times with feedback before throwing —
 * the caller then surfaces the error to the admin instead of silently
 * degrading to the label-based parser.
 */
const MAX_ATTEMPTS = 3;

export async function parseJagoViaGemini(
  buffer: Uint8Array,
  password?: string,
  referenceExamples?: ReferenceExample[]
): Promise<ParsedStatement> {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error("gemini not configured");
  if (password) {
    throw new Error(
      "encrypted PDF not supported by gemini path; falling back"
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const base64 = Buffer.from(buffer).toString("base64");
  const referenceBlock = formatReferenceBlock(referenceExamples);

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await geminiAttempt(
        ai,
        base64,
        attempt,
        lastErr,
        referenceBlock
      );
      // Tag the warning with attempt count so admins can see if a
      // retry was needed — useful signal for prompt tuning later.
      if (attempt > 1) {
        result.warnings = [
          `parsed via gemini (attempt ${attempt}/${MAX_ATTEMPTS} — first attempt failed with: ${lastErr?.message ?? "unknown"})`,
          ...result.warnings.filter((w) => w !== "parsed via gemini"),
        ];
      }
      return result;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      // Don't burn retries on bugs that won't improve on retry:
      // unconfigured, schema violations from our own code, etc.
      // Only retry on model-output issues — those are stochastic.
      if (
        lastErr.message === "gemini not configured" ||
        lastErr.message.startsWith("encrypted PDF")
      ) {
        throw lastErr;
      }
    }
  }
  throw new Error(
    `gemini failed after ${MAX_ATTEMPTS} attempts. Last error: ${lastErr?.message ?? "unknown"}. Coba upload ulang — Gemini kadang butuh beberapa iterasi untuk PDF yang padat.`
  );
}

async function geminiAttempt(
  ai: GoogleGenAI,
  base64: string,
  attempt: number,
  previousError: Error | null,
  referenceBlock: string
): Promise<ParsedStatement> {
  // On retries, feed the previous error back to the model so it knows
  // what to fix. Gemini responds well to "you said X, but X was wrong
  // — try again" framing.
  const retryFeedback =
    attempt > 1 && previousError
      ? `\n\nATTEMPT ${attempt} of ${MAX_ATTEMPTS}. Your previous attempt failed with: "${previousError.message}". Re-read the PDF carefully and fix the error this time. Pay extra attention to the self-verification checks at the bottom of the instructions.`
      : "";

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "application/pdf", data: base64 } },
          {
            // Reference block (~30 historical rows) only on first
            // attempt — it's ~2k tokens that Gemini doesn't need
            // re-read on retries. Retries get the error feedback
            // instead.
            text: PROMPT + (attempt === 1 ? referenceBlock : "") + retryFeedback,
          },
        ],
      },
    ],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      // Our literal is narrower than the SDK's Schema union; identical
      // at runtime. Cast through unknown to satisfy the compiler.
      responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      // 2.5 Pro requires thinking (can't disable). Dynamic budget
      // (-1) lets the model decide; thinking tokens are metered
      // separately from maxOutputTokens so they don't eat the answer
      // budget.
      thinkingConfig: { thinkingBudget: -1 },
      // Set to the model's hard ceiling. Each transaction ~120 output
      // tokens, so 65K supports ~500 transactions in one call — enough
      // for ~5 months at 191/2mo. A full year (~1150 tx ≈ 137K tokens)
      // would not fit any single-call strategy and would need to be
      // split across multiple uploads by the admin.
      maxOutputTokens: 65536,
    },
  });

  const text = response.text;
  if (!text) throw new Error("gemini returned empty response");

  // Flag truncation explicitly — "MAX_TOKENS" finish reason means
  // maxOutputTokens hit, so JSON will be cut mid-array.
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== "STOP") {
    throw new Error(
      `gemini stopped with reason ${finishReason} (output may be truncated)`
    );
  }

  // Be defensive: strip ```json fences / stray preamble before JSON.parse.
  const cleaned = stripJsonFences(text);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `gemini returned non-JSON response: ${text.slice(0, 200)}`
    );
  }

  const parsed = GeminiResponse.parse(parsedJson);

  if (parsed.transactions.length === 0) {
    throw new Error("gemini returned zero transactions");
  }

  // Normalise to our ParsedTransaction shape. `description` is kept as
  // a concat for backward compat with rows ingested before the
  // structured columns existed.
  const transactions: ParsedTransaction[] = parsed.transactions.map((t) => {
    const sourceDestination = t.sourceDestination.trim() || undefined;
    const transactionDetails = t.transactionDetails.trim() || undefined;
    const notes = t.notes.trim() || undefined;
    const description =
      [sourceDestination, transactionDetails, notes]
        .filter(Boolean)
        .join(" · ") || "Transaksi";
    return {
      date: t.date,
      time: t.time ?? undefined,
      sourceDestination,
      transactionDetails,
      notes,
      description,
      debit: Math.max(0, Math.round(t.debit)),
      credit: Math.max(0, Math.round(t.credit)),
      runningBalance: Math.round(t.runningBalance),
    };
  });

  // Balance sanity check. Use the model's reported opening/closing to
  // verify its own arithmetic — a pass here means the model read ALL
  // rows correctly (missing or duplicated rows would break the sum).
  // Order-independent: sum is commutative, so the check runs before
  // we re-sort.
  const v = verifyBalance(
    Math.round(parsed.openingBalance),
    Math.round(parsed.closingBalance),
    transactions
  );
  if (!v.match) {
    throw new Error(
      `gemini balance mismatch: opening + credit − debit = ${v.computed}, closing = ${Math.round(parsed.closingBalance)}, diff = ${v.diff}`
    );
  }

  // Re-sort defensively: newest-first. For rows tied on (date, time)
  // — e.g. a pocket transfer + its counterpart debit at the exact
  // same minute — the shared helper reads the runningBalance chain
  // to determine true order. Gemini sometimes gets the intra-minute
  // order wrong; this locks it down deterministically.
  const sortedTxs = sortChronologicalDesc(transactions);

  return {
    periodMonth: parsed.periodMonth,
    periodYear: parsed.periodYear,
    openingBalance: Math.round(parsed.openingBalance),
    closingBalance: Math.round(parsed.closingBalance),
    transactions: sortedTxs,
    warnings: ["parsed via gemini"],
  };
}

/**
 * Strip ```json ... ``` / ``` ... ``` fences and any text outside the
 * first top-level `{...}` or `[...]`. Handles cases where Gemini
 * ignores responseMimeType and wraps output in markdown.
 */
/**
 * Render a diverse sample of already-correct rows as a JSON block the
 * model can use to mimic formatting conventions (counterparty naming,
 * transaction-details labels, notes style). Empty string when no
 * examples (first upload on a fresh account).
 */
function formatReferenceBlock(examples?: ReferenceExample[]): string {
  if (!examples || examples.length === 0) return "";
  const trimmed = examples.slice(0, 30).map((e) => ({
    date: e.date,
    time: e.time,
    sourceDestination: e.sourceDestination,
    transactionDetails: e.transactionDetails,
    notes: e.notes,
    debit: e.debit,
    credit: e.credit,
  }));
  return `\n\nREFERENCE EXAMPLES (already-correct rows from this same rekening's history — use them as a style/format guide so your output matches):
\`\`\`json
${JSON.stringify(trimmed, null, 2)}
\`\`\`
Match this formatting style for fields like \`sourceDestination\` (counterparty + bank + account number), \`transactionDetails\` (Jago's own label wording), and \`notes\` (admin's free-text memos). If the PDF uses a new label not in the examples, still extract it accurately — but align the overall style when there's ambiguity.`;
}

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  // ```json ... ``` or ``` ... ```
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fence) s = fence[1].trim();
  // Last-resort: find the first { and last } (balanced enough for JSON.parse to try).
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace > 0 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }
  return s;
}
