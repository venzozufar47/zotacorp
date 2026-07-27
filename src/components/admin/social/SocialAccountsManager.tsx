"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Camera,
  Music2,
  Archive,
  ArchiveRestore,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDateID } from "@/lib/utils/date-formats";
import {
  PLATFORM_LABELS,
  PROVIDER_LABELS,
  type Platform,
  type ProviderId,
  type SocialAccount,
  type SocialFormOptions,
  type SocialSyncRun,
  type TokenStatus,
} from "@/lib/social/types";
import {
  createSocialAccount,
  updateSocialAccount,
  setSocialAccountArchived,
} from "@/lib/actions/social.actions";

const PLATFORMS: Platform[] = ["instagram", "tiktok"];
const PROVIDERS: ProviderId[] = [
  "manual",
  "instagram_graph",
  "tiktok_display",
  "ayrshare",
  "phyllo",
  "scrape_generic",
];

/** Provider mana yang masuk akal untuk sebuah platform — mencegah memilih
 *  TikTok Display API untuk akun Instagram. */
function providersFor(platform: Platform): ProviderId[] {
  return PROVIDERS.filter((p) => {
    if (p === "instagram_graph") return platform === "instagram";
    if (p === "tiktok_display") return platform === "tiktok";
    return true;
  });
}

const TOKEN_BADGE: Record<TokenStatus, { label: string; cls: string }> = {
  ok: { label: "Tersambung", cls: "bg-pop-emerald text-foreground" },
  expiring: { label: "Segera kedaluwarsa", cls: "bg-tertiary text-foreground" },
  reauth_required: { label: "Perlu sambung ulang", cls: "bg-destructive text-white" },
  none: { label: "Belum tersambung", cls: "bg-muted text-muted-foreground" },
};

interface FormState {
  id?: string;
  businessUnitId: string;
  platform: Platform;
  handle: string;
  displayName: string;
  provider: ProviderId;
  defaultCreatorId: string;
  managerId: string;
}

const EMPTY: FormState = {
  businessUnitId: "",
  platform: "instagram",
  handle: "",
  displayName: "",
  provider: "manual",
  defaultCreatorId: "",
  managerId: "",
};

export function SocialAccountsManager({
  accounts,
  options,
  runs,
}: {
  accounts: SocialAccount[];
  options: SocialFormOptions;
  runs: SocialSyncRun[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(
    () => accounts.filter((a) => (showArchived ? true : a.isActive)),
    [accounts, showArchived]
  );

  const byBu = useMemo(() => {
    const m = new Map<string, SocialAccount[]>();
    for (const a of visible) {
      const key = a.businessUnitName;
      (m.get(key) ?? m.set(key, []).get(key)!).push(a);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  function submit() {
    if (!form) return;
    if (!form.businessUnitId) return toast.error("Pilih unit bisnisnya dulu.");
    if (!form.handle.trim()) return toast.error("Handle wajib diisi.");
    const payload = {
      businessUnitId: form.businessUnitId,
      platform: form.platform,
      handle: form.handle,
      displayName: form.displayName || null,
      provider: form.provider,
      defaultCreatorId: form.defaultCreatorId || null,
      managerId: form.managerId || null,
    };
    startTransition(async () => {
      const res = form.id
        ? await updateSocialAccount(form.id, payload)
        : await createSocialAccount(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(form.id ? "Akun diperbarui." : "Akun ditambahkan.");
      setForm(null);
      router.refresh();
    });
  }

  function toggleArchive(a: SocialAccount) {
    startTransition(async () => {
      const res = await setSocialAccountArchived(a.id, a.isActive);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(a.isActive ? "Akun diarsipkan." : "Akun diaktifkan lagi.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setForm({ ...EMPTY })} disabled={pending}>
          <Plus size={14} /> Tambah akun
        </Button>
        <label className="inline-flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Tampilkan yang diarsipkan
        </label>
      </div>

      {form && (
        <div className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard space-y-3">
          <h3 className="font-display font-bold text-[15px]">
            {form.id ? "Ubah akun" : "Akun baru"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Unit bisnis">
              <select
                value={form.businessUnitId}
                onChange={(e) => setForm({ ...form, businessUnitId: e.target.value })}
                className={selectCls}
              >
                <option value="">— pilih —</option>
                {options.businessUnits.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Platform">
              <select
                value={form.platform}
                onChange={(e) => {
                  const platform = e.target.value as Platform;
                  const allowed = providersFor(platform);
                  setForm({
                    ...form,
                    platform,
                    // Jangan tinggalkan kombinasi mustahil (mis. IG + TikTok API).
                    provider: allowed.includes(form.provider) ? form.provider : "manual",
                  });
                }}
                className={selectCls}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Handle (tanpa @)">
              <Input
                value={form.handle}
                onChange={(e) => setForm({ ...form, handle: e.target.value })}
                placeholder="yeobospace"
              />
            </Field>
            <Field label="Nama tampilan (opsional)">
              <Input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="Yeobo Space"
              />
            </Field>
            <Field label="Sumber data">
              <select
                value={form.provider}
                onChange={(e) =>
                  setForm({ ...form, provider: e.target.value as ProviderId })
                }
                className={selectCls}
              >
                {providersFor(form.platform).map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kreator default">
              <select
                value={form.defaultCreatorId}
                onChange={(e) =>
                  setForm({ ...form, defaultCreatorId: e.target.value })
                }
                className={selectCls}
              >
                <option value="">— belum ditetapkan —</option>
                {options.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.jobRole ? ` · ${e.jobRole}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Social media manager">
              <select
                value={form.managerId}
                onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                className={selectCls}
              >
                <option value="">— belum ditetapkan —</option>
                {options.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            Kreator default otomatis melekat pada setiap postingan baru akun ini.
            Menggantinya nanti <strong>tidak</strong> menulis ulang atribusi
            postingan lama.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={pending}>
              {pending && <Loader2 size={14} className="animate-spin" />} Simpan
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setForm(null)}
              disabled={pending}
            >
              Batal
            </Button>
          </div>
        </div>
      )}

      {byBu.length === 0 && (
        <p className="text-[13px] text-muted-foreground px-1">
          Belum ada akun terdaftar.
        </p>
      )}

      {byBu.map(([bu, list]) => (
        <div key={bu} className="space-y-2">
          <h3 className="font-display font-bold text-[13.5px]">{bu}</h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((a) => {
              const badge = TOKEN_BADGE[a.tokenStatus];
              const Icon = a.platform === "instagram" ? Camera : Music2;
              return (
                <div
                  key={a.id}
                  className={cn(
                    "rounded-2xl border-2 border-foreground bg-card p-3 shadow-hard-sm space-y-2",
                    !a.isActive && "opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-display font-bold text-[14px]">
                        <Icon size={14} /> @{a.handle}
                      </div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {PLATFORM_LABELS[a.platform]} ·{" "}
                        {PROVIDER_LABELS[a.provider]}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold border-2 border-foreground",
                        badge.cls
                      )}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <dl className="text-[11.5px] space-y-0.5">
                    <Row
                      k="Kreator"
                      v={a.defaultCreatorName ?? "— belum ditetapkan —"}
                    />
                    <Row k="Manager" v={a.managerName ?? "—"} />
                    <Row
                      k="Follower"
                      v={
                        a.followerCount != null
                          ? a.followerCount.toLocaleString("id-ID")
                          : "—"
                      }
                    />
                    <Row
                      k="Sync terakhir"
                      v={a.lastSyncedAt ? formatDateID(a.lastSyncedAt.slice(0, 10)) : "belum pernah"}
                    />
                  </dl>

                  {a.lastSyncError && (
                    <p className="flex items-start gap-1 text-[11px] text-destructive">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{a.lastSyncError}</span>
                    </p>
                  )}

                  <div className="flex gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setForm({
                          id: a.id,
                          businessUnitId: a.businessUnitId,
                          platform: a.platform,
                          handle: a.handle,
                          displayName: a.displayName ?? "",
                          provider: a.provider,
                          defaultCreatorId: a.defaultCreatorId ?? "",
                          managerId: a.managerId ?? "",
                        })
                      }
                      disabled={pending}
                    >
                      <Pencil size={13} /> Ubah
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleArchive(a)}
                      disabled={pending}
                    >
                      {a.isActive ? (
                        <>
                          <Archive size={13} /> Arsip
                        </>
                      ) : (
                        <>
                          <ArchiveRestore size={13} /> Aktifkan
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="font-display font-bold text-[13.5px] mb-2">
          Riwayat sinkronisasi
        </h3>
        {runs.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            Belum ada sinkronisasi. Mesin sync mulai berjalan setelah ada akun
            yang tersambung ke API resmi.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] tabular-nums">
              <thead className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-3">Waktu</th>
                  <th className="py-1 pr-3">Jenis</th>
                  <th className="py-1 pr-3">Akun</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3 text-right">API</th>
                  <th className="py-1 pr-3 text-right">Post</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-1 pr-3">
                      {new Date(r.startedAt).toLocaleString("id-ID")}
                    </td>
                    <td className="py-1 pr-3">{r.kind}</td>
                    <td className="py-1 pr-3">{r.accountLabel ?? "—"}</td>
                    <td className="py-1 pr-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="py-1 pr-3 text-right">{r.apiCalls}</td>
                    <td className="py-1 pr-3 text-right">{r.postsUpserted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const selectCls =
  "mt-1 w-full h-10 rounded-xl border border-border bg-card px-3 text-[13px]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="truncate">{v}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { icon: typeof CheckCircle2; cls: string }> = {
    ok: { icon: CheckCircle2, cls: "text-pop-emerald" },
    partial: { icon: CircleDashed, cls: "text-tertiary" },
    skipped: { icon: CircleDashed, cls: "text-muted-foreground" },
    error: { icon: AlertTriangle, cls: "text-destructive" },
    running: { icon: Loader2, cls: "text-muted-foreground" },
  };
  const { icon: Icon, cls } = map[status] ?? map.skipped;
  return (
    <span className={cn("inline-flex items-center gap-1", cls)}>
      <Icon size={12} /> {status}
    </span>
  );
}
