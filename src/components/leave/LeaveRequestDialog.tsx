"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getLeaveDialogData,
  submitLeaveRequest,
  type ColleagueOption,
  type LeaveRequestView,
} from "@/lib/actions/leave-requests.actions";
import { LeaveForm } from "./LeaveForm";
import { HistoryRow, NowContext, SegTabs } from "./LeaveParts";

type DialogData = {
  colleagues: ColleagueOption[];
  leaderNames: string[];
  myRequests: LeaveRequestView[];
  nowMs: number;
};
type Tab = "ajukan" | "riwayat";

/**
 * Izin sakit / keluar toko / tukar shift untuk KARYAWAN — pop-up tepat di
 * bawah tombol Check In, tanpa pindah halaman. Datanya diambil saat dibuka
 * supaya dashboard tidak makin berat. Atasan mengurus persetujuan dan
 * mencatat atas nama anggota di halaman Tim, bukan di sini.
 */
export function LeaveRequestDialog() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DialogData | null>(null);
  const [tab, setTab] = useState<Tab>("ajukan");

  async function load() {
    try {
      setData(await getLeaveDialogData());
    } catch {
      toast.error("Gagal memuat data izin. Coba lagi.");
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setTab("ajukan");
      void load();
    }
  }

  const leaderLabel =
    data && data.leaderNames.length > 0 ? data.leaderNames.join(" / ") : "Owner";
  const pendingCount = data?.myRequests.filter((r) => r.status === "pending").length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:border-foreground hover:text-foreground"
      >
        <CalendarClock size={16} />
        Izin sakit / keluar toko
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Izin</DialogTitle>
          </DialogHeader>
          {!data ? (
            <div className="grid place-items-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <NowContext.Provider value={data.nowMs}>
              <div className="space-y-4">
                <SegTabs
                  tabs={[
                    { id: "ajukan" as const, label: "Ajukan" },
                    { id: "riwayat" as const, label: "Riwayatku", count: pendingCount },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
                {tab === "ajukan" ? (
                  <LeaveForm
                    colleagues={data.colleagues}
                    submitLabel={
                      <>
                        <Send /> Kirim ke {leaderLabel}
                      </>
                    }
                    note={
                      data.leaderNames.length === 0
                        ? "Kamu belum punya atasan langsung tercatat, jadi pengajuan masuk ke Owner."
                        : undefined
                    }
                    onSubmit={async (v) => {
                      const res = await submitLeaveRequest(v);
                      if (!res.ok) {
                        toast.error(res.error);
                        return false;
                      }
                      toast.success(`Terkirim ke ${leaderLabel}`);
                      await load();
                      setTab("riwayat");
                      return true;
                    }}
                  />
                ) : data.myRequests.length === 0 ? (
                  <p className="rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Belum ada pengajuan.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.myRequests.map((r) => (
                      <HistoryRow key={r.id} r={r} leaderLabel={leaderLabel} />
                    ))}
                  </div>
                )}
              </div>
            </NowContext.Provider>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
