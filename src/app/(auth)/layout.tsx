import { getDictionary } from "@/lib/i18n/server";
import { AuthLanguageSwitcher } from "@/components/auth/AuthLanguageSwitcher";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = await getDictionary();
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background bg-dots-light px-4 py-12 overflow-hidden">
      {/* Language toggle — lets users flip ID/EN before signing in */}
      <AuthLanguageSwitcher />
      {/*
       * Decoration groups — each theme toggles exactly one via CSS in
       * globals.css (search `.auth-decor-`). Both groups are rendered
       * in the DOM so theme switches feel instant; only one is
       * `display: block` at a time.
       *
       *   auth-decor-playful  → Memphis geometric shapes (default)
       *   auth-decor-oceanic  → soft teal radial glows (editorial)
       *   (minimal)           → no decoration; CSS hides both groups
       */}

      {/* Playful Geometric — Memphis shapes */}
      <div className="auth-decor auth-decor-playful">
        <div
          aria-hidden
          className="hidden md:block absolute top-12 -left-16 size-56 rounded-full bg-tertiary/40 border-2 border-foreground"
        />
        <div
          aria-hidden
          className="hidden md:block absolute -bottom-20 -right-12 size-72 rounded-full bg-pop-pink/30 border-2 border-foreground"
        />
        <div aria-hidden className="hidden md:block absolute top-20 right-24">
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
            <polygon
              points="30,5 55,55 5,55"
              fill="var(--quaternary)"
              stroke="var(--foreground)"
              strokeWidth="3"
              strokeLinejoin="round"
              transform="rotate(15 30 30)"
            />
          </svg>
        </div>
        <div aria-hidden className="hidden md:block absolute bottom-24 left-32">
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            className="animate-spin-slow"
          >
            <path
              d="M2 24 Q 12 8, 24 24 T 46 24"
              stroke="var(--primary)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
        <div aria-hidden className="hidden md:block absolute top-1/3 left-16">
          <div className="size-8 rounded-full border-2 border-foreground bg-quaternary" />
        </div>
      </div>

      {/* Oceanic Editorial — soft teal radial glows */}
      <div className="auth-decor auth-decor-oceanic">
        <div aria-hidden className="auth-glow auth-glow-tl" />
        <div aria-hidden className="auth-glow auth-glow-br" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand mark — tosca logo reads well on the light surface of
            all three themes. The decorative Z-badge that lived here
            previously is replaced with the official wordmark. */}
        <div className="text-center mb-8 animate-bounce-up">
          <img
            src="/zota-corp-full-logo-tosca.png"
            alt="Zota Corp"
            className="h-16 md:h-20 w-auto mx-auto mb-2 select-none"
          />
          <p className="text-muted-foreground text-sm mt-3 font-medium">
            {t.authLayout.tagline}
          </p>
        </div>
        <div className="animate-bounce-up animate-bounce-up-delay-1">
          {children}
        </div>
      </div>
    </div>
  );
}
