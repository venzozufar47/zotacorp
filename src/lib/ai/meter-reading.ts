/**
 * Membaca sisa token/kWh dari foto layar meteran listrik prabayar dengan Google Gemini
 * (free tier). Modul biasa (bukan "use server"): dipanggil dari server action.
 *
 * Env:
 *  - GEMINI_API_KEY (wajib; buat gratis di https://aistudio.google.com/apikey)
 *  - GEMINI_MODEL   (opsional; default di bawah — ganti bila model itu dipensiunkan)
 *
 * Hasilnya sengaja tiga keadaan, bukan benar/salah: "tak terbaca" dan "AI gagal" harus bisa
 * dibedakan dari "jelas di bawah batas", karena hanya yang terakhir boleh memblokir karyawan.
 */

const DEFAULT_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 20_000;

export type MeterReading =
  | { status: "ok"; kwh: number }
  | { status: "unreadable"; note: string }
  | { status: "error"; error: string };

const PROMPT = `Ini foto layar atau meteran listrik prabayar (token PLN).
Baca SISA token/saldo listrik dalam kWh yang tertampil di layar.
Jawab HANYA JSON: {"is_meter": boolean, "kwh": number atau null, "note": string singkat}.
Aturan:
- Pakai titik sebagai pemisah desimal (contoh layar "87,45" → 87.45).
- is_meter=false bila foto bukan layar/meteran listrik.
- kwh=null bila angka tidak jelas, terpotong, buram, atau ada beberapa angka yang membingungkan. Jangan menebak.
- Ambil angka SISA kWh, bukan nomor meter, tegangan, daya, atau tanggal.`;

interface GeminiBody {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

export async function readMeterKwh(bytes: ArrayBuffer, mime: string): Promise<MeterReading> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { status: "error", error: "GEMINI_API_KEY belum diatur" };
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mime, data: Buffer.from(bytes).toString("base64") } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              is_meter: { type: "BOOLEAN" },
              kwh: { type: "NUMBER", nullable: true },
              note: { type: "STRING" },
            },
            required: ["is_meter"],
          },
        },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as GeminiBody;
    if (!res.ok) return { status: "error", error: body.error?.message ?? `HTTP ${res.status}` };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { status: "error", error: "Jawaban AI kosong" };
    const parsed = JSON.parse(text) as { is_meter?: boolean; kwh?: number | null; note?: string };
    const kwh = typeof parsed.kwh === "number" && Number.isFinite(parsed.kwh) ? parsed.kwh : null;
    // Angka di luar rentang masuk akal (negatif / ribuan kWh di layar token) = salah baca.
    if (!parsed.is_meter || kwh == null || kwh < 0 || kwh > 100_000) {
      return { status: "unreadable", note: parsed.note?.slice(0, 200) ?? "" };
    }
    return { status: "ok", kwh };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "AI gagal" };
  } finally {
    clearTimeout(timer);
  }
}
