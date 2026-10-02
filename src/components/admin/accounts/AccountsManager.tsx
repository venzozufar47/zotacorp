"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  Copy,
  Dices,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  User,
} from "lucide-react";
import {
  deleteManagedAccount,
  revealManagedAccountPassword,
  saveManagedAccount,
} from "@/lib/actions/managed-accounts.actions";
import type { ManagedAccount } from "@/lib/accounts/types";
import { buLabel, compareBu, isPersonalBu } from "@/lib/admin-registry/taxonomy";
import {
  BuBranchSelect,
  Field,
  Shell,
  inputCls,
  primaryBtn,
  smallBtn,
} from "@/components/admin/registry/RegistryUi";

const REVEAL_MS = 15_000;

async function copyText(text: string, okMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMsg);
  } catch {
    toast.error("Gagal menyalin. Salin manual.");
  }
}

/** Hanya http(s) yang boleh jadi tautan — cegah `javascript:` dari data yang diinput. */
function safeUrl(raw: string | null): string | null {
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function generatePassword(length = 16): string {
  // Tanpa karakter yang mudah tertukar (0/O, 1/l/I).
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?";
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}

export function AccountsManager({ accounts }: { accounts: ManagedAccount[] }) {
  const [formFor, setFormFor] = useState<ManagedAccount | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [buFilter, setBuFilter] = useState("all");

  const buCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of accounts) m.set(a.businessUnit, (m.get(a.businessUnit) ?? 0) + 1);
    return m;
  }, [accounts]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = accounts.filter((a) => {
      if (buFilter !== "all" && a.businessUnit !== buFilter) return false;
      if (!q) return true;
      return [a.service, a.login, a.businessUnit, a.branch, a.linkedPhone, a.notes]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
    const m = new Map<string, ManagedAccount[]>();
    for (const a of list) {
      const arr = m.get(a.businessUnit) ?? [];
      arr.push(a);
      m.set(a.businessUnit, arr);
    }
    for (const arr of m.values()) {
      arr.sort((x, y) => x.service.localeCompare(y.service));
    }
    return [...m.entries()].sort((a, b) => compareBu(a[0], b[0]));
  }, [accounts, query, buFilter]);

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-xl border border-border bg-accent px-3 py-2 text-xs text-muted-foreground">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        Password disimpan terenkripsi dan hanya admin yang bisa membukanya. Password
        tidak ikut dimuat di daftar — baru diambil saat Anda menekan lihat atau salin.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="w-full rounded-xl border-2 border-border bg-background pl-9 pr-3 h-10 text-sm"
            placeholder="Cari layanan, email, cabang…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="button" onClick={() => setFormFor("new")} className={primaryBtn + " h-10"}>
          <Plus size={14} /> Tambah akun
        </button>
      </div>

      {buCounts.size > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <FilterChip active={buFilter === "all"} onClick={() => setBuFilter("all")}>
            Semua
          </FilterChip>
          {[...buCounts.keys()].sort(compareBu).map((bu) => (
            <FilterChip key={bu} active={buFilter === bu} onClick={() => setBuFilter(bu)}>
              {buLabel(bu)} <span className="opacity-60">{buCounts.get(bu)}</span>
            </FilterChip>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {accounts.length === 0
            ? "Belum ada akun tersimpan. Tambahkan yang pertama dengan tombol di atas."
            : "Tidak ada akun yang cocok dengan pencarian."}
        </p>
      ) : (
        groups.map(([bu, list]) => (
          <section key={bu} className="space-y-2">
            <h2 className="inline-flex items-center gap-1.5 font-display font-bold text-sm">
              {isPersonalBu(bu) && <User size={13} aria-hidden />}
              {buLabel(bu)}{" "}
              <span className="font-normal text-muted-foreground">({list.length})</span>
            </h2>
            <ul className="space-y-2">
              {list.map((a) => (
                <AccountRow key={a.id} account={a} onEdit={() => setFormFor(a)} />
              ))}
            </ul>
          </section>
        ))
      )}

      {formFor && (
        <AccountFormDialog
          account={formFor === "new" ? null : formFor}
          onClose={() => setFormFor(null)}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 h-8 text-xs font-semibold transition ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Baris ──────────────────────────────────────────────────────────────
function AccountRow({
  account: a,
  onEdit,
}: {
  account: ManagedAccount;
  onEdit: () => void;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState<"show" | "copy" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setShown(null);
  }

  async function fetchPassword(): Promise<string | null> {
    const res = await revealManagedAccountPassword(a.id);
    if (!res.ok || !res.data) {
      toast.error(res.ok ? "Password tidak bisa dibaca" : res.error);
      return null;
    }
    return res.data.password;
  }

  async function toggleShow() {
    if (shown !== null) return hide();
    setBusy("show");
    const pw = await fetchPassword();
    setBusy(null);
    if (pw === null) return;
    setShown(pw);
    timer.current = setTimeout(() => setShown(null), REVEAL_MS);
  }

  async function copyPassword() {
    setBusy("copy");
    const pw = shown ?? (await fetchPassword());
    setBusy(null);
    if (pw !== null) await copyText(pw, "Password disalin");
  }

  const url = safeUrl(a.loginUrl);

  return (
    <li className="rounded-xl border-2 border-foreground bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold break-words">{a.service}</span>
            {a.branch && (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold">
                {a.branch}
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={onEdit} className={smallBtn}>
          <Pencil size={13} /> Ubah
        </button>
      </div>

      <div className="space-y-1.5">
        <CopyLine
          label="Email / user"
          value={a.login}
          onCopy={() => copyText(a.login, "Email disalin")}
        />
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
          <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Password
          </span>
          <span className="flex-1 min-w-0 font-mono text-sm break-all">
            {shown ?? "••••••••••"}
          </span>
          <button
            type="button"
            onClick={toggleShow}
            disabled={busy !== null}
            aria-label={shown === null ? "Lihat password" : "Sembunyikan password"}
            className="size-8 shrink-0 inline-flex items-center justify-center rounded-lg hover:bg-muted disabled:opacity-50"
          >
            {busy === "show" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : shown === null ? (
              <Eye size={14} />
            ) : (
              <EyeOff size={14} />
            )}
          </button>
          <button
            type="button"
            onClick={copyPassword}
            disabled={busy !== null}
            aria-label="Salin password"
            className="size-8 shrink-0 inline-flex items-center justify-center rounded-lg hover:bg-muted disabled:opacity-50"
          >
            {busy === "copy" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Copy size={14} />
            )}
          </button>
        </div>
      </div>

      {(a.linkedPhone || url || a.notes) && (
        <div className="space-y-0.5 text-[11px] text-muted-foreground">
          {a.linkedPhone && (
            <p className="flex items-center gap-1.5">
              <Phone size={11} /> Nomor terhubung:{" "}
              <span className="text-foreground tabular-nums">{a.linkedPhone}</span>
            </p>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-primary hover:underline break-all"
            >
              <ExternalLink size={11} /> {a.loginUrl}
            </a>
          )}
          {a.notes && <p className="break-words">{a.notes}</p>}
        </div>
      )}
    </li>
  );
}

function CopyLine({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
      <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 min-w-0 text-sm break-all">{value}</span>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Salin ${label}`}
        className="size-8 shrink-0 inline-flex items-center justify-center rounded-lg hover:bg-muted"
      >
        <Copy size={14} />
      </button>
    </div>
  );
}

// ─── Form ───────────────────────────────────────────────────────────────
function AccountFormDialog({
  account,
  onClose,
}: {
  account: ManagedAccount | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [login, setLogin] = useState(account?.login ?? "");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [bu, setBu] = useState(account?.businessUnit ?? "Haengbocake");
  const [branch, setBranch] = useState<string | null>(account?.branch ?? null);
  const [service, setService] = useState(account?.service ?? "");
  const [phone, setPhone] = useState(account?.linkedPhone ?? "");
  const [url, setUrl] = useState(account?.loginUrl ?? "");
  const [notes, setNotes] = useState(account?.notes ?? "");
  const hasExtra = Boolean(account?.linkedPhone || account?.loginUrl || account?.notes);
  const [extraOpen, setExtraOpen] = useState(hasExtra);

  function submit() {
    if (!service.trim()) return void toast.error("Isi nama layanan / akun.");
    if (!login.trim()) return void toast.error("Isi email / username.");
    if (!account && !password) return void toast.error("Isi password.");
    start(async () => {
      const res = await saveManagedAccount({
        id: account?.id ?? null,
        login,
        password: password || null,
        businessUnit: bu,
        branch,
        service,
        linkedPhone: phone || null,
        loginUrl: url || null,
        notes: notes || null,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(account ? "Akun diperbarui" : "Akun disimpan");
      onClose();
      router.refresh();
    });
  }

  function remove() {
    if (!account) return;
    if (!confirm(`Hapus akun "${account.service}" beserta passwordnya?`)) return;
    start(async () => {
      const res = await deleteManagedAccount(account.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Akun dihapus");
      onClose();
      router.refresh();
    });
  }

  return (
    <Shell title={account ? "Ubah akun" : "Tambah akun"} onClose={onClose}>
      <Field label="Nama layanan / akun">
        <input
          className={inputCls}
          autoFocus={!account}
          placeholder="mis. Instagram Haengbocake Pare"
          value={service}
          onChange={(e) => setService(e.target.value)}
        />
      </Field>

      <Field label="Email / username">
        <input
          className={inputCls}
          autoComplete="off"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="nama@email.com"
        />
      </Field>

      <Field
        label="Password"
        hint={account ? "Kosongkan jika password tidak diganti." : undefined}
      >
        <div className="mt-1 flex items-center gap-1.5">
          <input
            className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm font-mono"
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={account ? "••••••••" : "Password akun"}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? "Sembunyikan" : "Tampilkan"}
            className="size-10 shrink-0 inline-flex items-center justify-center rounded-xl border-2 border-border hover:bg-muted"
          >
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setPassword(generatePassword());
              setShowPw(true);
            }}
            aria-label="Buat password acak"
            title="Buat password acak"
            className="size-10 shrink-0 inline-flex items-center justify-center rounded-xl border-2 border-border hover:bg-muted"
          >
            <Dices size={15} />
          </button>
        </div>
      </Field>

      <div>
        <span className="text-xs font-medium">Unit &amp; cabang</span>
        <div className="mt-1">
          <BuBranchSelect
            bu={bu}
            branch={branch}
            onChange={(b, br) => {
              setBu(b);
              setBranch(br);
            }}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border">
        <button
          type="button"
          onClick={() => setExtraOpen((v) => !v)}
          aria-expanded={extraOpen}
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold"
        >
          Info tambahan (opsional)
          <ChevronDown
            size={14}
            className={`transition-transform ${extraOpen ? "rotate-180" : ""}`}
          />
        </button>
        {extraOpen && (
          <div className="space-y-2.5 border-t border-border p-3">
            <Field label="Nomor terhubung">
              <input
                className={inputCls}
                inputMode="tel"
                placeholder="0812…"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field label="Link login">
              <input
                className={inputCls}
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            <Field label="Catatan">
              <textarea
                className={inputCls}
                rows={2}
                placeholder="mis. kode 2FA ke nomor owner, email pemulihan, dll"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        {account && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label="Hapus akun"
            className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-xl border-2 border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          Simpan
        </button>
      </div>
    </Shell>
  );
}
