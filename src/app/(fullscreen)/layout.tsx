import { RouteProgressBar } from "@/components/ui/RouteProgressBar";

/**
 * Minimal chrome-free layout — NO sidebar / topbar / bottom-nav. Used
 * for full-width data views (e.g. the PnL spreadsheet) that the admin
 * opens in a new tab to maximize screen real estate. Auth gating is
 * per-page (each page guards admin itself), same as the (admin) group.
 */
export default function FullscreenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-background">
      <RouteProgressBar />
      <main className="w-full px-3 py-3 md:px-4 md:py-4">{children}</main>
    </div>
  );
}
