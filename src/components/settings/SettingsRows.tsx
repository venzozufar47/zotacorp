"use client";

import { useState } from "react";
import { Bell, BellOff, Check, CheckCircle2, Globe, KeyRound, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/account/Disclosure";
import { MyPushDevicesCard } from "@/components/shared/MyPushDevicesCard";
import { usePushSubscription } from "@/lib/hooks/usePushSubscription";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import type { Language } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

/**
 * Tiga baris pengaturan karyawan: Notifikasi, Bahasa, Kata sandi. Tiap baris
 * ringkas (judul + status satu baris); kontrolnya terbuka saat diketuk.
 * `LanguageCard` dan `PasswordResetCard` tetap dipakai halaman pengaturan admin.
 */

export function NotificationRow() {
  const { state, busy, enable, disable } = usePushSubscription();

  async function onEnable() {
    const res = await enable();
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Notifikasi aktif di perangkat ini.");
  }

  async function onDisable() {
    const res = await disable();
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Notifikasi dimatikan.");
  }

  // Peramban tanpa dukungan push: tidak ada yang bisa diatur.
  if (state === "unsupported") return null;

  const summary =
    state === "loading"
      ? "Memeriksa…"
      : state === "subscribed"
        ? "Aktif di perangkat ini"
        : state === "denied"
          ? "Diblokir di peramban"
          : state === "ios-needs-install"
            ? "Perlu dipasang ke layar utama"
            : "Belum aktif";

  return (
    <Disclosure
      title="Notifikasi"
      icon={state === "subscribed" ? Bell : BellOff}
      summary={summary}
      status={state === "unsubscribed" ? "warn" : undefined}
      statusLabel="Belum aktif"
    >
      <p className="text-sm text-muted-foreground">
        {state === "subscribed"
          ? "Kamu diberi tahu untuk slip gaji, kontrak kerja, tes DISC, dan lainnya."
          : state === "denied"
            ? "Izin notifikasi diblokir. Aktifkan lewat pengaturan peramban atau HP."
            : state === "ios-needs-install"
              ? 'Di iPhone: ketuk Share, pilih "Add to Home Screen", buka app dari ikonnya, lalu aktifkan notifikasi.'
              : "Aktifkan untuk menerima pemberitahuan di HP atau peramban ini. Wajib aktif untuk absen masuk."}
      </p>
      {state === "subscribed" && (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={onDisable}
          loading={busy}
        >
          <BellOff /> Matikan
        </Button>
      )}
      {state === "unsubscribed" && (
        <Button size="sm" className="min-h-11" onClick={onEnable} loading={busy}>
          <Bell /> Aktifkan
        </Button>
      )}
      <MyPushDevicesCard />
    </Disclosure>
  );
}

const LANGUAGES: { value: Language; labelKey: "indonesian" | "english" }[] = [
  { value: "id", labelKey: "indonesian" },
  { value: "en", labelKey: "english" },
];

export function LanguageRow() {
  const { lang, setLang, t } = useTranslation();
  const current = LANGUAGES.find((l) => l.value === lang) ?? LANGUAGES[0];

  return (
    <Disclosure
      title={t.settings.language}
      icon={Globe}
      summary={t.settings[current.labelKey]}
    >
      <div role="radiogroup" aria-label={t.settings.language} className="space-y-1.5">
        {LANGUAGES.map((opt) => {
          const active = lang === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                if (active) return;
                setLang(opt.value);
                toast.success(t.settings.saved);
              }}
              className={cn(
                "flex min-h-12 w-full items-center justify-between rounded-xl border px-4 text-sm transition-colors motion-reduce:transition-none",
                active
                  ? "border-primary bg-accent font-semibold"
                  : "border-border hover:bg-muted"
              )}
            >
              {t.settings[opt.labelKey]}
              {active && <Check size={16} className="text-primary" aria-hidden />}
            </button>
          );
        })}
      </div>
    </Disclosure>
  );
}

/**
 * Kirim tautan reset kata sandi: POST ke /api/auth/request-password-reset
 * (sesi aktif dicek, tautan dibuat Supabase, email lewat Resend). Alamat
 * tujuan tetap tampil di bawah tombol supaya karyawan tahu ke mana harus
 * melihat, bukan sekadar toast yang cepat hilang.
 */
export function PasswordRow() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSend() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        email?: string;
        error?: string;
      };

      if (!res.ok || !body.ok) {
        toast.error(body.error || t.passwordReset.errGeneric);
        return;
      }

      setSentTo(body.email ?? null);
      toast.success(t.passwordReset.toastSuccess);
    } catch {
      toast.error(t.passwordReset.errGeneric);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Disclosure
      title={t.passwordReset.title}
      icon={KeyRound}
      summary="Kirim tautan reset ke email"
    >
      <p className="text-sm text-muted-foreground">{t.passwordReset.description}</p>
      <Button
        type="button"
        size="sm"
        className="min-h-11"
        onClick={handleSend}
        loading={loading}
      >
        <Mail size={16} />
        {loading ? t.passwordReset.sending : t.passwordReset.send}
      </Button>
      {sentTo && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2.5 rounded-xl bg-success/10 px-3.5 py-3 text-sm"
        >
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-hidden />
          <div className="leading-relaxed">
            <p className="font-medium">
              {t.passwordReset.sentTo} <span className="font-semibold">{sentTo}</span>
            </p>
            <p className="text-xs text-muted-foreground">{t.passwordReset.checkInbox}</p>
          </div>
        </div>
      )}
    </Disclosure>
  );
}
