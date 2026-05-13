/**
 * Render multi-line cake order notes (warna, tulisan, aksesoris, dsb)
 * dengan dukungan bullet otomatis. Admin Haengbocake input pakai
 * textarea (Enter → baris baru); kalau admin awali baris dengan
 * "- ", "* ", atau "• " maka baris itu jadi bullet visual.
 *
 * Dipakai di CakeOrderDetail, SlipChecklist, dan SlipPreview supaya
 * tampilan catatan konsisten lintas surface.
 */
export function NotesText({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const lines = value.split(/\r?\n/);
  return (
    <div
      className={`text-foreground break-words leading-snug whitespace-pre-line ${className ?? ""}`}
    >
      {lines.map((raw, i) => {
        const trimmed = raw.trimStart();
        const bulletMatch = /^([-*•])\s+(.*)$/.exec(trimmed);
        if (bulletMatch) {
          return (
            <div
              key={i}
              className="flex items-start gap-1.5 pl-2"
            >
              <span className="text-muted-foreground select-none">•</span>
              <span className="flex-1 min-w-0">{bulletMatch[2]}</span>
            </div>
          );
        }
        // Whitespace-pre-line already preserves the newline; emit
        // plain text so consecutive non-bullet lines flow naturally.
        return <span key={i}>{raw + (i < lines.length - 1 ? "\n" : "")}</span>;
      })}
    </div>
  );
}
