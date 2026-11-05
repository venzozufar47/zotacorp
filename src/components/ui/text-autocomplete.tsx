"use client"

import * as React from "react"
import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete"

import { cn } from "@/lib/utils"

/**
 * Input teks bebas + saran dropdown bergaya sistem (Base UI Autocomplete).
 *
 * Pengganti `<input list>` + `<datalist>`: datalist dirender browser,
 * mencampur riwayat autofill ("Saved data") dan tidak bisa di-style.
 * Di sini nilai tetap teks bebas (boleh di luar saran); saran hanya
 * membantu mengisi. Autofill browser dimatikan.
 */
interface TextAutocompleteProps {
  value: string
  onValueChange: (value: string) => void
  options: readonly string[]
  placeholder?: string
  /** Teks pendek di kanan tiap saran (mis. cabang karyawan). */
  hint?: (option: string) => string | undefined
  className?: string
  inputClassName?: string
  disabled?: boolean
  "aria-label"?: string
}

function TextAutocomplete({
  value,
  onValueChange,
  options,
  placeholder,
  hint,
  className,
  inputClassName,
  disabled,
  "aria-label": ariaLabel,
}: TextAutocompleteProps) {
  return (
    <AutocompletePrimitive.Root
      items={options}
      value={value}
      onValueChange={(v) => onValueChange(v)}
      openOnInputClick
      disabled={disabled}
    >
      <div className={cn("relative", className)}>
        <AutocompletePrimitive.Input
          autoComplete="off"
          data-lpignore="true"
          data-form-type="other"
          aria-label={ariaLabel}
          placeholder={placeholder}
          className={cn(
            "h-8 w-full min-w-0 rounded-lg border-2 border-border bg-white px-3 text-sm font-medium text-foreground outline-none transition-all duration-200 placeholder:font-normal placeholder:text-muted-foreground/70 focus-visible:border-primary disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
            inputClassName
          )}
        />
      </div>
      <AutocompletePrimitive.Portal>
        <AutocompletePrimitive.Positioner
          sideOffset={6}
          align="start"
          className="isolate z-50"
        >
          <AutocompletePrimitive.Popup className="max-h-64 w-(--anchor-width) min-w-48 overflow-y-auto overflow-x-hidden rounded-xl border-2 border-foreground bg-popover text-popover-foreground shadow-hard empty:hidden">
            <AutocompletePrimitive.List className="p-1">
              {(option: string) => (
                <AutocompletePrimitive.Item
                  key={option}
                  value={option}
                  className="flex cursor-default items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="truncate">{option}</span>
                  {hint?.(option) ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {hint(option)}
                    </span>
                  ) : null}
                </AutocompletePrimitive.Item>
              )}
            </AutocompletePrimitive.List>
          </AutocompletePrimitive.Popup>
        </AutocompletePrimitive.Positioner>
      </AutocompletePrimitive.Portal>
    </AutocompletePrimitive.Root>
  )
}

export { TextAutocomplete }
