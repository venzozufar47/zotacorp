import { MessageSquare, MapPinOff, ShoppingBag } from "lucide-react";

/**
 * Shared "Keterangan" / "Notes" cell for attendance tables (admin recap +
 * employee history). Aggregates all post-hoc context on a single log —
 * late-checkout reasons and outside-radius notes with a maps link — so
 * the sign-out column can stay a clean timestamp.
 *
 * Labels are passed in as props (instead of calling useTranslation) so
 * server-rendered tables and client tables can both use this without
 * turning it into a client component unnecessarily.
 */
export function AttendanceNotesCell({
  lateCheckoutReason,
  outsideNote,
  checkoutLat,
  checkoutLng,
  lateCheckoutPrefix,
  outsideLabel,
  viewOnMapsAria,
  extraWork,
  extraWorkKindLabels,
}: {
  lateCheckoutReason: string | null;
  outsideNote: string | null;
  checkoutLat: number | null;
  checkoutLng: number | null;
  lateCheckoutPrefix: string;
  outsideLabel: string;
  viewOnMapsAria: string;
  /** Extra-work entries logged on this same date. */
  extraWork?: { kind: string }[];
  /** Map of `kind` → human label, sourced from the caller's dictionary
   *  so this component stays language-agnostic. */
  extraWorkKindLabels?: Record<string, string>;
}) {
  const hasExtra = !!extraWork && extraWork.length > 0;
  if (!lateCheckoutReason && !outsideNote && !hasExtra) {
    // Keep the same min-width as the populated cell so the column
    // stays a consistent width across rows.
    return (
      <div className="w-[420px] max-w-[420px]">
        <span className="text-muted-foreground text-xs">—</span>
      </div>
    );
  }

  const mapsUrl =
    checkoutLat != null && checkoutLng != null
      ? `https://maps.google.com/?q=${checkoutLat.toFixed(5)},${checkoutLng.toFixed(5)}`
      : null;

  const pillInner = (
    <>
      <MapPinOff size={11} />
      {outsideLabel}
    </>
  );
  const pillClasses =
    "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide";

  return (
    <div className="space-y-1.5 w-[420px] max-w-[420px] [overflow-wrap:anywhere]">
      {lateCheckoutReason && (
        <div className="flex items-start gap-1 min-w-0">
          <MessageSquare size={10} className="mt-0.5 shrink-0 text-muted-foreground" />
          <p
            className="text-xs text-muted-foreground leading-snug break-words [overflow-wrap:anywhere] min-w-0 flex-1"
            title={lateCheckoutReason}
          >
            {lateCheckoutPrefix}: {lateCheckoutReason}
          </p>
        </div>
      )}
      {outsideNote && (
        <div className="rounded-xl border-2 border-foreground bg-tertiary/30 px-2.5 py-2">
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={viewOnMapsAria}
              className={`${pillClasses} text-foreground hover:underline`}
            >
              {pillInner}
            </a>
          ) : (
            <div className={`${pillClasses} text-foreground`}>{pillInner}</div>
          )}
          <p
            className="text-xs text-foreground leading-snug break-words [overflow-wrap:anywhere] mt-0.5 font-medium"
            title={outsideNote}
          >
            {outsideNote}
          </p>
        </div>
      )}
      {hasExtra && extraWork!.map((e, i) => (
        <div key={i} className="flex items-center gap-1 text-xs">
          <ShoppingBag size={11} className="shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            {extraWorkKindLabels?.[e.kind] ?? e.kind}
          </span>
        </div>
      ))}
    </div>
  );
}
