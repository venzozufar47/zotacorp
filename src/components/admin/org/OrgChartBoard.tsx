"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { Crown, GripVertical, Loader2, Users, X } from "lucide-react";
import { setMemberLeaders, type OrgChartData, type OrgPerson } from "@/lib/actions/org-structure.actions";
import {
  childrenIndex,
  descendantsOf,
  leadersOfMember,
  nextLeaders,
  sameIds,
  wouldCreateCycle,
  type OrgLink,
} from "@/lib/org/hierarchy";
import { cn } from "@/lib/utils";

/** Orang yang sedang diseret + siapa saja yang TIDAK boleh jadi atasannya (siklus). */
interface DragState {
  personId: string;
  blocked: Set<string>;
}
const DragCtx = createContext<DragState | null>(null);
const SelectCtx = createContext<{ selectedId: string | null; select: (id: string) => void }>({
  selectedId: null,
  select: () => {},
});

const rootKey = (parentId: string | null) => parentId ?? "root";

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function PersonCard({
  person,
  parentId,
  leaderCount,
  reportCount,
  compact,
}: {
  person: OrgPerson;
  parentId: string | null;
  leaderCount: number;
  reportCount: number;
  compact?: boolean;
}) {
  const drag = useContext(DragCtx);
  const { selectedId, select } = useContext(SelectCtx);
  const key = `${person.id}@${rootKey(parentId)}`;
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: `p:${key}`, data: { personId: person.id, parentId } });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `d:${key}`,
    data: { kind: "person", personId: person.id },
  });

  const dragging = drag !== null;
  const invalid = dragging && (drag.personId === person.id || drag.blocked.has(person.id));
  const hot = dragging && isOver && !invalid;

  return (
    <div
      ref={(el) => {
        setDragRef(el);
        setDropRef(el);
      }}
      {...attributes}
      {...listeners}
      onClick={() => select(person.id)}
      className={cn(
        "flex cursor-grab touch-manipulation select-none items-center gap-2 rounded-xl border-2 bg-card px-2.5 py-2 transition active:cursor-grabbing",
        compact && "py-1.5",
        selectedId === person.id ? "border-foreground shadow-hard-sm" : "border-border",
        isDragging && "opacity-40",
        hot && "border-primary bg-primary/10",
        dragging && isOver && invalid && "border-destructive bg-destructive/10"
      )}
    >
      <GripVertical className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-foreground bg-tertiary font-display text-xs font-bold"
      >
        {initials(person.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-semibold leading-tight">{person.name}</span>
        {!compact && (
          <span className="block truncate text-[11px] leading-tight text-muted-foreground">
            {[person.jobRole, person.businessUnit].filter(Boolean).join(" · ") || "—"}
          </span>
        )}
      </span>
      {leaderCount > 1 && (
        <span
          title={`${leaderCount} atasan — persetujuan oleh salah satunya`}
          className="shrink-0 rounded-full bg-warning/40 px-1.5 text-[10px] font-bold"
        >
          {leaderCount} atasan
        </span>
      )}
      {reportCount > 0 && (
        <span
          title={`${reportCount} bawahan langsung`}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 text-[11px] font-semibold"
        >
          <Users className="size-3" />
          {reportCount}
        </span>
      )}
    </div>
  );
}

interface TreeModel {
  byId: Map<string, OrgPerson>;
  kids: Map<string, string[]>;
  leaderCountOf: Map<string, number>;
}

/** Level modul (bukan di dalam komponen) supaya kartu tidak di-remount tiap render saat menyeret. */
function TreeNode({
  id,
  parentId,
  path,
  tree,
}: {
  id: string;
  parentId: string | null;
  path: string[];
  tree: TreeModel;
}) {
  const person = tree.byId.get(id);
  if (!person) return null;
  const children = (tree.kids.get(id) ?? [])
    .filter((c) => tree.byId.has(c) && !path.includes(c))
    .sort((a, b) => tree.byId.get(a)!.name.localeCompare(tree.byId.get(b)!.name, "id"));
  return (
    <div className="space-y-2">
      <PersonCard
        person={person}
        parentId={parentId}
        leaderCount={tree.leaderCountOf.get(id) ?? 0}
        reportCount={tree.kids.get(id)?.length ?? 0}
      />
      {children.length > 0 && (
        <div className="ml-4 space-y-2 border-l-2 border-border pl-3">
          {children.map((c) => (
            <TreeNode key={`${c}@${id}`} id={c} parentId={id} path={[...path, id]} tree={tree} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Zona lepas "Owner": melepas orang dari atasan yang dia diseret darinya. */
function OwnerDrop({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const drag = useContext(DragCtx);
  const { setNodeRef, isOver } = useDroppable({ id, data: { kind: "owner" } });
  return (
    <div
      ref={setNodeRef}
      className={cn(className, drag && isOver && "border-primary bg-primary/10")}
    >
      {children}
    </div>
  );
}

export function OrgChartBoard({ data }: { data: OrgChartData }) {
  const { owner, people } = data;
  const [links, setLinks] = useState<OrgLink[]>(data.links);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const kids = useMemo(() => childrenIndex(links), [links]);
  const leaderCountOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of links) m.set(l.memberId, (m.get(l.memberId) ?? 0) + 1);
    return m;
  }, [links]);

  const tree: TreeModel = { byId, kids, leaderCountOf };
  const roots = people.filter((p) => !leaderCountOf.has(p.id));
  const sizeOf = (id: string) => descendantsOf(id, links).size;
  const teamRoots = roots
    .filter((p) => (kids.get(p.id)?.length ?? 0) > 0)
    .sort((a, b) => sizeOf(b.id) - sizeOf(a.id) || a.name.localeCompare(b.name, "id"));
  const loners = roots.filter((p) => !kids.get(p.id)?.length);

  async function applyLeaders(memberId: string, next: string[]) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const prev = links;
    setLinks([
      ...links.filter((l) => l.memberId !== memberId),
      ...next.map((leaderId) => ({ leaderId, memberId })),
    ]);
    try {
      const res = await setMemberLeaders({ memberId, leaderIds: next });
      if (!res.ok) {
        setLinks(prev);
        toast.error(res.error);
        return;
      }
      toast.success(
        next.length === 0
          ? `${byId.get(memberId)?.name ?? "Karyawan"} kini langsung di bawah Owner`
          : "Struktur tersimpan"
      );
    } catch {
      setLinks(prev);
      toast.error("Gagal menyimpan. Coba lagi.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function onDragStart(e: DragStartEvent) {
    const personId = e.active.data.current?.personId as string | undefined;
    if (!personId) return;
    setDrag({ personId, blocked: descendantsOf(personId, links) });
  }

  function onDragEnd(e: DragEndEvent) {
    const state = drag;
    setDrag(null);
    const { active, over } = e;
    if (!state || !over) return;
    const personId = active.data.current?.personId as string;
    const fromLeaderId = (active.data.current?.parentId ?? null) as string | null;
    const target = over.data.current as { kind: "owner" } | { kind: "person"; personId: string };
    const toLeaderId = target.kind === "owner" ? null : target.personId;
    if (toLeaderId === personId) return;
    if (toLeaderId && wouldCreateCycle(personId, toLeaderId, links)) {
      toast.error("Tidak bisa: dia adalah bawahan dari orang yang dituju.");
      return;
    }
    const ev = e.activatorEvent as Partial<MouseEvent>;
    const copy = !!(ev.altKey || ev.ctrlKey);
    const current = leadersOfMember(personId, links);
    const next = nextLeaders({ current, fromLeaderId, toLeaderId, copy });
    if (sameIds(next, current)) return;
    void applyLeaders(personId, next);
  }

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedLeaders = selected ? leadersOfMember(selected.id, links) : [];
  const selectedBlocked = selected ? descendantsOf(selected.id, links) : new Set<string>();
  const addable = selected
    ? people
        .filter(
          (p) =>
            p.id !== selected.id && !selectedBlocked.has(p.id) && !selectedLeaders.includes(p.id)
        )
        .sort((a, b) => a.name.localeCompare(b.name, "id"))
    : [];
  const draggedPerson = drag ? byId.get(drag.personId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDrag(null)}>
      <DragCtx.Provider value={drag}>
        <SelectCtx.Provider value={{ selectedId, select: setSelectedId }}>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Seret kartu ke atasan barunya. Lepas ke kartu <b>Owner</b> untuk mencabut atasan itu.
                Tahan <kbd className="rounded border px-1 text-xs">Alt</kbd> saat mulai menyeret untuk{" "}
                <b>menambah</b> atasan tanpa melepas yang lama. Ketuk kartu untuk mengatur lewat panel.
              </p>

              <OwnerDrop
                id="owner"
                className="mx-auto flex max-w-sm items-center gap-3 rounded-2xl border-2 border-foreground bg-card px-4 py-3 shadow-hard-sm transition"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-foreground bg-primary text-primary-foreground">
                  <Crown className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-sm font-bold">Owner · {owner.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {roots.length} orang langsung di bawah Owner · izin tanpa atasan masuk ke sini
                  </span>
                </span>
                {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              </OwnerDrop>

              <div className="mx-auto h-5 w-0.5 bg-border" aria-hidden />

              {teamRoots.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {teamRoots.map((p) => (
                    <div key={p.id} className="rounded-2xl border-2 border-border bg-muted/30 p-3">
                      <TreeNode id={p.id} parentId={null} path={[]} tree={tree} />
                    </div>
                  ))}
                </div>
              )}

              <OwnerDrop
                id="owner-lane"
                className="space-y-2 rounded-2xl border-2 border-dashed border-border p-3 transition"
              >
                <p className="text-xs font-semibold text-muted-foreground">
                  Belum punya atasan · izinnya langsung ke Owner ({loners.length})
                </p>
                {loners.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Semua karyawan sudah punya atasan.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {loners.map((p) => (
                      <PersonCard
                        key={p.id}
                        person={p}
                        parentId={null}
                        leaderCount={0}
                        reportCount={0}
                        compact
                      />
                    ))}
                  </div>
                )}
              </OwnerDrop>
            </div>

            <aside className="lg:sticky lg:top-4 lg:self-start">
              <div className="space-y-3 rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm">
                <h2 className="font-display text-sm font-bold">Atur atasan</h2>
                {!selected ? (
                  <p className="text-sm text-muted-foreground">Ketuk satu kartu karyawan.</p>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-semibold">{selected.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[selected.jobRole, selected.businessUnit].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground">Atasan saat ini</p>
                      {selectedLeaders.length === 0 ? (
                        <p className="text-sm">Langsung ke Owner</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedLeaders.map((id) => (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 text-xs font-medium"
                            >
                              {byId.get(id)?.name ?? "—"}
                              <button
                                type="button"
                                disabled={saving}
                                aria-label={`Cabut ${byId.get(id)?.name ?? "atasan"}`}
                                onClick={() =>
                                  applyLeaders(
                                    selected.id,
                                    selectedLeaders.filter((x) => x !== id)
                                  )
                                }
                                className="grid size-5 place-items-center rounded-full hover:bg-foreground/10 disabled:opacity-40"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="add-leader" className="text-xs font-semibold text-muted-foreground">
                        Tambah atasan
                      </label>
                      <select
                        id="add-leader"
                        disabled={saving}
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            void applyLeaders(selected.id, [...selectedLeaders, e.target.value]);
                          }
                        }}
                        className="h-10 w-full rounded-xl border-2 border-border bg-background px-3 text-sm"
                      >
                        <option value="">Pilih karyawan…</option>
                        {addable.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.jobRole ? ` — ${p.jobRole}` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-muted-foreground">
                        Beberapa atasan = pengajuan masuk ke semuanya, siapa pun yang memutuskan lebih
                        dulu yang berlaku.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </aside>
          </div>

          <DragOverlay dropAnimation={null}>
            {draggedPerson && (
              <div className="flex items-center gap-2 rounded-xl border-2 border-foreground bg-card px-3 py-2 shadow-hard">
                <span className="grid size-7 place-items-center rounded-full border-2 border-foreground bg-tertiary font-display text-xs font-bold">
                  {initials(draggedPerson.name)}
                </span>
                <span className="text-sm font-semibold">{draggedPerson.name}</span>
              </div>
            )}
          </DragOverlay>
        </SelectCtx.Provider>
      </DragCtx.Provider>
    </DndContext>
  );
}
