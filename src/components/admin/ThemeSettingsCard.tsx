"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Palette, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { THEMES, type ThemeName } from "@/lib/themes";
import { updateUiTheme } from "@/lib/actions/settings.actions";

interface ThemeSettingsCardProps {
  /** The currently active org theme (from attendance_settings.ui_theme). */
  current: ThemeName;
}

/**
 * Admin-only picker for the org-wide dashboard theme.
 *
 * Each theme card features a self-contained mini-preview that renders
 * the theme's authentic visual language regardless of which theme is
 * currently active globally. The previews use inline styles instead of
 * the global cascade so a Playful preview always looks Playful even
 * inside a Minimal page (and vice versa).
 *
 * The selected theme is written to `attendance_settings.ui_theme` and
 * applied via the `data-theme` attribute on `<html>` in the root layout —
 * so every employee sees the new skin on their next navigation.
 */
export function ThemeSettingsCard({ current }: ThemeSettingsCardProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<ThemeName>(current);
  const [pending, startTransition] = useTransition();

  const isDirty = selected !== current;

  function handleApply() {
    if (!isDirty) return;
    startTransition(async () => {
      const result = await updateUiTheme(selected);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Theme applied — refreshing…");
      // Full reload so the new `data-theme` attribute is painted before
      // any client-side state resumes. Without this the existing DOM
      // keeps the old theme until the next navigation.
      setTimeout(() => window.location.reload(), 400);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center size-8 rounded-full border-2 border-foreground bg-pop-pink">
            <Palette size={16} strokeWidth={2.5} className="text-foreground" />
          </span>
          Theme
        </CardTitle>
        <CardDescription>
          Tema dashboard yang berlaku untuk semua pengguna. Admin saja yang
          bisa mengubah.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {THEMES.map((theme) => {
            const active = selected === theme.id;
            const isCurrent = current === theme.id;
            // Only Oceanic Editorial is actively maintained right now.
            // Other themes are hidden behind a disabled state + "Soon"
            // badge until they're brought back to parity with new features.
            const isDisabled = theme.id !== "oceanic";
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => {
                  if (isDisabled) return;
                  setSelected(theme.id);
                }}
                disabled={isDisabled}
                aria-pressed={active}
                aria-disabled={isDisabled}
                aria-label={
                  isDisabled
                    ? `${theme.label} theme — coming soon`
                    : `Select ${theme.label} theme`
                }
                className={cn(
                  "group/theme relative flex flex-col items-stretch gap-2 rounded-2xl border-2 p-2.5 text-left transition-all duration-200",
                  isDisabled
                    ? "border-border bg-card opacity-50 grayscale cursor-not-allowed"
                    : active
                    ? "border-foreground bg-accent shadow-hard"
                    : "border-border bg-card hover:border-foreground/50 hover:-translate-y-0.5"
                )}
              >
                {/* The mini preview — renders the theme's authentic visual
                    language via inline styles so cascade conflicts with
                    the active global theme are sidestepped entirely. */}
                <ThemePreview theme={theme.id} />

                {/* Meta — compact two-row stack. Vibe tag is inline with
                    the label on ≥sm screens; on mobile it wraps. */}
                <div className="px-0.5 flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold text-sm leading-tight">
                      {theme.label}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-display font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border-2 border-foreground bg-quaternary text-foreground">
                        Active
                      </span>
                    )}
                    {isDisabled && (
                      <span className="text-[10px] font-display font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground">
                        Soon
                      </span>
                    )}
                    <span
                      aria-hidden
                      className="ml-auto text-[0.625rem] font-display font-bold uppercase tracking-wider text-primary/80 hidden sm:inline"
                    >
                      {theme.vibe}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium leading-snug line-clamp-2">
                    {theme.description}
                  </p>
                </div>

                {active && (
                  <span
                    aria-hidden
                    className="absolute top-2.5 right-2.5 inline-flex items-center justify-center size-6 rounded-full border-2 border-foreground bg-primary text-primary-foreground z-10"
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <p className="text-xs text-muted-foreground font-medium">
            {THEMES.length === 1
              ? "More themes coming soon."
              : `${THEMES.length} themes available.`}
          </p>
          <Button
            type="button"
            onClick={handleApply}
            disabled={!isDirty || pending}
            size="sm"
          >
            {pending ? "Applying…" : isDirty ? "Apply theme" : "Saved"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────
//  THEME PREVIEWS
// ───────────────────────────────────────────────────────────────────────
//
// Each preview is a self-contained mini-mock built with inline styles.
// Why not use real components? Because the preview must render the
// theme's authentic visuals regardless of which theme is active globally
// — and the global theme's CSS (e.g. `[data-theme="minimal"] [data-slot=...]`)
// would otherwise restyle anything we put inside, even if we tried to
// nest a different `data-theme` attribute.
//
// Inline styles dodge the cascade entirely. The trade-off is duplication
// of the design language here, but the previews are small and stable —
// they only need updating when a theme's signature visual changes.
// ───────────────────────────────────────────────────────────────────────

function ThemePreview({ theme }: { theme: ThemeName }) {
  if (theme === "minimal") return <MinimalPreview />;
  if (theme === "oceanic") return <OceanicPreview />;
  return <PlayfulPreview />;
}

/**
 * Playful Geometric mini-mock — Memphis sticker aesthetic.
 *
 * Communicates: violet primary, hard offset shadow, chunky 2px dark
 * border, pill button, uppercase tracked eyebrow, Outfit display
 * weight, geometric decorative shapes.
 */
function PlayfulPreview() {
  return (
    <div
      aria-hidden
      className="relative w-full overflow-hidden"
      style={{
        background: "#FFFDF5",
        borderRadius: "16px",
        border: "2px solid #1E293B",
        padding: "12px",
        boxShadow: "3px 3px 0 0 #1E293B",
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      }}
    >
      {/* Decorative yellow circle — top right, Memphis flourish */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: "-14px",
          right: "-14px",
          width: "44px",
          height: "44px",
          borderRadius: "9999px",
          background: "#FBBF24",
          border: "2px solid #1E293B",
        }}
      />
      {/* Decorative pink dot — small */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          bottom: "10px",
          right: "12px",
          width: "10px",
          height: "10px",
          borderRadius: "9999px",
          background: "#F472B6",
          border: "1.5px solid #1E293B",
        }}
      />

      {/* Eyebrow — uppercase, tracked, bold */}
      <p
        style={{
          fontFamily: '"Outfit", system-ui, sans-serif',
          fontSize: "8px",
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#64748B",
          margin: 0,
        }}
      >
        Selamat pagi
      </p>

      {/* Display number — Outfit ExtraBold with violet accent */}
      <div
        style={{
          fontFamily: '"Outfit", system-ui, sans-serif',
          fontSize: "30px",
          fontWeight: 800,
          letterSpacing: "-0.04em",
          color: "#1E293B",
          lineHeight: 1,
          marginTop: "4px",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        09:45
        <span style={{ color: "#8B5CF6" }}>.</span>
      </div>

      {/* Pill button + sticker badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginTop: "10px",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            height: "24px",
            paddingLeft: "10px",
            paddingRight: "8px",
            background: "#8B5CF6",
            color: "#FFFFFF",
            borderRadius: "9999px",
            border: "2px solid #1E293B",
            boxShadow: "2px 2px 0 0 #1E293B",
            fontFamily: '"Outfit", system-ui, sans-serif',
            fontSize: "10px",
            fontWeight: 700,
          }}
        >
          Check in
          <ArrowRight size={10} strokeWidth={3} />
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: "20px",
            padding: "0 8px",
            background: "#34D399",
            color: "#1E293B",
            borderRadius: "9999px",
            border: "1.5px solid #1E293B",
            fontFamily: '"Outfit", system-ui, sans-serif',
            fontSize: "9px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          On time
        </span>
      </div>
    </div>
  );
}

/**
 * Oceanic Editorial mini-mock — Apple-inspired editorial aesthetic.
 *
 * Communicates: oceanic teal primary, soft blurred shadow (not hard
 * offset, not flat), ring-style hairline border, Poppins display
 * typography, rounded-xl (generous) radius, editorial gradient hero.
 */
function OceanicPreview() {
  return (
    <div
      aria-hidden
      className="relative w-full overflow-hidden"
      style={{
        background: "#ffffff",
        borderRadius: "14px",
        border: "1px solid rgba(29, 29, 31, 0.08)",
        padding: "10px",
        boxShadow:
          "0 1px 2px rgba(0,58,65,0.04), 0 8px 24px -12px rgba(0,58,65,0.14)",
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      }}
    >
      {/* Mini oceanic hero — teal gradient with white type */}
      <div
        style={{
          position: "relative",
          isolation: "isolate",
          overflow: "hidden",
          borderRadius: "10px",
          padding: "10px 12px",
          background:
            "radial-gradient(120% 140% at 100% 0%, #1e9aaf 0%, transparent 55%), radial-gradient(90% 120% at 0% 100%, #06343f 0%, transparent 60%), linear-gradient(135deg, #08475a 0%, #117a8c 55%, #1e9aaf 100%)",
          color: "#ffffff",
        }}
      >
        {/* Soft blob in corner (signature oceanic decoration) */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: "auto -30% -50% auto",
            width: "60%",
            aspectRatio: "1",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.22), rgba(255,255,255,0) 70%)",
            filter: "blur(10px)",
            pointerEvents: "none",
            zIndex: -1,
          }}
        />
        <p
          style={{
            fontFamily: '"Poppins", system-ui, sans-serif',
            fontSize: "8px",
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.6)",
            margin: 0,
          }}
        >
          Selamat pagi
        </p>
        <div
          style={{
            fontFamily: '"Poppins", system-ui, sans-serif',
            fontSize: "26px",
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: "#ffffff",
            lineHeight: 1,
            marginTop: "2px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          09:45
        </div>
      </div>

      {/* Button + chip row below the hero */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginTop: "10px",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: "28px",
            padding: "0 12px",
            background: "#117a8c",
            color: "#FFFFFF",
            borderRadius: "10px",
            boxShadow: "0 2px 8px rgba(17,122,140,0.25)",
            fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: 0,
          }}
        >
          Check in
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: "22px",
            padding: "0 9px",
            background: "#eef7f9",
            color: "#117a8c",
            borderRadius: "9999px",
            fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: 0,
          }}
        >
          On time
        </span>
      </div>
    </div>
  );
}

/**
 * Modern Minimalist mini-mock — Slack/Gojek aesthetic.
 *
 * Communicates: emerald primary (#00AA5B), soft drop shadow, 1px
 * hairline border, rectangular button (6px radius), sentence-case
 * labels, Inter typography, no decoration. The preview itself is
 * a flat white card on warm off-white background to show the
 * surface hierarchy.
 */
function MinimalPreview() {
  return (
    <div
      aria-hidden
      className="relative w-full overflow-hidden"
      style={{
        background: "#F8FAFC",
        borderRadius: "8px",
        border: "1px solid #E2E8F0",
        padding: "10px",
        fontFamily: '"Inter", "SF Pro Text", system-ui, sans-serif',
      }}
    >
      {/* Inner panel — flat white card with hairline + soft drop shadow */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
          borderRadius: "6px",
          padding: "10px 12px",
          boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
        }}
      >
        {/* Eyebrow — sentence case, muted */}
        <p
          style={{
            fontSize: "10px",
            fontWeight: 500,
            color: "#64748B",
            margin: 0,
            letterSpacing: 0,
          }}
        >
          Good morning
        </p>

        {/* Time — Inter semibold, tight tracking, tabular nums */}
        <div
          style={{
            fontSize: "22px",
            fontWeight: 600,
            letterSpacing: "-0.025em",
            color: "#0F172A",
            lineHeight: 1.1,
            marginTop: "2px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          09:45
        </div>
      </div>

      {/* Button + chip row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginTop: "10px",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            height: "28px",
            padding: "0 12px",
            background: "#00AA5B",
            color: "#FFFFFF",
            borderRadius: "6px",
            boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
            fontFamily: '"Inter", "SF Pro Text", system-ui, sans-serif',
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: 0,
          }}
        >
          Check in
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: "20px",
            padding: "0 8px",
            background: "#E6F7EF",
            color: "#00AA5B",
            borderRadius: "4px",
            fontFamily: '"Inter", "SF Pro Text", system-ui, sans-serif',
            fontSize: "10px",
            fontWeight: 500,
            letterSpacing: 0,
          }}
        >
          On time
        </span>
      </div>
    </div>
  );
}
