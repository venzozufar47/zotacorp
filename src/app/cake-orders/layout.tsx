import type { Viewport } from "next";
import "@/styles/haengbocake.css";

/**
 * Standalone shell for /cake-orders — no employee sidebar / bottom-nav.
 * Mirrors the POS pattern: this is a single-purpose dashboard the
 * staff member opens, fills in, and submits without distraction. The
 * pages themselves render their own back link to /dashboard.
 *
 * The `data-haengbocake` attribute scopes the Haengbocake color tokens
 * (cream surface, navy ink, Pare/Sem pastels, urgency colors) to this
 * route only. Defined in `src/styles/haengbocake.css`.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function CakeOrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-haengbocake
      className="min-h-screen"
      style={{ background: "var(--cake-bg)", color: "var(--cake-fg)" }}
    >
      <div className="max-w-[1700px] mx-auto px-4 py-4 md:px-6">{children}</div>
    </div>
  );
}
