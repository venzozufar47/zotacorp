"use client";

import { useEffect, useState } from "react";
import { BellRing, CheckCircle2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AttendancePushGate } from "./AttendancePushGate";
import { usePushSubscription } from "@/lib/hooks/usePushSubscription";
import { getCheckoutPushCheck, sendCheckoutPushTest } from "@/lib/actions/checkout-push.actions";

export function CheckoutPushDialog({ attendanceId, attemptedAt, onClose, onContinue }: {
  attendanceId: string; attemptedAt: string;
  onClose: () => void; onContinue: () => void;
}) {
  const { state, recheck } = usePushSubscription();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let alive = true;
    let checking = false;
    async function check() {
      if (checking) return;
      checking = true;
      try {
        const result = await getCheckoutPushCheck(attendanceId);
        if (alive) {
          if (result.verified) { setVerified(true); setError(""); }
          else if (result.error) setError(result.error);
        }
      } catch { if (alive) setError("Koneksi terputus. Sambungkan internet untuk memeriksa verifikasi."); }
      finally { checking = false; }
    }
    void check();
    const interval = setInterval(() => { if (!document.hidden) void check(); }, 4000);
    const focus = () => { void check(); };
    window.addEventListener("focus", focus);
    navigator.serviceWorker?.addEventListener("message", focus);
    return () => {
      alive = false; clearInterval(interval);
      window.removeEventListener("focus", focus);
      navigator.serviceWorker?.removeEventListener("message", focus);
    };
  }, [attendanceId]);

  useEffect(() => {
    if (!cooldown) return;
    const timeout = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timeout);
  }, [cooldown]);

  async function send() {
    setBusy(true); setError("");
    try {
      const registration = await navigator.serviceWorker.ready;
      // Ensure an old worker is upgraded before sending the new token payload.
      await registration.update();
      if (registration.installing) {
        await new Promise<void>((resolve, reject) => {
          const worker = registration.installing!;
          const timeout = setTimeout(() => reject(new Error("Pembaruan belum selesai. Coba kirim lagi.")), 15000);
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") { clearTimeout(timeout); resolve(); }
            if (worker.state === "redundant") { clearTimeout(timeout); reject(new Error("Pembaruan gagal. Muat ulang aplikasi.")); }
          });
        });
      }
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) { setError("Aktifkan notifikasi di perangkat ini terlebih dahulu."); return; }
      const result = await sendCheckoutPushTest(attendanceId, subscription.endpoint);
      if ("error" in result && result.error) setError(result.error);
      else if ("verified" in result && result.verified) setVerified(true);
      else { setSent(true); setCooldown(30); }
    } catch (error) { setError(error instanceof Error ? error.message : "Gagal mengirim. Periksa koneksi lalu coba lagi."); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <div className={`mb-2 flex size-12 items-center justify-center rounded-2xl ${verified ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>
            {verified ? <CheckCircle2 aria-hidden size={24} /> : <BellRing aria-hidden size={24} />}
          </div>
          <DialogTitle>{verified ? "Notifikasi berhasil diverifikasi" : "Verifikasi sebelum absen pulang"}</DialogTitle>
          <DialogDescription>
            {verified ? "Notifikasi sudah sampai dan diketuk. Kamu bisa melanjutkan absen pulang." : "Klik notifikasi terakhir belum terverifikasi dalam 7 hari. Pastikan info kerja tetap sampai ke kamu."}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
          Waktu pulang disimpan: <strong className="tabular-nums">{new Date(attemptedAt).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })} WIB</strong>
          <p className="mt-1 text-xs text-muted-foreground">Selesaikan dalam 30 menit. Absen belum selesai sampai kamu menekan lanjutkan.</p>
        </div>
        {!verified && <>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            <li>Kirim notifikasi uji ke perangkat ini.</li>
            <li>Buka panel notifikasi HP/browser, lalu ketuk <strong>“Ketuk untuk verifikasi absen pulang”</strong>.</li>
            <li>Kembali ke sini dan lanjutkan absen pulang.</li>
          </ol>
          {state !== "subscribed" && <AttendancePushGate onReady={recheck} />}
          {sent && <p role="status" className="rounded-xl bg-primary/5 p-3 text-sm text-primary">Notifikasi uji dikirim. Menunggu kamu mengetuknya. Notifikasi berlaku 5 menit.</p>}
        </>}
        {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-2">
          {verified ? <Button className="min-h-11" onClick={onContinue}>Lanjutkan absen pulang</Button> :
            <Button className="min-h-11 gap-2" loading={busy} disabled={busy || cooldown > 0 || state !== "subscribed"} onClick={send}>
              <Send aria-hidden size={16} />{cooldown ? `Kirim ulang dalam ${cooldown} detik` : sent ? "Kirim ulang notifikasi" : "Kirim notifikasi uji"}
            </Button>}
          <Button className="min-h-11" variant="outline" onClick={onClose} disabled={busy}>Kembali</Button>
        </div>
        {!verified && <details className="text-sm text-muted-foreground">
          <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground">Notifikasi tidak muncul?</summary>
          <p className="leading-relaxed">Periksa koneksi dan izin notifikasi aplikasi/browser di pengaturan HP. Matikan mode Jangan Ganggu, lalu kirim ulang. Jika perangkat tidak mendukung, hubungi admin untuk pengecualian notifikasi melalui Pengaturan. Jangan mengubah jam pulang untuk melewati verifikasi.</p>
        </details>}
      </DialogContent>
    </Dialog>
  );
}
