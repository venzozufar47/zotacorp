"use client";

import { useEffect } from "react";
import { Bell, Share, SquarePlus, Lock, RotateCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePushSubscription } from "@/lib/hooks/usePushSubscription";

/**
 * Blocks check-in until the employee has push notifications active (or an
 * admin exempted them). Shown INSTEAD of the check-in button — replaces
 * `openCheckIn()` in `CheckInButton` when the server-verified gate isn't
 * satisfied yet, so no GPS/selfie effort is wasted on a check-in that
 * will be rejected.
 *
 * One panel per concrete blocker (not enabled yet / iOS not installed /
 * permission blocked / device unsupported) — each with the single next
 * action spelled out, and a one-tap button wherever the browser actually
 * allows automating that step.
 */
export function AttendancePushGate({ onReady }: { onReady: () => void }) {
  const { state, busy, enable, recheck } = usePushSubscription();

  // If another tab/flow already enabled it, this panel just gets out of
  // the way — no manual "continue" step needed.
  useEffect(() => {
    if (state === "subscribed") onReady();
  }, [state, onReady]);

  async function handleEnable() {
    const res = await enable();
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Notifikasi aktif!");
    onReady();
  }

  if (state === "loading") {
    return (
      <div className="w-full h-[72px] rounded-2xl border-2 border-foreground bg-muted/30 animate-pulse" />
    );
  }

  return (
    <div className="w-full rounded-2xl border-2 border-foreground bg-card shadow-hard p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-foreground bg-accent">
          <Bell className="size-5 text-primary" />
        </div>
        <div>
          <p className="font-display text-base font-bold text-foreground">
            Aktifkan notifikasi dulu untuk absen
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Wajib supaya kamu bisa menerima info penting terkait absen &
            gaji.
          </p>
        </div>
      </div>

      {state === "unsubscribed" && (
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy}
          className="btn-action-primary w-full flex items-center justify-center gap-2"
        >
          {busy ? (
            <span className="animate-pulse">Mengaktifkan…</span>
          ) : (
            <>
              <Bell size={20} />
              Aktifkan Notifikasi
            </>
          )}
        </button>
      )}

      {state === "ios-needs-install" && (
        <div className="space-y-3">
          <ol className="space-y-2.5">
            <Step
              n={1}
              icon={<Share size={16} />}
              text='Di Safari, ketuk ikon Share (kotak dengan panah ke atas) di bagian bawah layar'
            />
            <Step
              n={2}
              icon={<SquarePlus size={16} />}
              text='Pilih "Add to Home Screen" / "Tambah ke Layar Utama"'
            />
            <Step
              n={3}
              icon={<Smartphone size={16} />}
              text="Buka aplikasi dari ikonnya di Home Screen (bukan dari Safari lagi)"
            />
            <Step n={4} icon={<Bell size={16} />} text='Di dalam app, ketuk "Aktifkan Notifikasi"' />
          </ol>
          <p className="text-[11px] text-muted-foreground italic">
            Ini cuma perlu dilakukan sekali.
          </p>
        </div>
      )}

      {state === "denied" && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 border-2 border-destructive px-3 py-2.5">
            <Lock size={16} className="shrink-0 mt-0.5 text-destructive" />
            <p className="text-xs text-foreground">
              Notifikasi diblokir di pengaturan browser/HP kamu. Buka
              Pengaturan → Notifikasi (atau Site Settings di browser) →
              izinkan untuk situs ini, lalu tekan tombol di bawah.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => recheck()}
            className="w-full"
          >
            <RotateCw size={16} className="mr-1.5" />
            Sudah diizinkan, cek lagi
          </Button>
        </div>
      )}

      {state === "unsupported" && (
        <div className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5">
          <Smartphone size={16} className="shrink-0 mt-0.5 text-muted-foreground" />
          <p className="text-xs text-foreground">
            Browser/perangkat ini tidak mendukung notifikasi. Coba buka
            dengan Chrome atau Edge versi terbaru. Kalau tetap tidak bisa,
            hubungi admin untuk minta pengecualian.
          </p>
        </div>
      )}
    </div>
  );
}

function Step({
  n,
  icon,
  text,
}: {
  n: number;
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="shrink-0 size-6 rounded-full border-2 border-foreground bg-tertiary/40 flex items-center justify-center text-[11px] font-display font-bold">
        {n}
      </span>
      <span className="flex-1 text-sm text-foreground pt-0.5 flex items-center gap-1.5">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        {text}
      </span>
    </li>
  );
}
