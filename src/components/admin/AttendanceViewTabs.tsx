"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export type AttendanceView = "recap" | "matrix";

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

  const tabs: Array<{ key: AttendanceView; label: string }> = [
    { key: "recap", label: "Tabel rekap" },
    { key: "matrix", label: "Matriks bulanan" },
  ];

  return (
    <div className="inline-flex rounded-xl border-2 border-foreground bg-card p-1 gap-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => go(t.key)}
          className={
            "px-3 h-8 rounded-md text-xs font-display font-bold uppercase tracking-wider transition " +
            (current === t.key
              ? "bg-primary text-primary-foreground shadow-hard-sm"
              : "text-muted-foreground hover:bg-muted")
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
