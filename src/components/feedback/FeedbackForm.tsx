"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitCustomerFeedback } from "@/lib/actions/feedback.actions";
import {
  ASPECT_ALL_GOOD,
  COMMENT_MAX,
  FEEDBACK_ASPECTS,
  RATING_LABELS,
  VISIT_OPTIONS,
  WISH_MAX,
  type FeedbackAspectKey,
  type VisitType,
} from "@/lib/feedback/constants";


const DEVICE_KEY = "zota_fb_device";

function loadDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

type Errors = { visit?: string; rating?: string; aspects?: string; form?: string };

function Card({ children, invalid }: { children: React.ReactNode; invalid?: boolean }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border bg-card p-4 shadow-sm transition-colors motion-reduce:transition-none",
        invalid ? "border-destructive" : "border-border"
      )}
    >
      {children}
    </div>
  );
}

function Legend({ children, hint, required }: { children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <legend className="mb-3 block w-full p-0">
      <span className="block text-[15px] font-semibold leading-snug">
        {children}
        {required && (
          <span aria-hidden className="ml-0.5 text-destructive">
            *
          </span>
        )}
      </span>
      {hint && <span className="mt-0.5 block text-[13px] text-muted-foreground">{hint}</span>}
    </legend>
  );
}

function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} role="alert" className="mt-2 text-[13px] font-medium text-destructive">
      {text}
    </p>
  );
}

/**
 * Formulir feedback pelanggan (publik, mobile-first). Tiga pertanyaan inti ditambah satu pilihan jenis kunjungan di atas.
 * Aksesibilitas: label tampil, target sentuh ≥ 44px, status terpilih tidak hanya lewat warna (ikon centang / teks bintang),
 * galat muncul di dekat kolomnya dan fokus pindah ke kolom bermasalah pertama, animasi menghormati reduced-motion.
 */
export function FeedbackForm({ slug, brand }: { slug: string; brand: string }) {
  const [visit, setVisit] = useState<VisitType | null>(null);
  const [rating, setRating] = useState(0);
  const [aspects, setAspects] = useState<FeedbackAspectKey[]>([]);
  const [comment, setComment] = useState("");
  const [wish, setWish] = useState("");
  const [website, setWebsite] = useState(""); // kolom jebakan bot
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { rating: number }>(null);
  const deviceId = useRef("");
  const visitRef = useRef<HTMLFieldSetElement>(null);
  const ratingRef = useRef<HTMLFieldSetElement>(null);
  const aspectsRef = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    deviceId.current = loadDeviceId();
  }, []);

  const toggleAspect = (key: FeedbackAspectKey) => {
    setErrors((e) => ({ ...e, aspects: undefined }));
    setAspects((cur) => {
      if (key === ASPECT_ALL_GOOD) return cur.includes(key) ? [] : [key];
      const without = cur.filter((k) => k !== ASPECT_ALL_GOOD);
      return without.includes(key) ? without.filter((k) => k !== key) : [...without, key];
    });
  };

  const onRatingKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setRating((r) => Math.min(5, r + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setRating((r) => Math.max(1, r - 1));
    }
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: Errors = {};
    if (!visit) next.visit = "Pilih salah satu ya, kak.";
    if (rating === 0) next.rating = "Pilih jumlah bintang dulu ya, kak.";
    if (aspects.length === 0 && comment.trim() === "") next.aspects = "Pilih satu atau lebih, atau tulis sendiri ya, kak.";
    setErrors(next);
    const first = next.visit ? visitRef : next.rating ? ratingRef : next.aspects ? aspectsRef : null;
    if (first) {
      first.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      first.current?.querySelector<HTMLElement>("button, textarea")?.focus({ preventScroll: true });
      return;
    }
    setBusy(true);
    try {
      const r = await submitCustomerFeedback({
        slug,
        visitType: visit,
        rating,
        aspects,
        comment,
        productWish: wish,
        deviceId: deviceId.current,
        website,
      });
      if (!r.ok) {
        setErrors({ form: r.error });
        return;
      }
      setDone({ rating });
      window.scrollTo({ top: 0 });
    } catch {
      setErrors({ form: "Koneksi bermasalah. Coba kirim lagi ya, kak." });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="animate-fade-up flex flex-col items-center">
          <span className="flex size-20 items-center justify-center rounded-full bg-accent text-primary" aria-hidden>
            <CheckCircle2 size={44} strokeWidth={1.75} />
          </span>
          <h1 className="mt-5 font-display text-2xl font-bold">Terima kasih, kak!</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            {done.rating >= 4
              ? `Senang sekali kakak puas. Masukan kakak sangat berarti untuk ${brand}.`
              : `Maaf kalau belum maksimal. Masukan kakak kami baca dan jadikan bahan berbenah di ${brand}.`}
          </p>
          <p className="mt-6 text-sm font-semibold text-primary">Sampai jumpa lagi!</p>
        </div>
      </main>
    );
  }

  const ratingLabel = RATING_LABELS[rating] || "Ketuk bintang untuk menilai";

  return (
    <main className="mx-auto max-w-md px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6">
      <header className="mb-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">Saran & Masukan</p>
        <h1 className="mt-1 font-display text-[26px] font-bold leading-tight">{brand}</h1>
      </header>

      <form id="feedback-form" onSubmit={submit} noValidate className="space-y-3">
        <Card invalid={!!errors.visit}>
          <fieldset ref={visitRef} className="min-w-0">
            <Legend required>Kunjungan kakak</Legend>
            <div role="radiogroup" aria-label="Kunjungan kakak" aria-describedby={errors.visit ? "err-visit" : undefined} className="grid grid-cols-2 gap-2">
              {VISIT_OPTIONS.map((o) => {
                const on = visit === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setVisit(o.value);
                      setErrors((e) => ({ ...e, visit: undefined }));
                    }}
                    className={cn(
                      "flex min-h-14 items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-center text-[14px] font-medium leading-snug transition active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                    )}
                  >
                    {on && <Check size={16} aria-hidden className="shrink-0" />}
                    {o.label}
                  </button>
                );
              })}
            </div>
            <FieldError id="err-visit" text={errors.visit} />
          </fieldset>
        </Card>

        <Card invalid={!!errors.rating}>
          <fieldset ref={ratingRef} className="min-w-0">
            <Legend required>Seberapa puas kakak dengan produk dan kunjungan di {brand}?</Legend>
            <div
              role="radiogroup"
              aria-label="Penilaian bintang"
              aria-describedby={errors.rating ? "err-rating" : undefined}
              onKeyDown={onRatingKey}
              className="flex justify-between gap-1"
            >
              {[1, 2, 3, 4, 5].map((n) => {
                const on = n <= rating;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} bintang, ${RATING_LABELS[n]}`}
                    tabIndex={rating === n || (rating === 0 && n === 1) ? 0 : -1}
                    onClick={() => {
                      setRating(n);
                      setErrors((e) => ({ ...e, rating: undefined }));
                    }}
                    className="flex h-14 flex-1 items-center justify-center rounded-xl transition active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Star
                      size={38}
                      strokeWidth={1.5}
                      aria-hidden
                      className={cn("transition-colors motion-reduce:transition-none", on ? "fill-warning text-warning" : "fill-transparent text-muted-foreground/50")}
                    />
                  </button>
                );
              })}
            </div>
            <p aria-live="polite" className={cn("mt-1 text-center text-[14px] font-semibold", rating ? "text-foreground" : "text-muted-foreground")}>
              {ratingLabel}
            </p>
            <FieldError id="err-rating" text={errors.rating} />
          </fieldset>
        </Card>

        <Card invalid={!!errors.aspects}>
          <fieldset ref={aspectsRef} className="min-w-0">
            <Legend required hint="Pilih yang sesuai, boleh lebih dari satu.">
              Apakah kakak ada masukan untuk kami?
            </Legend>
            <div role="group" aria-label="Masukan cepat" aria-describedby={errors.aspects ? "err-aspects" : undefined} className="flex flex-wrap gap-1.5">
              {FEEDBACK_ASPECTS.map((a) => {
                const on = aspects.includes(a.key);
                return (
                  <button
                    key={a.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleAspect(a.key)}
                    className={cn(
                      "inline-flex min-h-9 grow items-center justify-center rounded-full border px-2.5 text-[13.5px] font-medium transition active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      on ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/30" : "border-border bg-background"
                    )}
                  >
                    {a.label}
                  </button>
                );
              })}
              {/* Pengisi baris terakhir: tombol di baris lain melebar rata kanan-kiri (seperti teks rata kanan-kiri), tetapi
                  baris terakhir tidak ikut melebar berlebihan. */}
              <span aria-hidden className="grow-[999] basis-0" />
            </div>
            <label htmlFor="fb-comment" className="mb-1 mt-4 block text-[13px] font-medium text-muted-foreground">
              Ada yang ingin kakak tambahkan?
            </label>
            <textarea
              id="fb-comment"
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setErrors((er) => ({ ...er, aspects: undefined }));
              }}
              maxLength={COMMENT_MAX}
              rows={2}
              className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-base leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <FieldError id="err-aspects" text={errors.aspects} />
          </fieldset>
        </Card>

        <Card>
          <label htmlFor="fb-wish" className="block text-[15px] font-semibold leading-snug">
            Produk baru apa yang kakak ingin kami sediakan?
            <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">(opsional)</span>
          </label>
          <input
            id="fb-wish"
            type="text"
            value={wish}
            onChange={(e) => setWish(e.target.value)}
            maxLength={WISH_MAX}
            enterKeyHint="done"
            autoComplete="off"
            placeholder="Misalnya: roti sobek cokelat"
            className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-base placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Card>

        {/* Kolom jebakan bot: tidak terlihat dan tidak bisa difokus oleh manusia. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Website
            <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>
      </form>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          {errors.form && (
            <p role="alert" className="mb-2 text-center text-[13px] font-medium text-destructive">
              {errors.form}
            </p>
          )}
          <button
            type="submit"
            form="feedback-form"
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-60 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {busy ? (
              <>
                <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden /> Mengirim…
              </>
            ) : (
              "Kirim masukan"
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
