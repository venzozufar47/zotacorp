import type { Viewport } from "next";

/**
 * Standalone shell for /cake-orders — no employee sidebar / bottom-nav.
 * Mirrors the POS pattern: this is a single-purpose dashboard the
 * staff member opens, fills in, and submits without distraction. The
 * pages themselves render their own back link to /dashboard.
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
    <div className="min-h-screen bg-background">
      <div className="max-w-[1700px] mx-auto px-4 py-4 md:px-6">{children}</div>
    </div>
  );
}
