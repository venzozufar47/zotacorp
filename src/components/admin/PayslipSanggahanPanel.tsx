import { MessageSquareWarning } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export interface SanggahanEntry {
  message: string;
  /** Kapan karyawan mengirim sanggahan ini. */
  respondedAt: string | null;
}

export interface SanggahanItem {
  payslipId: string;
  userName: string;
  /** Status slip saat ini; "draft" = sedang di-reopen. */
  payslipStatus: string;
  /** Sanggahan yang masih aktif di slip (belum tergantikan). */
  current: SanggahanEntry | null;
  /** Sanggahan lama yang sudah dikosongkan / diganti, terbaru dulu. */
  history: Array<SanggahanEntry & { reason: string }>;
}

function fmt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Sanggahan karyawan pada slip periode ini — termasuk yang slipnya sudah
 * di-reopen dan yang pesannya sudah tergantikan (riwayat). Ringkas dulu:
 * satu baris per karyawan, isi pesan muncul saat diketuk.
 */
export function PayslipSanggahanPanel({ items }: { items: SanggahanItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <MessageSquareWarning size={16} className="text-muted-foreground" />
          <h3 className="font-display text-sm font-bold">
            Sanggahan karyawan ({items.length})
          </h3>
        </div>
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.payslipId}>
              <details className="rounded-lg border border-border bg-card group">
                <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold break-words min-w-0">
                    {it.userName}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {it.payslipStatus === "draft" ? "slip dibuka kembali · " : ""}
                    {it.current ? "aktif" : "riwayat"}
                    {it.history.length > 0 ? ` · +${it.history.length} lama` : ""}
                  </span>
                </summary>
                <div className="px-3 pb-3 space-y-2">
                  {it.current && (
                    <Quote
                      label="Sanggahan aktif"
                      entry={it.current}
                    />
                  )}
                  {it.history.map((h, i) => (
                    <Quote
                      key={i}
                      label={
                        h.reason === "refinalized"
                          ? "Sebelum slip difinalisasi ulang"
                          : "Sebelum diubah karyawan"
                      }
                      entry={h}
                      muted
                    />
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Quote({
  label,
  entry,
  muted,
}: {
  label: string;
  entry: SanggahanEntry;
  muted?: boolean;
}) {
  return (
    <div className={muted ? "opacity-80" : undefined}>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
        {entry.respondedAt ? ` · ${fmt(entry.respondedAt)}` : ""}
      </p>
      <p className="text-sm whitespace-pre-wrap break-words bg-muted/40 rounded-md p-2 mt-0.5">
        {entry.message}
      </p>
    </div>
  );
}
