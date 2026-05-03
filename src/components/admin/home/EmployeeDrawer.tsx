"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X, ExternalLink, MessageCircle } from "lucide-react";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";

export interface DrawerSubject {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  /** Optional secondary line — role / status / pending count summary. */
  caption?: string;
}

/**
 * Slide-in drawer triggered from any clickable employee chip on Home.
 * Replaces the old "click name → /admin/users/<id>" route push so admins
 * can preview without leaving the dashboard.
 */
export function EmployeeDrawer({
  subject,
  onClose,
}: {
  subject: DrawerSubject | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!subject) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [subject, onClose]);

  if (!subject) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close drawer"
        className="flex-1 bg-foreground/40 backdrop-blur-sm animate-fade-up"
        style={{ animationDuration: "180ms" }}
      />
      <aside
        className="w-[380px] max-w-full bg-card border-l border-border/70 shadow-2xl flex flex-col animate-fade-up"
        style={{ animationDuration: "240ms" }}
      >
        <header className="flex items-center gap-3 px-5 py-4 border-b border-border/60">
          <EmployeeAvatar
            size="lg"
            full_name={subject.fullName}
            avatar_url={subject.avatarUrl}
            avatar_seed={subject.avatarSeed}
          />
          <div className="flex-1 min-w-0">
            <div className="font-display font-semibold text-foreground truncate">
              {subject.fullName}
            </div>
            {subject.caption && (
              <div className="text-[11.5px] text-muted-foreground truncate">
                {subject.caption}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid place-items-center size-8 rounded-full hover:bg-muted transition"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-[13px]">
          <p className="text-muted-foreground leading-relaxed">
            Quick preview surface. Full data — attendance streak, on-time
            rate, OT minutes, latest payslip, recent activity — wires in
            the next iteration.
          </p>
        </div>

        <footer className="flex items-center gap-2 px-5 py-3 border-t border-border/60 bg-muted/40">
          <Link
            href={`/admin/users/${subject.userId}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full text-[12.5px] font-medium text-white transition hover:brightness-110"
            style={{
              background: "var(--grad-teal)",
              boxShadow: "0 2px 10px rgba(17, 122, 140, 0.32)",
            }}
            onClick={onClose}
          >
            <ExternalLink size={13} />
            Open profile
          </Link>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full text-[12.5px] font-medium bg-card border border-border/70 hover:bg-muted transition"
            disabled
            title="WhatsApp wiring TBD"
          >
            <MessageCircle size={13} />
            Message
          </button>
        </footer>
      </aside>
    </div>
  );
}
