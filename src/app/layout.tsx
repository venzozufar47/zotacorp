import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { dictionary, type Language } from "@/lib/i18n/dictionary";
import { LazyToaster } from "@/components/ui/LazyToaster";
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

// Browser tab stays "Zota Corp" for professionalism (users see the tab all
// day — a casual greeting wears out fast). Social/link previews use the
// warm Indonesian greeting so first contact feels human.
export const metadata: Metadata = {
  title: "Zota Corp",
  description: "Zota Corp — employee operations",
  openGraph: {
    title: "Zota Corp",
    description: "Selamat datang orang baik!",
    siteName: "Zota Corp",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Zota Corp",
    description: "Selamat datang orang baik!",
  },
};

const COOKIE_KEY = "zota_lang_v2";
const DEFAULT_LANG: Language = "id";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the language cookie server-side so SSR and hydration start from
  // the same language — no flash. The dictionary subset for the active
  // language is passed as a prop so the client JS only ships ~19KB
  // instead of the full ~38KB (both languages).
  let lang: Language = DEFAULT_LANG;
  try {
    const store = await cookies();
    const raw = store.get(COOKIE_KEY)?.value;
    if (raw === "en" || raw === "id") lang = raw;
  } catch {
    // fallback to default
  }

  return (
    <html lang={lang} className={`${geistSans.variable} ${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <LanguageProvider initialLang={lang} initialDictionary={dictionary[lang]}>
          {children}
          <LazyToaster />
          <Analytics />
          <SpeedInsights />
        </LanguageProvider>
      </body>
    </html>
  );
}
