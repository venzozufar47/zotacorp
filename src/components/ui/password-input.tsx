"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Password field with a minimal show/hide (eye) toggle. Drop-in for
 * `<Input type="password" />` — forwards every input prop and works both
 * controlled (value/onChange) and uncontrolled (name + FormData). The
 * toggle is `tabIndex={-1}` so keyboard flow skips straight from the
 * field to the submit button; it only flips the visible characters and
 * never touches the value.
 */
export function PasswordInput({
  className,
  iconSize = 16,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type"> & {
  /** Eye icon size in px. Default 16. */
  iconSize?: number;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={show ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={show ? "Sembunyikan password" : "Lihat password"}
        title={show ? "Sembunyikan password" : "Lihat password"}
        tabIndex={-1}
      >
        {show ? <EyeOff size={iconSize} /> : <Eye size={iconSize} />}
      </button>
    </div>
  );
}
