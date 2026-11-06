"use client"

import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export interface PersonOption {
  id: string
  name: string
}

/**
 * Pilih satu orang dengan mengetik: daftar menyempit sesuai ketikan.
 * Nilai selalu salah satu opsi (atau kosong), tidak seperti `TextAutocomplete`
 * yang menerima teks bebas. `value` berisi id; kosong = tidak memilih.
 */
function PersonCombobox({
  value,
  onValueChange,
  options,
  placeholder = "Ketik nama",
  emptyText = "Nama tidak ditemukan",
  className,
  "aria-label": ariaLabel,
}: {
  value: string
  onValueChange: (id: string) => void
  options: readonly PersonOption[]
  placeholder?: string
  emptyText?: string
  className?: string
  "aria-label"?: string
}) {
  const selected = options.find((o) => o.id === value) ?? null

  return (
    <ComboboxPrimitive.Root
      items={options as PersonOption[]}
      value={selected}
      onValueChange={(item) => onValueChange(item?.id ?? "")}
      itemToStringLabel={(item) => item.name}
      isItemEqualToValue={(a, b) => a.id === b.id}
      autoHighlight
    >
      <div className={cn("relative", className)}>
        <ComboboxPrimitive.Input
          autoComplete="off"
          data-lpignore="true"
          data-form-type="other"
          aria-label={ariaLabel}
          placeholder={placeholder}
          className="h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        {selected && (
          <ComboboxPrimitive.Clear
            aria-label="Hapus pilihan"
            className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon size={16} />
          </ComboboxPrimitive.Clear>
        )}
      </div>
      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner sideOffset={6} align="start" className="isolate z-50">
          <ComboboxPrimitive.Popup className="max-h-64 w-(--anchor-width) min-w-48 overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
            <ComboboxPrimitive.Empty className="px-3 py-3 text-sm text-muted-foreground empty:hidden">
              {emptyText}
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List className="p-1">
              {(option: PersonOption) => (
                <ComboboxPrimitive.Item
                  key={option.id}
                  value={option}
                  className="flex min-h-10 cursor-default items-center rounded-lg px-2.5 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="truncate">{option.name}</span>
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  )
}

export { PersonCombobox }
