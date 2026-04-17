/**
 * Theme Registry
 *
 * The org-wide dashboard theme is stored in `attendance_settings.ui_theme`
 * and applied via a `data-theme` attribute on the root `<html>` element.
 * Each theme's CSS tokens live in `src/app/globals.css` under a
 * `[data-theme="<name>"]` selector. Adding a new theme means:
 *
 *   1. Add an entry to `THEMES` below.
 *   2. Add a CHECK constraint value on `attendance_settings.ui_theme`.
 *   3. Add a `[data-theme="<name>"] { ... }` block in globals.css with the
 *      same custom-property surface area as the Playful theme.
 *
 * The theme name is intentionally a short slug — it's what the admin sees
 * in the Settings picker and also what's written to the DB.
 */

export type ThemeName = "playful" | "minimal" | "oceanic";

export interface ThemeDefinition {
  /** Stable slug — matches DB value and the `data-theme` attribute. */
  id: ThemeName;
  /** Short display label shown in the admin picker. */
  label: string;
  /** One-line description shown under the label. */
  description: string;
  /**
   * A tiny 3-color swatch used in the picker card — pulled straight from
   * the theme's CSS tokens. Rendered as three circles.
   */
  swatch: readonly [string, string, string];
  /**
   * Typography preview label — shown in the picker card so the admin can
   * see the feel before applying.
   */
  vibe: string;
}

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: "playful",
    label: "Playful Geometric",
    description:
      "Memphis-inspired pastel palette with hard shadows, bouncy animations, and pill-shaped controls.",
    swatch: ["#8B5CF6", "#F472B6", "#FBBF24"],
    vibe: "Friendly · Tactile · Pop",
  },
  {
    id: "minimal",
    label: "Minimal",
    description:
      "Clean SaaS aesthetic with confident emerald accents, hairline borders, and subtle motion. Inspired by Slack & Gojek.",
    swatch: ["#10B981", "#0F172A", "#F8FAFC"],
    vibe: "Clean · Quiet · Modern",
  },
  {
    id: "oceanic",
    label: "Oceanic Editorial",
    description:
      "The original Zota aesthetic — Apple-inspired editorial layout with oceanic teal gradients, soft blurred shadows, and Poppins display typography.",
    swatch: ["#005a65", "#007a88", "#f5f5f7"],
    vibe: "Editorial · Calm · Professional",
  },
];

/**
 * Fallback theme applied when no valid value is resolved from the
 * `attendance_settings.ui_theme` RPC (fresh DB, offline, transient
 * failure). Oceanic Editorial is the original Zota aesthetic and
 * the safest "looks like a real product" baseline if the admin
 * hasn't made a deliberate pick yet.
 */
export const DEFAULT_THEME: ThemeName = "oceanic";

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && THEMES.some((t) => t.id === value);
}

export function getTheme(value: string | null | undefined): ThemeName {
  return isThemeName(value) ? value : DEFAULT_THEME;
}
