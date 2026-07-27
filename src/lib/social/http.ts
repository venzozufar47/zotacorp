import "server-only";

/**
 * Pemanggil HTTP bersama untuk adapter social.
 *
 * Repo ini belum punya helper HTTP bersama maupun retry di mana pun — tiap
 * integrasi memanggil fetch sendiri. Fitur ini yang pertama benar-benar
 * membutuhkannya: ada rate limit berkuota, token yang bisa kedaluwarsa di
 * tengah jalan, dan pihak ketiga yang sesekali 5xx. Jadi dibuat SATU saja,
 * mengikuti bentuk paling ketat yang sudah ada di repo:
 * src/lib/attendance/stock-opname-gate.ts.
 *
 * `import "server-only"` di baris pertama bukan hiasan: mengimpor modul ini
 * (atau apa pun yang memakainya) dari komponen klien akan menggagalkan BUILD,
 * bukan bocor diam-diam saat runtime.
 */

/** Alasan gagal — sengaja union sempit supaya pemanggil bisa memutuskan, dan
 *  nilainya ditulis apa adanya ke social_sync_runs.error_reason. */
export type FailReason =
  | "not_configured"
  | "unauthorized"
  | "token_expired"
  | "rate_limited"
  | "not_found"
  | "unsupported"
  | "bad_request"
  | "http_error"
  | "timeout"
  | "network"
  | "parse";

/**
 * apiCalls ada di KEDUA cabang, dan itu disengaja: Meta tetap memotong kuota
 * 200/jam untuk panggilan yang berakhir error. Kalau hanya cabang sukses yang
 * menghitung, buku kas rate limit akan terlalu optimistis dan kita akan kena
 * blokir persis saat sedang banyak error.
 */
export type HttpResult<T> =
  | { ok: true; data: T; status: number; apiCalls: number }
  | {
      ok: false;
      reason: FailReason;
      status?: number;
      detail?: string;
      retryAfterMs?: number;
      apiCalls: number;
    };

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 400;

/** Kunci yang tidak boleh pernah muncul di log atau kolom error_detail. */
const SECRET_KEYS = [
  "access_token",
  "refresh_token",
  "client_secret",
  "code",
  "authorization",
  "token",
];

/**
 * Buang materi rahasia dari teks sebelum di-log atau disimpan.
 *
 * Wajib karena sebagian API memantulkan token di body error, sedangkan
 * social_sync_runs.error_detail terbaca admin — tanpa ini sebuah error 400
 * bisa menaruh token OAuth ke tabel yang jauh lebih longgar daripada tempat
 * token seharusnya tinggal.
 */
export function redact(input: unknown): string {
  let text = typeof input === "string" ? input : safeStringify(input);
  for (const key of SECRET_KEYS) {
    // "access_token":"xxx"  |  access_token=xxx  |  Bearer xxx
    text = text.replace(
      new RegExp(`("?${key}"?\\s*[:=]\\s*"?)([^",&\\s}]+)`, "gi"),
      "$1[REDACTED]"
    );
  }
  return text.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]");
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

/** Hanya kegagalan sementara yang layak diulang. 4xx tidak pernah — mengulang
 *  permintaan yang memang salah cuma membakar kuota dua kali. */
function isRetryable(reason: FailReason): boolean {
  return (
    reason === "timeout" ||
    reason === "network" ||
    reason === "http_error" ||
    reason === "rate_limited"
  );
}

function backoffMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs != null) return Math.min(retryAfterMs, 15_000);
  const base = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  return base + Math.floor(Math.random() * base); // jitter: hindari badai serempak
}

function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return secs * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

function classify(status: number): FailReason {
  if (status === 401) return "unauthorized";
  if (status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "http_error";
  return "bad_request";
}

export interface SocialFetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Matikan retry untuk operasi yang tidak idempoten (mis. tukar OAuth code,
   *  yang hanya sah sekali pakai). */
  retry?: boolean;
}

/**
 * Satu panggilan JSON dengan timeout, retry terukur, dan hasil bertipe.
 * Tidak pernah melempar — pemanggilnya adalah cron yang harus tetap hidup.
 */
export async function socialFetchJson<T>(
  url: string,
  opts: SocialFetchOptions = {}
): Promise<HttpResult<T>> {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retry = true,
  } = opts;
  const maxAttempts = retry ? MAX_ATTEMPTS : 1;
  let calls = 0;
  let last: HttpResult<T> | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    calls++;
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: controller.signal,
      });

      if (!res.ok) {
        const reason = classify(res.status);
        const detail = redact((await res.text().catch(() => "")).slice(0, 500));
        last = {
          ok: false,
          reason,
          status: res.status,
          detail,
          retryAfterMs: parseRetryAfter(res),
          apiCalls: calls,
        };
        if (!isRetryable(reason) || attempt === maxAttempts) return last;
        await sleep(backoffMs(attempt, last.retryAfterMs));
        continue;
      }

      const json = (await res.json().catch(() => null)) as T | null;
      if (json === null) {
        return { ok: false, reason: "parse", status: res.status, apiCalls: calls };
      }
      return { ok: true, data: json, status: res.status, apiCalls: calls };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      const reason: FailReason = aborted ? "timeout" : "network";
      last = { ok: false, reason, detail: redact(String(err)), apiCalls: calls };
      if (attempt === maxAttempts) return last;
      await sleep(backoffMs(attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  return last ?? { ok: false, reason: "network", apiCalls: calls };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
