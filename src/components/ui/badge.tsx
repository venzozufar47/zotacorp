import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Playful Geometric Badge — sticker pill
 *
 * Visual signatures:
 *  - Pill shape (rounded-full)
 *  - 2px dark border (chunky)
 *  - Bold display font, slightly tracked
 *  - Rotating color variants for the playful confetti palette
 */
const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border-2 border-foreground px-2.5 py-0.5 text-[0.6875rem] font-display font-bold uppercase tracking-wide whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-0 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-pop-pink text-foreground",
        tertiary: "bg-tertiary text-foreground",
        quaternary: "bg-quaternary text-foreground",
        destructive:
          "bg-destructive text-white",
        outline:
          "bg-background text-foreground",
        muted:
          "bg-muted text-foreground border-border",
        ghost:
          "border-transparent hover:bg-muted hover:text-foreground",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
