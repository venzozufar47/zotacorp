"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldOff, CheckCircle2, XCircle } from "lucide-react";
import {
  setPushExemption,
  type PushExemptionRow,
} from "@/lib/actions/push.actions";

/**
 * Admin override for the check-in push gate — for employees whose
 * device/browser genuinely can't support Web Push (old phone, unsupported
 * browser). Exempting someone lets them check in without an active push
 * subscription; everyone else must have notifications enabled first.
 */
export function PushExemptionsCard({
  initialRows,
}: {
  initialRows: PushExemptionRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onToggle(row: PushExemptionRow) {
    startTransition(async () => {
      const res = await setPushExemption(row.id, !row.exempt);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        row.exempt
          ? `${row.fullName}: wajib notifikasi lagi untuk absen.`
          : `${row.fullName}: boleh absen tanpa notifikasi.`
      );
      router.refresh();
    });
  }

  const blockedCount = initialRows.filter(
    (r) => !r.hasSubscription && !r.exempt
  ).length;

  return (
    <section className="rounded-2xl border-2 border-foreground bg-card shadow-hard p-5 sm:p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full border-2 border-foreground flex items-center justify-center flex-shrink-0 bg-quaternary">
          <ShieldOff size={18} strokeWidth={2.5} className="text-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="font-display font-bold text-lg">
            Pengecualian gerbang notifikasi absen
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed font-medium">
            Karyawan wajib aktifkan notifikasi push sebelum bisa absen
            masuk. Kalau device/browser karyawan memang tidak mendukung,
            kecualikan di sini supaya tetap bisa absen.
          </p>
        </div>
      </div>

      {blockedCount > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 font-medium">
          {blockedCount} karyawan belum aktifkan notifikasi & belum
          dikecualikan — mereka akan tertahan saat coba absen masuk.
        </p>
      )}

      {initialRows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Tidak ada karyawan aktif.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-muted/20 overflow-hidden">
          {initialRows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.fullName}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  {r.hasSubscription ? (
                    <>
                      <CheckCircle2 size={12} className="text-success" />
                      Notifikasi aktif
                    </>
                  ) : r.exempt ? (
                    <>
                      <ShieldOff size={12} />
                      Dikecualikan — boleh absen tanpa notifikasi
                    </>
                  ) : (
                    <>
                      <XCircle size={12} className="text-destructive" />
                      Belum aktif — tertahan saat absen masuk
                    </>
                  )}
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={r.exempt}
                  onChange={() => onToggle(r)}
                  disabled={pending}
                  className="size-4 accent-primary"
                />
                Kecualikan
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
