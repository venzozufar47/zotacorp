import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Playful Geometric Textarea — chunky border, hard violet shadow on focus.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 rounded-xl border-2 border-border bg-white px-3.5 py-2.5 text-base font-medium text-foreground transition-all duration-200 outline-none placeholder:text-muted-foreground/70 placeholder:font-normal focus-visible:border-primary focus-visible:shadow-hard-violet focus-visible:translate-x-[-2px] focus-visible:translate-y-[-2px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:shadow-[4px_4px_0px_0px_var(--destructive)] md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
