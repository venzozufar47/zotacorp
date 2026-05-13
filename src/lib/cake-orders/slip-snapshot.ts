import type {
  CakeOptionsByKind,
  CakeOrder,
  CakeSlipDiff,
  CakeSlipSnapshot,
  CakeSlipSnapshotItem,
} from "./types";

/**
 * Build a frozen snapshot of slip items + their order specs as of
 * "now". Resolves option ids to labels so the snapshot stays
 * stable even if admin later edits the cake_options master data.
 */
export function buildSlipSnapshot(opts: {
  takenBy: string;
  notes: string | null;
  itemsWithOrder: Array<{
    cake_order_id: string;
    sort_order: number;
    order: CakeOrder;
  }>;
  optionsByKind: CakeOptionsByKind;
}): CakeSlipSnapshot {
  const labelOf = (kind: keyof CakeOptionsByKind, id: string | null) => {
    if (!id) return null;
    return opts.optionsByKind[kind].find((o) => o.id === id)?.label ?? null;
  };
  const items: CakeSlipSnapshotItem[] = opts.itemsWithOrder.map((row) => {
    const o = row.order;
    return {
      orderId: o.id,
      branch: o.branch,
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      baseLabel: labelOf("base_cake", o.base_cake_option_id) ?? "—",
      shapeLabel: labelOf("shape", o.shape_option_id) ?? "—",
      shapeCustom: o.shape_custom,
      dimensionCm: o.dimension_cm,
      fillingLabel: labelOf("filling", o.filling_option_id),
      colorNotes: o.color_notes,
      textureNotes: o.texture_notes,
      decorationNotes: o.decoration_notes,
      accessoriesNotes: o.accessories_notes,
      greetingCard: o.greeting_card,
      deliveryLabel: labelOf("delivery", o.delivery_option_id) ?? "—",
      deliveryAddress: o.delivery_address,
      scheduledAt: o.scheduled_at,
      sortOrder: row.sort_order,
    };
  });
  return {
    takenAt: new Date().toISOString(),
    takenBy: opts.takenBy,
    notes: opts.notes,
    items,
  };
}

/**
 * Compare two snapshots field-by-field. Returns null when the two
 * are equivalent so the caller can avoid spurious banners.
 *
 * Items are matched by orderId. Fields with the same before/after
 * (including both null) are skipped. Empty `added`/`removed`/`modified`
 * triples on a non-null result indicate "no item-level changes" — we
 * still treat that as null to keep the banner pristine.
 */
export function diffSnapshots(
  prev: CakeSlipSnapshot,
  next: CakeSlipSnapshot
): CakeSlipDiff | null {
  const prevById = new Map(prev.items.map((i) => [i.orderId, i]));
  const nextById = new Map(next.items.map((i) => [i.orderId, i]));

  const added: CakeSlipDiff["added"] = [];
  const removed: CakeSlipDiff["removed"] = [];
  const modified: CakeSlipDiff["modified"] = [];

  for (const [id, item] of nextById) {
    if (!prevById.has(id)) {
      added.push({ orderId: id, customerName: item.customerName });
    }
  }
  for (const [id, item] of prevById) {
    if (!nextById.has(id)) {
      removed.push({ orderId: id, customerName: item.customerName });
    }
  }

  // Field-by-field diff for items present in both snapshots. We use
  // user-visible labels (not raw column names) so the banner reads
  // naturally on the production team's screen.
  const FIELDS: Array<{
    key: keyof CakeSlipSnapshotItem;
    label: string;
  }> = [
    { key: "customerPhone", label: "No HP" },
    { key: "baseLabel", label: "Base" },
    { key: "shapeLabel", label: "Bentuk" },
    { key: "shapeCustom", label: "Bentuk custom" },
    { key: "dimensionCm", label: "Diameter" },
    { key: "fillingLabel", label: "Filling" },
    { key: "colorNotes", label: "Warna" },
    { key: "textureNotes", label: "Tekstur" },
    { key: "decorationNotes", label: "Tulisan" },
    { key: "accessoriesNotes", label: "Aksesoris" },
    { key: "greetingCard", label: "Greeting Card" },
    { key: "deliveryLabel", label: "Pengiriman" },
    { key: "deliveryAddress", label: "Alamat" },
    { key: "scheduledAt", label: "Jadwal" },
  ];

  for (const [id, nextItem] of nextById) {
    const prevItem = prevById.get(id);
    if (!prevItem) continue;
    const fields: CakeSlipDiff["modified"][number]["fields"] = [];
    for (const f of FIELDS) {
      const a = prevItem[f.key] ?? null;
      const b = nextItem[f.key] ?? null;
      if (a !== b) {
        fields.push({
          label: f.label,
          before: a === null ? null : String(a),
          after: b === null ? null : String(b),
        });
      }
    }
    if (fields.length > 0) {
      modified.push({
        orderId: id,
        customerName: nextItem.customerName,
        fields,
      });
    }
  }

  if (added.length === 0 && removed.length === 0 && modified.length === 0) {
    return null;
  }
  return {
    computedAt: new Date().toISOString(),
    added,
    removed,
    modified,
  };
}
