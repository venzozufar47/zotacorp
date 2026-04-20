/**
 * Shared focus-expand classNames for editable table cells in the
 * finance feature. Rows stay dense at rest but any focused control
 * floats above its neighbours with a taller hit target + larger
 * text, so the admin can actually read what they're typing without
 * zooming out the entire page.
 *
 * Consumed by: CashflowTable, StatementEditorClient, UploadStatementDialog
 * (preview dropdowns), RuleFormDialog.
 */

// Generic text / date / number input. Resting height ~28px ("h-7"),
// focus ~40px ("h-10") with bigger text + soft ring + elevated shadow.
export const EDIT_INPUT_CLS =
  "h-7 text-xs transition-all focus:h-10 focus:text-sm focus:relative focus:z-10 focus:shadow-lg focus:ring-2 focus:ring-primary/30 focus:bg-background";

// Right-aligned numeric variant (Debit/Kredit). Adds min-width on focus
// so long rupiah values don't get clipped by the narrow column.
export const EDIT_INPUT_NUM_CLS =
  EDIT_INPUT_CLS +
  " text-right font-mono tabular-nums focus:min-w-[160px]";

// Native <select> variant. Can't inherit the Input component, so we
// spell the matching styles out.
export const EDIT_SELECT_CLS =
  "w-full rounded-md border border-input bg-background px-2 py-1 text-xs transition-all focus:text-sm focus:h-10 focus:relative focus:z-10 focus:shadow-lg focus:ring-2 focus:ring-primary/30 focus:outline-none";

// Same as EDIT_INPUT_CLS but with h-8 resting (used in the statement
// editor which already had a slightly taller baseline).
export const EDIT_INPUT_H8_CLS =
  "h-8 text-xs transition-all focus:h-10 focus:text-sm focus:relative focus:z-10 focus:shadow-lg focus:ring-2 focus:ring-primary/30 focus:bg-background";

export const EDIT_INPUT_H8_NUM_CLS =
  EDIT_INPUT_H8_CLS +
  " text-right font-mono tabular-nums focus:min-w-[160px]";

export const EDIT_SELECT_H8_CLS =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground transition-all focus:text-sm focus:h-10 focus:relative focus:z-10 focus:shadow-lg focus:ring-2 focus:ring-primary/30 focus:outline-none";
