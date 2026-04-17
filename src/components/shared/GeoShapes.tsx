/**
 * Decorative geometric shapes for the Playful Geometric design system.
 *
 * Memphis-inspired primitives that bring playful motion to backgrounds and
 * empty spaces. All shapes:
 *   - are aria-hidden (purely visual)
 *   - hide on mobile via `hidden md:block` to avoid clutter on small screens
 *   - inherit color via Tailwind classes that map to the rotating palette
 *     (violet / pink / amber / emerald)
 */

import { cn } from "@/lib/utils";

type ColorName = "violet" | "pink" | "amber" | "emerald";

const COLOR_MAP: Record<ColorName, string> = {
  violet: "bg-primary",
  pink: "bg-pop-pink",
  amber: "bg-tertiary",
  emerald: "bg-quaternary",
};

const STROKE_COLOR: Record<ColorName, string> = {
  violet: "var(--primary)",
  pink: "var(--pop-pink)",
  amber: "var(--tertiary)",
  emerald: "var(--quaternary)",
};

interface BaseProps {
  className?: string;
  color?: ColorName;
  size?: number;
  hideOnMobile?: boolean;
}

/**
 * Filled circle with a chunky dark border. Position via parent with
 * absolute positioning + the className prop.
 */
export function FloatingCircle({
  className,
  color = "amber",
  size = 24,
  hideOnMobile = true,
}: BaseProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block rounded-full border-2 border-foreground",
        COLOR_MAP[color],
        hideOnMobile && "hidden md:inline-block",
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Filled triangle with a chunky dark border.
 */
export function FloatingTriangle({
  className,
  color = "emerald",
  size = 32,
  hideOnMobile = true,
  rotate = 0,
}: BaseProps & { rotate?: number }) {
  const stroke = STROKE_COLOR[color];
  const fill = STROKE_COLOR[color];
  return (
    <span
      aria-hidden
      className={cn("inline-block", hideOnMobile && "hidden md:inline-block", className)}
      style={{ width: size, height: size, transform: `rotate(${rotate}deg)` }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon
          points="16,4 28,28 4,28"
          fill={fill}
          stroke="var(--foreground)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* fallback line so SVG inherits color even if currentColor is used */}
        <line x1="0" y1="0" x2="0" y2="0" stroke={stroke} />
      </svg>
    </span>
  );
}

/**
 * Squiggle — wavy SVG line. Often used as a section divider.
 */
export function SquiggleDivider({
  className,
  color = "violet",
  width = 100,
  hideOnMobile = false,
}: BaseProps & { width?: number }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block", hideOnMobile && "hidden md:inline-block", className)}
    >
      <svg width={width} height="20" viewBox="0 0 100 20" fill="none">
        <path
          d="M2 10 Q 12 2, 24 10 T 48 10 T 72 10 T 96 10"
          stroke={STROKE_COLOR[color]}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </span>
  );
}

/**
 * Tileable dot pattern overlay. Use as a subtle background texture.
 */
export function DotPattern({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("absolute inset-0 bg-dots-light pointer-events-none", className)}
    />
  );
}

/**
 * Confetti cluster — a few scattered shapes near a hero element.
 * Hides on mobile to avoid cramping the layout.
 */
export function ConfettiScatter({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("hidden md:block absolute pointer-events-none", className)}>
      <FloatingCircle color="amber" size={12} className="absolute top-0 left-0" />
      <FloatingCircle color="pink" size={8} className="absolute top-8 left-12" />
      <FloatingTriangle color="emerald" size={14} rotate={20} className="absolute top-2 left-20" />
    </div>
  );
}
