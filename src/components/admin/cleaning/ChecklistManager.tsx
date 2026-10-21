"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Camera,
  CameraOff,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Power,
  Pencil,
  Check,
  X,
  ImagePlus,
  Loader2,
  Copy,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { cleaningRefUrl, uploadCleaningRef } from "@/lib/utils/cleaning-refs";
import { useRunAction } from "./useRunAction";
import { setItemAiGate } from "@/lib/actions/cleaning-sop.actions";
import { ChecklistGovernance } from "./ChecklistGovernance";
import type { CleaningEmployee } from "./types";
import {
  createChecklist,
  updateChecklist,
  deleteChecklist,
  duplicateChecklist,
  setChecklistActive,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  reorderItems,
  addItemPhoto,
  updateItemPhoto,
  deleteItemPhoto,
  type BranchDutyRow,
  type CleaningAssignmentRow,
  type CleaningChecklist,
  type CleaningItem,
  type ItemPhoto,
} from "@/lib/actions/cleaning.actions";

const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** Bitmask hari (bit 0 = Minggu) → "Setiap hari" / "Sen–Sab" / "Sen, Rab, Jum". */
function daysLabel(mask: number): string {
  const on = DAY_SHORT.map((_, i) => (mask & (1 << i)) !== 0);
  if (on.every(Boolean)) return "Setiap hari";
  const idx = on.flatMap((v, i) => (v ? [i] : []));
  if (idx.length === 0) return "—";
  const contiguous = idx.every((d, k) => k === 0 || d === idx[k - 1] + 1);
  if (contiguous && idx.length > 2) return `${DAY_SHORT[idx[0]]}–${DAY_SHORT[idx[idx.length - 1]]}`;
  return idx.map((d) => DAY_SHORT[d]).join(", ");
}

function windowLabel(a: { window_mode: string; window_start: string | null; window_end: string | null }): string {
  if (a.window_mode === "before" && a.window_end) return `sebelum ${a.window_end}`;
  if (a.window_mode === "after" && a.window_start) return `setelah ${a.window_start}`;
  if (a.window_mode === "between" && a.window_start && a.window_end) return `${a.window_start}–${a.window_end}`;
  return "kapan saja";
}

/** Kelompok tampilan checklist: dari nama ("… Semarang", "… Pare", "Yeobo Solo — …"). */
function groupOf(name: string): string {
  const cake = name.match(/\b(Semarang|Pare)\b/i);
  if (cake) return `Haengbocake ${cake[1][0].toUpperCase()}${cake[1].slice(1).toLowerCase()}`;
  const yeobo = name.match(/^Yeobo\s+(\S+)/i);
  if (yeobo) return `Yeobo ${yeobo[1]}`;
  return "Lainnya";
}

export function ChecklistManager({
  initial,
  employees = [],
  assignments = [],
  branchDuties = [],
  onEditSchedule,
  onEditDuty,
}: {
  initial: CleaningChecklist[];
  employees?: CleaningEmployee[];
  /** Penugasan per orang — untuk ringkasan "siapa, kapan" di tiap checklist. */
  assignments?: CleaningAssignmentRow[];
  /** Buka tab Penugasan, disaring ke checklist ini — tempat hari & jam diubah. */
  onEditSchedule?: (checklistId: string) => void;
  /** Duty cabang — checklist yang ditugaskan lewat giliran cabang (bukan per orang). */
  branchDuties?: BranchDutyRow[];
  /** Buka tab Duty cabang. */
  onEditDuty?: () => void;
}) {
  const { run, pending, startTransition, router } = useRunAction();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});

  const q = query.trim().toLowerCase();
  const visible = initial.filter((cl) => {
    if (!q) return true;
    const people = assignments.filter((a) => a.checklist_id === cl.id).map((a) => a.user_name);
    return [cl.name, cl.owner_name ?? "", ...people].some((t) => t.toLowerCase().includes(q));
  });
  const groups = [...new Set(visible.map((cl) => groupOf(cl.name)))].sort((a, b) =>
    a === "Lainnya" ? 1 : b === "Lainnya" ? -1 : a.localeCompare(b)
  );

  function onCreate() {
    const n = name.trim();
    if (!n) {
      toast.error("Nama checklist wajib diisi");
      return;
    }
    startTransition(async () => {
      const res = await createChecklist({ name: n, description: desc.trim() });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Checklist "${n}" dibuat`);
      setName("");
      setDesc("");
      setOpen((o) => ({ ...o, [res.id]: true }));
      setShowCreate(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Cari + checklist baru */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari checklist, pemilik, atau orang yang ditugaskan"
            className="pl-8"
          />
        </div>
        <Button type="button" variant={showCreate ? "outline" : "default"} onClick={() => setShowCreate((v) => !v)} className="gap-1.5">
          <Plus size={14} />
          {showCreate ? "Batal" : "Checklist baru"}
        </Button>
      </div>

      {showCreate && (
      <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <h2 className="font-display text-base font-semibold">Buat checklist baru</h2>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama (mis. Buka toko)"
            className="flex-1 min-w-[12rem]"
          />
          <Input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Deskripsi (opsional)"
            className="flex-1 min-w-[12rem]"
          />
          <Button type="button" onClick={onCreate} disabled={pending} className="gap-1.5">
            <Plus size={14} />
            Buat
          </Button>
        </div>
      </section>
      )}

      {initial.length === 0 && (
        <p className="text-sm text-muted-foreground italic px-1">
          Belum ada checklist. Tekan &ldquo;Checklist baru&rdquo; di atas.
        </p>
      )}
      {initial.length > 0 && visible.length === 0 && (
        <p className="text-sm text-muted-foreground italic px-1">Tidak ada checklist yang cocok dengan &ldquo;{query}&rdquo;.</p>
      )}

      {groups.map((g) => {
        const list = visible.filter((cl) => groupOf(cl.name) === g);
        // Saat mencari, semua kelompok terbuka supaya hasilnya langsung terlihat.
        const collapsed = !q && !!closedGroups[g];
        return (
          <div key={g} className="space-y-2">
            <button
              type="button"
              onClick={() => setClosedGroups((c) => ({ ...c, [g]: !c[g] }))}
              className="flex w-full items-center gap-1.5 px-1 pt-1 text-left font-display text-[12px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              {g}
              <span className="font-normal normal-case tracking-normal">· {list.length} checklist</span>
            </button>
            {!collapsed &&
              list.map((cl) => (
                <ChecklistCard
                  key={cl.id}
                  checklist={cl}
                  employees={employees}
                  assigned={assignments.filter((a) => a.checklist_id === cl.id && a.is_active)}
                  onEditSchedule={onEditSchedule}
                  duty={branchDuties.find((d) => d.is_active && d.slots.some((s) => s.checklist_id === cl.id)) ?? null}
                  onEditDuty={onEditDuty}
                  open={!!open[cl.id]}
                  onToggleOpen={() => setOpen((o) => ({ ...o, [cl.id]: !o[cl.id] }))}
                  pending={pending}
                  run={run}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}

function ChecklistCard({
  checklist: cl,
  employees,
  assigned,
  duty,
  onEditSchedule,
  onEditDuty,
  open,
  onToggleOpen,
  pending,
  run,
}: {
  checklist: CleaningChecklist;
  employees: CleaningEmployee[];
  assigned: CleaningAssignmentRow[];
  duty: BranchDutyRow | null;
  onEditSchedule?: (checklistId: string) => void;
  onEditDuty?: () => void;
  open: boolean;
  onToggleOpen: () => void;
  pending: boolean;
  run: (
    fn: () => Promise<{ ok: true } | { error: string } | { ok: true; id: string }>,
    ok?: string
  ) => void;
}) {
  const [itemTitle, setItemTitle] = useState("");
  const [itemNote, setItemNote] = useState("");
  const [itemPhoto, setItemPhoto] = useState(true);

  // Ringkasan satu baris: siapa yang mengerjakan & kapan, pemilik SOP, dan gate AI token.
  const gateMin = cl.items.map((i) => i.ai_gate_min).find((v) => v != null) ?? null;
  const summary = [
    assigned.length > 0
      ? `${assigned
          .slice(0, 2)
          .map((a) => `${a.user_name} · ${daysLabel(a.weekdays)}, ${windowLabel(a)}`)
          .join(" | ")}${assigned.length > 2 ? ` +${assigned.length - 2}` : ""}`
      : null,
    duty
      ? `Duty ${duty.location_name} · ${daysLabel(duty.weekdays)}, ${windowLabel(duty)} · giliran ${duty.pool.length} orang`
      : null,
    cl.owner_name ? `Pemilik ${cl.owner_name}` : null,
    gateMin != null ? `AI token ≥ ${gateMin} kWh` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const [editingHeader, setEditingHeader] = useState(false);
  const [headerName, setHeaderName] = useState(cl.name);
  const [headerDesc, setHeaderDesc] = useState(cl.description ?? "");

  function startEditHeader() {
    setHeaderName(cl.name);
    setHeaderDesc(cl.description ?? "");
    setEditingHeader(true);
  }

  function saveHeader() {
    const n = headerName.trim();
    if (!n) {
      toast.error("Nama checklist wajib diisi");
      return;
    }
    run(
      () => updateChecklist({ id: cl.id, name: n, description: headerDesc.trim() || null }),
      "Checklist diperbarui"
    );
    setEditingHeader(false);
  }

  function onAddItem() {
    const t = itemTitle.trim();
    if (!t) {
      toast.error("Judul item wajib diisi");
      return;
    }
    run(
      () =>
        addChecklistItem({
          checklist_id: cl.id,
          title: t,
          note: itemNote.trim() || undefined,
          requires_photo: itemPhoto,
        }),
      "Item ditambahkan — buka untuk atur foto"
    );
    setItemTitle("");
    setItemNote("");
    setItemPhoto(true);
  }

  function moveItem(index: number, dir: -1 | 1) {
    const ids = cl.items.map((i) => i.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    run(() => reorderItems({ ordered_ids: ids }));
  }

  return (
    <section
      className={cn(
        "rounded-2xl border bg-card overflow-hidden",
        cl.is_active ? "border-border" : "border-border/60 opacity-70"
      )}
    >
      {editingHeader ? (
        <div className="px-4 py-3 space-y-2">
          <Input
            value={headerName}
            onChange={(e) => setHeaderName(e.target.value)}
            placeholder="Nama checklist (mis. Closing Cleaning)"
          />
          <Textarea
            value={headerDesc}
            onChange={(e) => setHeaderDesc(e.target.value)}
            placeholder="Deskripsi / catatan checklist (opsional)"
            rows={2}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={saveHeader} disabled={pending} className="gap-1.5">
              <Check size={14} />
              Simpan
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditingHeader(false)}
              disabled={pending}
              className="gap-1.5"
            >
              <X size={14} />
              Batal
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleOpen}
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
          >
            {open ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-display font-semibold text-sm truncate">{cl.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{cl.items.length} item</span>
                {!cl.is_active && (
                  <span className="shrink-0 text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                    nonaktif
                  </span>
                )}
              </span>
              {summary && <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">{summary}</span>}
            </span>
          </button>
          {(onEditSchedule || onEditDuty) && (
            <button
              type="button"
              title={
                assigned.length === 0 && duty
                  ? "Hari & jam diatur di tab Duty cabang"
                  : "Hari & jam dikerjakan ada di tab Penugasan"
              }
              onClick={() => {
                if (assigned.length === 0 && duty) onEditDuty?.();
                else onEditSchedule?.(cl.id);
              }}
              className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11.5px] font-semibold text-foreground/80 hover:bg-muted hover:text-foreground"
            >
              {assigned.length > 0 || duty ? "Ubah jadwal" : "Atur penugasan"}
            </button>
          )}
          <button
            type="button"
            title="Edit nama & deskripsi"
            onClick={startEditHeader}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            title="Duplikat checklist"
            onClick={() => run(() => duplicateChecklist({ id: cl.id }), "Checklist diduplikat")}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Copy size={15} />
          </button>
          <button
            type="button"
            title={cl.is_active ? "Nonaktifkan" : "Aktifkan"}
            onClick={() => run(() => setChecklistActive({ id: cl.id, is_active: !cl.is_active }))}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Power size={15} />
          </button>
          <button
            type="button"
            title="Hapus checklist"
            onClick={() => {
              if (
                confirm(
                  `Hapus checklist "${cl.name}" beserta semua item, assignment, dan SELURUH riwayat fotonya? Ini tidak bisa dibatalkan — bila hanya ingin berhenti dipakai, nonaktifkan saja.`
                )
              ) {
                run(() => deleteChecklist({ id: cl.id }), "Checklist dihapus");
              }
            }}
            disabled={pending}
            className="text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}

      {open && (
        <div className="border-t border-border">
          {cl.description && (
            <p className="px-4 pt-2 text-xs text-muted-foreground">{cl.description}</p>
          )}
          <ChecklistGovernance checklist={cl} employees={employees} />
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {cl.items.map((it, idx) => (
              <ItemRow
                key={it.id}
                item={it}
                index={idx}
                total={cl.items.length}
                pending={pending}
                run={run}
                onMove={(dir) => moveItem(idx, dir)}
              />
            ))}
            {cl.items.length === 0 && (
              <li className="px-4 py-3 text-xs text-muted-foreground italic">
                Belum ada item.
              </li>
            )}
          </ul>

          {/* Add item */}
          <div className="px-4 py-3 border-t border-border bg-muted/20 space-y-2">
            <Input
              value={itemTitle}
              onChange={(e) => setItemTitle(e.target.value)}
              placeholder="Judul item (mis. Lap meja kasir)"
            />
            <Textarea
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              placeholder="Catatan detail: sisi mana yang dibersihkan & difoto (opsional)"
              rows={2}
            />
            <p className="text-[11px] text-muted-foreground">
              Setelah dibuat, buka item untuk mengatur foto yang diminta &
              referensinya (bisa lebih dari satu).
            </p>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setItemPhoto((p) => !p)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition",
                  itemPhoto
                    ? "bg-accent text-accent-foreground border-foreground"
                    : "bg-card text-muted-foreground border-border"
                )}
              >
                {itemPhoto ? <Camera size={13} /> : <CameraOff size={13} />}
                {itemPhoto ? "Wajib foto" : "Tanpa foto"}
              </button>
              <Button type="button" size="sm" onClick={onAddItem} disabled={pending} className="gap-1.5">
                <Plus size={14} />
                Tambah item
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ItemRow({
  item: it,
  index,
  total,
  pending,
  run,
  onMove,
}: {
  item: CleaningItem;
  index: number;
  total: number;
  pending: boolean;
  run: (
    fn: () => Promise<{ ok: true } | { error: string } | { ok: true; id: string }>,
    ok?: string
  ) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(it.title);
  const [note, setNote] = useState(it.note ?? "");

  function startEdit() {
    setTitle(it.title);
    setNote(it.note ?? "");
    setEditing(true);
  }

  function save() {
    const t = title.trim();
    if (!t) {
      toast.error("Judul item wajib diisi");
      return;
    }
    run(
      () => updateChecklistItem({ id: it.id, title: t, note: note.trim() || null }),
      "Item diperbarui"
    );
    setEditing(false);
  }

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-start gap-2">
        {/* Reorder */}
        <div className="flex flex-col -my-0.5 shrink-0">
          <button
            type="button"
            title="Naik"
            onClick={() => onMove(-1)}
            disabled={pending || index === 0}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            title="Turun"
            onClick={() => onMove(1)}
            disabled={pending || index === total - 1}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronDown size={14} />
          </button>
        </div>

        {/* Camera-required toggle */}
        <button
          type="button"
          title={it.requires_photo ? "Wajib foto — klik untuk ubah" : "Tanpa foto — klik untuk ubah"}
          onClick={() =>
            run(() => updateChecklistItem({ id: it.id, requires_photo: !it.requires_photo }))
          }
          disabled={pending || editing}
          className={cn(
            "mt-0.5 shrink-0 disabled:opacity-50",
            it.requires_photo ? "text-accent-foreground" : "text-muted-foreground"
          )}
        >
          {it.requires_photo ? <Camera size={16} /> : <CameraOff size={16} />}
        </button>

        {editing ? (
          <div className="min-w-0 flex-1 space-y-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul item" />
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan detail (opsional)"
              rows={2}
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={save} disabled={pending} className="gap-1.5">
                <Check size={14} />
                Simpan
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={pending}
                className="gap-1.5"
              >
                <X size={14} />
                Batal
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{it.title}</p>
              {it.note && (
                <p className="text-xs text-muted-foreground mt-0.5">{it.note}</p>
              )}
            </div>
            {it.requires_photo && (
              <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-muted text-muted-foreground shrink-0">
                {it.photos.length > 0 ? `${it.photos.length} foto` : "1 foto"}
              </span>
            )}
            <button
              type="button"
              title="Edit item"
              onClick={startEdit}
              disabled={pending}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50 shrink-0"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => run(() => deleteChecklistItem({ id: it.id }), "Item dihapus")}
              disabled={pending}
              className="text-muted-foreground hover:text-destructive disabled:opacity-50 shrink-0"
              aria-label="Hapus item"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>

      {/* Requested photos (slots), each with its own reference */}
      {it.requires_photo && <PhotoSlots item={it} pending={pending} run={run} />}
      {it.requires_photo && <AiGateRow item={it} pending={pending} run={run} />}
    </li>
  );
}

/**
 * Gate AI per titik: foto dibaca AI (Gemini gratis) dan sisa token di bawah batas ditolak,
 * jadi karyawan wajib mengisi token dulu. Checklist milik satu cabang → batas ini per cabang.
 */
function AiGateRow({
  item,
  pending,
  run,
}: {
  item: CleaningItem;
  pending: boolean;
  run: (fn: () => Promise<{ ok: true } | { error: string } | { ok: true; id: string }>, ok?: string) => void;
}) {
  const [on, setOn] = useState(false);
  const [val, setVal] = useState(String(item.ai_gate_min ?? 100));
  const active = item.ai_gate_min != null;
  const save = (min: number | null, msg: string) =>
    run(async () => {
      const res = await setItemAiGate({ itemId: item.id, minKwh: min });
      return res.ok ? { ok: true as const } : { error: res.error };
    }, msg);

  if (!active && !on) {
    return (
      <button
        type="button"
        onClick={() => setOn(true)}
        disabled={pending}
        className="mt-1.5 ml-[52px] inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        + Gate AI: baca sisa token (kWh) dari foto
      </button>
    );
  }
  return (
    <div className="mt-1.5 ml-[52px] flex flex-wrap items-center gap-2 rounded-lg bg-primary/5 px-2.5 py-1.5 text-[11.5px]">
      <span className="font-semibold">Gate AI</span>
      <span className="text-muted-foreground">foto ditolak bila sisa token di bawah</span>
      <Input
        type="number"
        inputMode="decimal"
        min={1}
        step="any"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="h-7 w-24 text-xs"
        disabled={pending}
      />
      <span className="text-muted-foreground">kWh</span>
      <Button
        type="button"
        size="sm"
        className="h-7 px-2 text-[11px]"
        disabled={pending || !(Number(val) > 0)}
        onClick={() => {
          save(Number(val), "Gate AI disimpan");
          setOn(false);
        }}
      >
        Simpan
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 px-2 text-[11px]"
        disabled={pending}
        onClick={() => {
          if (active) save(null, "Gate AI dimatikan");
          setOn(false);
        }}
      >
        {active ? "Matikan" : "Batal"}
      </Button>
    </div>
  );
}

function PhotoSlots({
  item,
  pending,
  run,
}: {
  item: CleaningItem;
  pending: boolean;
  run: (
    fn: () => Promise<{ ok: true } | { error: string } | { ok: true; id: string }>,
    ok?: string
  ) => void;
}) {
  const [adding, setAdding] = useState(false);

  async function addWithRef(file: File | undefined) {
    setAdding(true);
    const path = file ? await uploadCleaningRef(item.id, file) : null;
    setAdding(false);
    run(
      () => addItemPhoto({ item_id: item.id, reference_photo_path: path }),
      "Foto ditambahkan"
    );
  }

  return (
    <div className="mt-2 ml-8 rounded-lg border border-border bg-muted/20 p-2.5 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Foto yang diminta
      </p>
      {item.photos.length === 0 && (
        <p className="text-[11px] text-muted-foreground italic">
          Default 1 foto (tanpa contoh). Tambah untuk minta beberapa foto, masing-masing
          dengan contoh & nama berbeda.
        </p>
      )}
      {item.photos.map((slot, i) => (
        <SlotRow key={slot.id} slot={slot} itemId={item.id} index={i} pending={pending} run={run} />
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => addItemPhoto({ item_id: item.id }), "Foto ditambahkan")}
          className="gap-1.5"
        >
          <Plus size={13} />
          Tambah foto
        </Button>
        <label
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-border bg-card cursor-pointer hover:bg-muted",
            (adding || pending) && "opacity-50 pointer-events-none"
          )}
        >
          {adding ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
          Tambah + contoh
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={adding || pending}
            onChange={(e) => addWithRef(e.target.files?.[0])}
          />
        </label>
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  itemId,
  index,
  pending,
  run,
}: {
  slot: ItemPhoto;
  itemId: string;
  index: number;
  pending: boolean;
  run: (
    fn: () => Promise<{ ok: true } | { error: string } | { ok: true; id: string }>,
    ok?: string
  ) => void;
}) {
  const [label, setLabel] = useState(slot.label ?? "");
  const [uploading, setUploading] = useState(false);

  async function pickRef(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    const path = await uploadCleaningRef(itemId, file);
    setUploading(false);
    if (path) run(() => updateItemPhoto({ id: slot.id, reference_photo_path: path }), "Contoh disimpan");
  }

  function saveLabel() {
    if (label.trim() !== (slot.label ?? "")) {
      run(() => updateItemPhoto({ id: slot.id, label: label.trim() || null }));
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Reference thumb / upload (click to set or replace) */}
      <label className="relative shrink-0 cursor-pointer" title="Klik untuk set/ganti contoh">
        {slot.reference_photo_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cleaningRefUrl(slot.reference_photo_path)}
            alt="Contoh"
            loading="lazy"
            decoding="async"
            className="size-11 rounded-lg border-2 border-foreground object-cover"
          />
        ) : (
          <span className="grid place-items-center size-11 rounded-lg border-2 border-dashed border-border text-muted-foreground">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading || pending}
          onChange={(e) => pickRef(e.target.files?.[0])}
        />
      </label>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={saveLabel}
        placeholder={`Nama foto ${index + 1} (mis. sisi depan)`}
        className="h-8 flex-1"
        disabled={pending}
      />
      {slot.reference_photo_path && (
        <button
          type="button"
          title="Hapus contoh"
          onClick={() =>
            run(() => updateItemPhoto({ id: slot.id, reference_photo_path: null }), "Contoh dihapus")
          }
          disabled={pending}
          className="text-muted-foreground hover:text-destructive disabled:opacity-50 shrink-0 text-[11px]"
        >
          contoh ✕
        </button>
      )}
      <button
        type="button"
        title="Hapus foto ini"
        onClick={() => run(() => deleteItemPhoto({ id: slot.id }), "Foto dihapus")}
        disabled={pending}
        className="text-muted-foreground hover:text-destructive disabled:opacity-50 shrink-0"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
