"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Plus } from "lucide-react";
import { saveTeam } from "@/lib/actions/team.actions";
import type { AdminTeam } from "@/lib/tasks/types";
import { Shell, inputCls } from "@/components/admin/registry/RegistryUi";
import type { AssignableEmployee } from "./TasksManager";

/**
 * Kelola Team leader: satu leader memantau (read-only) Tugas anggotanya.
 * Daftar tim → ketuk "Ubah" / "Tambah tim" → pilih leader + anggota.
 */
export function TeamsDialog({
  teams,
  employees,
  onClose,
}: {
  teams: AdminTeam[];
  employees: AssignableEmployee[];
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<{ leaderId: string | null; memberIds: string[] } | null>(
    null
  );

  return (
    <Shell title={editing ? (editing.leaderId ? "Ubah tim" : "Tim baru") : "Team leader"} onClose={onClose} wide>
      {editing ? (
        <TeamEditor
          key={editing.leaderId ?? "new"}
          initialLeaderId={editing.leaderId}
          initialMemberIds={editing.memberIds}
          employees={employees}
          takenLeaderIds={teams.map((t) => t.leaderId)}
          onBack={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
          }}
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Team leader dapat <b>melihat</b> checklist tugas dan progres anggotanya (termasuk
            foto buktinya), tanpa bisa mengerjakan, mengirim, atau mengubah apa pun.
          </p>

          {teams.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Belum ada tim.
            </p>
          ) : (
            <ul className="space-y-2">
              {teams.map((t) => (
                <li key={t.leaderId} className="rounded-xl border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{t.leaderName}</p>
                      <p className="text-xs text-muted-foreground">{t.members.length} anggota</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({ leaderId: t.leaderId, memberIds: t.members.map((m) => m.id) })
                      }
                      className="shrink-0 h-10 px-3 rounded-xl border border-border text-sm font-medium inline-flex items-center gap-1.5 hover:bg-muted"
                    >
                      <Pencil size={14} /> Ubah
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.members.map((m) => (
                      <span
                        key={m.id}
                        className="rounded-full bg-muted px-2.5 py-0.5 text-xs"
                      >
                        {m.name}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setEditing({ leaderId: null, memberIds: [] })}
            className="w-full sm:w-auto h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:opacity-90"
          >
            <Plus size={16} /> Tambah tim
          </button>
        </div>
      )}
    </Shell>
  );
}

function TeamEditor({
  initialLeaderId,
  initialMemberIds,
  employees,
  takenLeaderIds,
  onBack,
  onSaved,
}: {
  initialLeaderId: string | null;
  initialMemberIds: string[];
  employees: AssignableEmployee[];
  /** Leader yang sudah punya tim — tidak ditawarkan lagi saat membuat tim baru. */
  takenLeaderIds: string[];
  onBack: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [leaderId, setLeaderId] = useState<string>(initialLeaderId ?? "");
  const [members, setMembers] = useState<Set<string>>(new Set(initialMemberIds));
  const [query, setQuery] = useState("");

  const leaderChoices = useMemo(
    () => employees.filter((e) => !takenLeaderIds.includes(e.id) || e.id === initialLeaderId),
    [employees, takenLeaderIds, initialLeaderId]
  );
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter((e) => e.id !== leaderId)
      .filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [employees, leaderId, query]);

  function toggle(id: string) {
    setMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save(ids: string[], msg: string) {
    startTransition(async () => {
      const res = await saveTeam({ leaderId, memberIds: ids });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(msg);
      router.refresh();
      onSaved();
    });
  }

  // Jika leader dipilih ulang, anggota yang sama dengan leader dibuang.
  const memberIds = [...members].filter((id) => id !== leaderId);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="h-10 -ml-2 px-2 rounded-xl inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <ArrowLeft size={15} /> Kembali
      </button>

      <label className="block text-xs font-semibold">
        Team leader
        <select
          className={inputCls + " h-11"}
          value={leaderId}
          disabled={!!initialLeaderId}
          onChange={(e) => setLeaderId(e.target.value)}
        >
          <option value="">Pilih karyawan…</option>
          {leaderChoices.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <p className="text-xs font-semibold">Anggota · {memberIds.length} dipilih</p>
        <input
          type="search"
          className={inputCls + " !mt-0 h-11"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama…"
        />
        <div className="max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {candidates.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">Tidak ada karyawan.</p>
          )}
          {candidates.map((e) => (
            <label
              key={e.id}
              className="flex items-center gap-3 px-3 min-h-12 text-sm cursor-pointer hover:bg-muted/50"
            >
              <input
                type="checkbox"
                className="size-5 shrink-0"
                checked={members.has(e.id)}
                onChange={() => toggle(e.id)}
              />
              <span className="flex-1 min-w-0 truncate">{e.name}</span>
              {e.businessUnit && (
                <span className="shrink-0 text-[11px] text-muted-foreground">{e.businessUnit}</span>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="sticky -bottom-4 -mx-4 -mb-4 mt-4 px-4 py-3 bg-card border-t border-border flex gap-2 sm:justify-end">
        {initialLeaderId && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Bubarkan tim ini? Leader tidak lagi bisa memantau anggotanya.")) {
                save([], "Tim dibubarkan");
              }
            }}
            className="h-11 px-4 rounded-xl border border-border text-sm font-medium text-destructive hover:bg-muted disabled:opacity-50"
          >
            Bubarkan
          </button>
        )}
        <button
          type="button"
          disabled={pending || !leaderId || memberIds.length === 0}
          onClick={() => save(memberIds, "Tim disimpan")}
          className="flex-1 sm:flex-none h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
        >
          {pending && <Loader2 size={15} className="animate-spin" />}
          Simpan tim
        </button>
      </div>
    </div>
  );
}
