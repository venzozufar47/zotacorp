import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Geist, Poppins } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import "./globals.css";

/**
 * Fonts — only ship what the design actually uses.
 *  - Geist Sans is the body font.
 *  - Poppins is used for headings and the `.font-display` utility. We load
 *    only the three weights we actually render (normal / semi-bold / bold).
 *    Adding an 800 weight previously pulled down another ~20KB WOFF file
 *    on every first visit.
 *  - `display: "swap"` makes the browser paint fallback text immediately
 *    instead of holding back FCP while the WOFF streams in.
 *  - Geist Mono was dropped entirely; the sole usage (an inline <code> in
 *    error.tsx) now falls back to the system monospace stack.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

/**
 * Toaster is pulled in lazily. It isn't needed for the first paint — no
 * toast is ever queued before hydration — and it transitively loads
 * `sonner` + five lucide icons + `next-themes`, which together add a
 * noticeable chunk to every route's initial bundle.
 */
const Toaster = dynamic(
  () => import("@/components/ui/sonner").then((m) => m.Toaster),
  { ssr: false }
);

export const metadata: Metadata = {
  title: "Zota Corp",
  description: "Employee Dashboard — Zota Corp",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <LanguageProvider>
          {children}
          <Toaster position="top-center" richColors />
          <SpeedInsights />
        </LanguageProvider>
      </body>
    </html>
  );
}
