import type { Viewport } from "next";

/**
 * Standalone shell for /cake-production — no employee chrome.
 * Production team usually has this open as a single-purpose checklist
 * on a phone or tablet during a baking session. POS-style.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function CakeProductionLayout({
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
