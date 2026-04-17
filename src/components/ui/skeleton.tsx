import { cn } from "@/lib/utils"

/**
 * Playful Geometric Skeleton — chunky rounded loader.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-xl bg-muted/80", className)}
      {...props}
    />
  )
}

export { Skeleton }
