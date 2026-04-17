import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * Playful Geometric Input
 *
 * Visual signatures:
 *  - Chunky 2px border (slate-300 default, foreground when focused)
 *  - Hard violet shadow on focus (instead of soft ring)
 *  - 0.75rem radius (rounded-xl) — not pill, more rectangular
 *  - White background (always — even on cream page)
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-xl border-2 border-border bg-white px-3.5 py-2 text-base font-medium text-foreground transition-all duration-200 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-bold file:text-foreground placeholder:text-muted-foreground/70 placeholder:font-normal focus-visible:border-primary focus-visible:shadow-hard-violet focus-visible:translate-x-[-2px] focus-visible:translate-y-[-2px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:shadow-[4px_4px_0px_0px_var(--destructive)] md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
