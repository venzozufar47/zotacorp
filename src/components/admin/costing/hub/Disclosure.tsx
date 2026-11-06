import { cn } from "@/lib/utils";

/**
 * Bagian yang boleh dilipat: ringkasan satu baris selalu tampil, isi terbuka
 * saat diketuk. `<details>` bawaan browser, jadi tanpa JS dan bisa dioperasikan
 * dengan keyboard.
 */
export function Disclosure({
  summary,
  hint,
  defaultOpen = false,
  tone = "default",
  children,
}: {
  summary: React.ReactNode;
  hint?: React.ReactNode;
  defaultOpen?: boolean;
  tone?: "default" | "attention";
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group rounded-xl border bg-card",
        tone === "attention" ? "border-warning/50 bg-warning/5" : "border-border"
      )}
    >
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3.5 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="text-muted-foreground transition-transform group-open:rotate-90"
        >
          ›
        </span>
        <span>{summary}</span>
        {hint && <span className="ml-auto text-xs font-normal text-muted-foreground">{hint}</span>}
      </summary>
      <div className="border-t border-border/70 p-3.5">{children}</div>
    </details>
  );
}
