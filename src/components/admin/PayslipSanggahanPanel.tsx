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
  history: Array<SanggahanEntry & { reason: string; adminReply?: string | null }>;
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

function reasonLabel(reason: string): string {
  if (reason === "refinalized") return "Sebelum slip difinalisasi ulang";
  if (reason === "answered") return "Sudah ditanggapi";
  return "Sebelum diubah karyawan";
}

/**
 * Sanggahan karyawan pada slip periode ini. Datar: pesan aktif langsung
 * terbaca tanpa ketukan tambahan; hanya riwayat lama yang dilipat.
 */
export function PayslipSanggahanPanel({ items }: { items: SanggahanItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card divide-y divide-border">
      {items.map((it) => (
        <div key={it.payslipId} className="p-3 space-y-2">
          <p className="text-sm font-semibold break-words">
            {it.userName}
            {it.payslipStatus === "draft" && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                slip dibuka kembali
              </span>
            )}
          </p>
          {it.current ? (
            <>
              <Quote entry={it.current} />
              {it.history.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer min-h-8 inline-flex items-center">
                    +{it.history.length} sebelumnya
                  </summary>
                  <div className="space-y-2 pt-1">
                    {it.history.map((h, i) => (
                      <Quote key={i} entry={h} label={reasonLabel(h.reason)} reply={h.adminReply} muted />
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {it.history.map((h, i) => (
                <Quote key={i} entry={h} label={reasonLabel(h.reason)} reply={h.adminReply} muted />
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function Quote({
  entry,
  label,
  reply,
  muted,
}: {
  entry: SanggahanEntry;
  label?: string;
  reply?: string | null;
  muted?: boolean;
}) {
  const meta = [label, fmt(entry.respondedAt)].filter(Boolean).join(" · ");
  return (
    <div className={muted ? "opacity-80" : undefined}>
      {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
      <p className="text-sm whitespace-pre-wrap break-words bg-muted/40 rounded-md p-2 mt-0.5">
        {entry.message}
      </p>
      {reply && (
        <p className="text-sm whitespace-pre-wrap break-words border-l-2 border-primary/40 pl-2 mt-1">
          <span className="text-xs text-muted-foreground">Balasan admin</span>
          <br />
          {reply}
        </p>
      )}
    </div>
  );
}
