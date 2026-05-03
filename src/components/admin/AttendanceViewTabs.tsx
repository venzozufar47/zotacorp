"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type AttendanceView = "recap" | "matrix" | "live";

const TABS: Array<{
  key: AttendanceView;
  label: string;
  icon: typeof CheckCircle2;
  pulse?: boolean;
}> = [
  { key: "recap", label: "Recap", icon: CheckCircle2 },
  { key: "matrix", label: "Matrix", icon: CalendarDays },
  { key: "live", label: "Live", icon: Clock, pulse: true },
];

export function AttendanceViewTabs({ current }: { current: AttendanceView }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function go(view: AttendanceView) {
    const params = new URLSearchParams(sp.toString());
    params.set("view", view);
    params.delete("page");
    params.delete("focus");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div
      className="inline-flex gap-0.5 p-1 rounded-xl border border-border/70"
      style={{ background: "var(--muted)" }}
    >
      {TABS.map((t) => {
        const active = current === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => go(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-medium tracking-[-0.005em] transition relative",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
            )}
            style={
              active
                ? { boxShadow: "0 1px 3px rgba(8,49,46,0.06), 0 0 0 1px var(--border)" }
                : undefined
            }
          >
            <Icon
              size={13}
              strokeWidth={1.8}
              className={active ? "text-[var(--teal-600)]" : ""}
            />
            {t.label}
            {t.pulse && (
              <span
                className="ml-0.5 size-1.5 rounded-full"
                style={{
                  background: "var(--teal-500)",
                  boxShadow: "0 0 0 3px var(--teal-100)",
                  animation: "pulse-dot 1.6s ease-in-out infinite",
                }}
                aria-hidden
              />
            )}
          </button>
        );
      })}
      <style jsx>{`
        @keyframes pulse-dot {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
      `}</style>
    </div>
  );
}
