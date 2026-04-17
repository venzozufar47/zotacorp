"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/**
 * Playful Geometric Toaster — sticker-style toasts with hard shadow.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--foreground)",
          "--border-radius": "1rem",
          "--success-bg": "var(--quaternary)",
          "--success-text": "var(--foreground)",
          "--success-border": "var(--foreground)",
          "--error-bg": "var(--destructive)",
          "--error-text": "#ffffff",
          "--error-border": "var(--foreground)",
          "--warning-bg": "var(--tertiary)",
          "--warning-text": "var(--foreground)",
          "--warning-border": "var(--foreground)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast !border-2 !border-foreground !shadow-hard !rounded-2xl !font-medium",
          title: "!font-display !font-bold !text-foreground",
          description: "!text-foreground/80",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
