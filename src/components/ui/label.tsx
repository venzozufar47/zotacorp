"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Playful Geometric Label
 *
 * Uppercase, bold, slightly tracked — gives forms a confident, friendly tone.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 font-display text-[0.6875rem] font-bold uppercase tracking-[0.12em] leading-none text-foreground select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
