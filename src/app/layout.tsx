import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter, Outfit, Plus_Jakarta_Sans, Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { dictionary, type Language } from "@/lib/i18n/dictionary";
import { LazyToaster } from "@/components/ui/LazyToaster";
import { getCachedTheme } from "@/lib/supabase/cached";
import { DEFAULT_THEME } from "@/lib/themes";
import "./globals.css";

/**
 * Fonts — only ship what the Playful Geometric design system needs.
 *  - Plus Jakarta Sans is the body font: highly legible, modern,
 *    geometric-but-humanist. We load 400 (regular) and 500 (medium).
 *  - Outfit is the display/heading font: a geometric sans with
 *    rounded letter terminals that read as friendly. We load 700
 *    (bold) and 800 (extra-bold) — the only two weights the design
 *    system actually renders for headings and the .clock-display.
 *  - `display: "swap"` makes the browser paint fallback text
 *    immediately instead of holding back FCP while the WOFF streams.
 */
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  // 400/500 for body, 600/700 used by legacy call-sites.
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
});

// Inter is the Minimal theme's primary font. It's the industry default for
// modern SaaS UIs (Slack, Linear, Notion, Vercel) because its open
// apertures and tight metrics keep information-dense screens legible at
// small sizes. We load 400/500/600/700 to cover body / UI / emphasis /
// headings without pulling the full variable file.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Poppins is the Oceanic theme's display font — the geometric, slightly
// condensed sans used in the original Zota editorial aesthetic. 400 for
// occasional body use, 600/700 for headings and the `.clock-display`
// utility that originated with this theme.
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

  // Org-wide UI theme — admin picks this in Settings → Theme. Applied
  // via data-theme so every CSS custom property cascades from the theme
  // block in globals.css. Falls back to DEFAULT_THEME if the settings
  // row is missing (first boot) or the fetch fails for any reason.
  let theme = DEFAULT_THEME;
  try {
    theme = await getCachedTheme();
  } catch {
    // keep default
  }

  return (
    <html
      lang={lang}
      data-theme={theme}
      className={`${jakarta.variable} ${outfit.variable} ${inter.variable} ${poppins.variable} h-full antialiased`}
    >
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
