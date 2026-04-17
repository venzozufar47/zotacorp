import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Playful Geometric Button — "Candy Button"
 *
 * Visual signatures:
 *  - Pill shape (rounded-full)
 *  - Chunky 2px dark border
 *  - Hard offset shadow (no blur)
 *  - Bouncy press: lift on hover, press down on active
 *  - Bold display font (Outfit)
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border-2 font-display font-bold text-sm whitespace-nowrap outline-none select-none transition-all duration-200 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-foreground shadow-hard hover:shadow-hard-hover hover:-translate-y-0.5 active:shadow-hard-active active:translate-y-0.5 focus-visible:shadow-hard-violet",
        outline:
          "bg-background text-foreground border-foreground shadow-hard hover:bg-tertiary hover:shadow-hard-hover hover:-translate-y-0.5 active:shadow-hard-active active:translate-y-0.5",
        secondary:
          "bg-muted text-foreground border-foreground shadow-hard hover:shadow-hard-hover hover:-translate-y-0.5 active:shadow-hard-active active:translate-y-0.5",
        tertiary:
          "bg-tertiary text-foreground border-foreground shadow-hard hover:shadow-hard-hover hover:-translate-y-0.5 active:shadow-hard-active active:translate-y-0.5",
        pink:
          "bg-pop-pink text-foreground border-foreground shadow-hard hover:shadow-hard-hover hover:-translate-y-0.5 active:shadow-hard-active active:translate-y-0.5",
        emerald:
          "bg-quaternary text-foreground border-foreground shadow-hard hover:shadow-hard-hover hover:-translate-y-0.5 active:shadow-hard-active active:translate-y-0.5",
        ghost:
          "border-transparent shadow-none text-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
        destructive:
          "bg-destructive text-white border-foreground shadow-hard hover:shadow-hard-hover hover:-translate-y-0.5 active:shadow-hard-active active:translate-y-0.5",
        link:
          "border-transparent shadow-none text-primary underline-offset-4 hover:underline rounded-none",
      },
      size: {
        default: "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 px-3 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1 px-3.5 text-[0.8rem] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-6 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-10 rounded-full p-0",
        "icon-xs": "size-7 rounded-full p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 rounded-full p-0",
        "icon-lg": "size-12 rounded-full p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
