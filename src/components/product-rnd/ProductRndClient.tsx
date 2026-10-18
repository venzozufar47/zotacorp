"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRp } from "@/lib/cashflow/format";
import {
  submitProductIdea,
  screenProductIdea,
  decideProductIdea,
  listExperiments,
  recordExperiment,
  proposeTester,
  approveTester,
  revokeTester,
  upsertProductCard,
  type ProductIdeaView,
  type TesterView,
  type ProductCardView,
  type ExperimentView,
  type RndBranch,
} from "@/lib/actions/product-rnd.actions";

const IDEA_STATUS_LABEL: Record<string, string> = {
  diajukan: "Diajukan",
  riset: "Sedang riset",
  jual_terbatas: "Jual terbatas",
  masuk_menu: "Masuk menu",
  berhenti: "Berhenti",
};

function IdeaRow({
  idea,
  isAdmin,
  canScreen,
  onChanged,
}: {
  idea: ProductIdeaView;
  isAdmin: boolean;
  canScreen: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [experiments, setExperiments] = useState<ExperimentView[] | null>(null);
  const [recipeChange, setRecipeChange] = useState("");
  const [resultNotes, setResultNotes] = useState("");
  const [hpp, setHpp] = useState("");
  const [price, setPrice] = useState("");
  const [decision, setDecision] = useState<"ulangi" | "ubah" | "jual_terbatas" | "berhenti">("ulangi");
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!open) {
      const exps = await listExperiments(idea.id);
      setExperiments(exps);
    }
    setOpen((o) => !o);
  }

  async function addExperiment() {
    setBusy(true);
    try {
      const res = await recordExperiment({
        ideaId: idea.id,
        recipeChange: recipeChange || null,
        resultNotes: resultNotes || null,
        estimatedHpp: hpp ? Number(hpp.replace(/\D/g, "")) : null,
        imaginedPrice: price ? Number(price.replace(/\D/g, "")) : null,
        decision,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Percobaan tercatat");
      setRecipeChange("");
      setResultNotes("");
      setHpp("");
      setPrice("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function screen(d: "riset" | "berhenti") {
    setBusy(true);
    try {
      const res = await screenProductIdea({ id: idea.id, decision: d });
      if (!res.ok) toast.error(res.error);
      else onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function decide(d: "jual_terbatas" | "masuk_menu" | "berhenti") {
    setBusy(true);
    try {
      const res = await decideProductIdea({ id: idea.id, decision: d });
      if (!res.ok) toast.error(res.error);
      else onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{idea.title}</span>
        <span className="text-xs text-muted-foreground">{IDEA_STATUS_LABEL[idea.status]}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {idea.branch} · diajukan {idea.proposedByName ?? "—"} · {idea.attemptCount}/3 percobaan
      </p>
      {idea.purpose && <p>{idea.purpose}</p>}

      {idea.status === "diajukan" && canScreen && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" loading={busy} onClick={() => screen("riset")}>
            Terima untuk riset
          </Button>
          <Button size="sm" variant="outline" className="flex-1" loading={busy} onClick={() => screen("berhenti")}>
            Tolak
          </Button>
        </div>
      )}

      <button type="button" onClick={toggle} className="text-xs font-semibold text-primary underline">
        {open ? "Tutup percobaan" : "Lihat / catat percobaan"}
      </button>

      {open && (
        <div className="space-y-2 border-t border-border pt-2">
          {experiments?.map((e) => (
            <div key={e.id} className="rounded-lg bg-muted/40 px-2.5 py-2 text-xs space-y-0.5">
              <p className="font-semibold">Percobaan ke-{e.attemptNumber}</p>
              {e.recipeChange && <p>Resep: {e.recipeChange}</p>}
              {e.resultNotes && <p>Hasil: {e.resultNotes}</p>}
              {e.estimatedHpp != null && <p>HPP: {formatRp(e.estimatedHpp)}</p>}
              <p className="text-muted-foreground">Keputusan: {e.decision ?? "—"}</p>
            </div>
          ))}
          {idea.status === "riset" && idea.attemptCount < 3 && (
            <div className="space-y-2">
              <Input placeholder="Perubahan resep" value={recipeChange} onChange={(e) => setRecipeChange(e.target.value)} />
              <Textarea placeholder="Hasil (tampilan, tekstur, rasa)" value={resultNotes} onChange={(e) => setResultNotes(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Perkiraan HPP" inputMode="numeric" value={hpp} onChange={(e) => setHpp(e.target.value)} />
                <Input placeholder="Harga jual dibayangkan" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <Select value={decision} onValueChange={(v) => v && setDecision(v as typeof decision)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ulangi">Ulangi</SelectItem>
                  <SelectItem value="ubah">Ubah</SelectItem>
                  <SelectItem value="jual_terbatas">Jual terbatas</SelectItem>
                  <SelectItem value="berhenti">Berhenti</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="w-full" loading={busy} onClick={addExperiment}>
                Simpan percobaan
              </Button>
            </div>
          )}
          {idea.status === "jual_terbatas" && isAdmin && (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" loading={busy} onClick={() => decide("masuk_menu")}>
                Masuk menu
              </Button>
              <Button size="sm" variant="outline" className="flex-1" loading={busy} onClick={() => decide("berhenti")}>
                Berhenti
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IdeaForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [branch, setBranch] = useState<RndBranch>("Pare");
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim()) {
      toast.error("Isi judul ide dulu");
      return;
    }
    setSaving(true);
    try {
      const res = await submitProductIdea({ branch, title, purpose: purpose || null });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Ide terkirim");
      setTitle("");
      setPurpose("");
      onSubmitted();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usulkan ide produk</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Cabang</Label>
          <Select value={branch} onValueChange={(v) => v && setBranch(v as RndBranch)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Pare">Pare</SelectItem>
              <SelectItem value="Semarang">Semarang</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="idea-title">Judul</Label>
          <Input id="idea-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="idea-purpose">Tujuan (opsional)</Label>
          <Textarea id="idea-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </div>
        <Button onClick={submit} loading={saving} className="w-full">
          Kirim
        </Button>
      </CardContent>
    </Card>
  );
}

function TesterSection({
  testers,
  colleagues,
  canScreen,
  isAdmin,
  onChanged,
}: {
  testers: TesterView[];
  colleagues: { id: string; name: string }[];
  canScreen: boolean;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [branch, setBranch] = useState<RndBranch>("Pare");
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);

  async function propose() {
    if (!userId) return;
    setBusy(true);
    try {
      const res = await proposeTester({ branch, userId });
      if (!res.ok) toast.error(res.error);
      else {
        setUserId("");
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    setBusy(true);
    try {
      const res = await approveTester(id);
      if (!res.ok) toast.error(res.error);
      else onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      const res = await revokeTester(id);
      if (!res.ok) toast.error(res.error);
      else onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daftar tester</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {testers.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-sm">
            <span>
              {t.userName} · {t.branch}{" "}
              <span className={t.status === "approved" ? "text-success" : "text-amber-600"}>
                ({t.status === "approved" ? "aktif" : "menunggu Owner"})
              </span>
            </span>
            {t.status === "pending" && isAdmin && (
              <Button size="xs" loading={busy} onClick={() => approve(t.id)}>
                Setujui
              </Button>
            )}
            {isAdmin && (
              <Button size="xs" variant="ghost" loading={busy} onClick={() => revoke(t.id)}>
                Hapus
              </Button>
            )}
          </div>
        ))}
        {canScreen && (
          <div className="flex gap-2">
            <Select value={branch} onValueChange={(v) => v && setBranch(v as RndBranch)}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pare">Pare</SelectItem>
                <SelectItem value="Semarang">Semarang</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userId} onValueChange={(v) => v && setUserId(v)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Pilih orang" />
              </SelectTrigger>
              <SelectContent>
                {colleagues.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" loading={busy} onClick={propose}>
              Usulkan
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductCardsSection({
  cards,
  canScreen,
  onChanged,
}: {
  cards: ProductCardView[];
  canScreen: boolean;
  onChanged: () => void;
}) {
  const [productName, setProductName] = useState("");
  const [shelfLife, setShelfLife] = useState("");
  const [storage, setStorage] = useState("");
  const [criteria, setCriteria] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!productName.trim()) {
      toast.error("Isi nama produk dulu");
      return;
    }
    setSaving(true);
    try {
      const res = await upsertProductCard({
        productName,
        shelfLifeDays: shelfLife ? Number(shelfLife) : null,
        storageMethod: storage || null,
        passCriteria: criteria || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tersimpan");
      setProductName("");
      setShelfLife("");
      setStorage("");
      setCriteria("");
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kartu produk</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {cards.map((c) => (
          <div key={c.id} className="rounded-lg border border-border px-2.5 py-2 text-sm space-y-0.5">
            <p className="font-semibold">{c.productName}</p>
            {c.shelfLifeDays != null && <p className="text-xs">Shelf life: {c.shelfLifeDays} hari</p>}
            {c.storageMethod && <p className="text-xs">Simpan: {c.storageMethod}</p>}
            {c.passCriteria && <p className="text-xs">Kriteria lolos: {c.passCriteria}</p>}
          </div>
        ))}
        {canScreen && (
          <div className="space-y-2 border-t border-border pt-2">
            <Input placeholder="Nama produk" value={productName} onChange={(e) => setProductName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Shelf life (hari)" inputMode="numeric" value={shelfLife} onChange={(e) => setShelfLife(e.target.value)} />
              <Input placeholder="Cara simpan" value={storage} onChange={(e) => setStorage(e.target.value)} />
            </div>
            <Textarea placeholder="Kriteria lolos" value={criteria} onChange={(e) => setCriteria(e.target.value)} />
            <Button size="sm" className="w-full" loading={saving} onClick={save}>
              Simpan kartu
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ProductRndClient({
  ideas,
  testers,
  cards,
  colleagues,
  canScreen,
  isAdmin,
}: {
  ideas: ProductIdeaView[];
  testers: TesterView[];
  cards: ProductCardView[];
  colleagues: { id: string; name: string }[];
  canScreen: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"ide" | "tester" | "kartu">("ide");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["ide", "tester", "kartu"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "rounded-full border-2 px-3 py-1 text-xs font-semibold " +
              (tab === t
                ? "border-foreground bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground")
            }
          >
            {t === "ide" ? "Ide & Percobaan" : t === "tester" ? "Tester" : "Kartu Produk"}
          </button>
        ))}
      </div>

      {tab === "ide" && (
        <>
          <IdeaForm onSubmitted={() => router.refresh()} />
          <div className="space-y-2">
            {ideas.map((idea) => (
              <IdeaRow
                key={idea.id}
                idea={idea}
                isAdmin={isAdmin}
                canScreen={canScreen}
                onChanged={() => router.refresh()}
              />
            ))}
          </div>
        </>
      )}

      {tab === "tester" && (
        <TesterSection
          testers={testers}
          colleagues={colleagues}
          canScreen={canScreen}
          isAdmin={isAdmin}
          onChanged={() => router.refresh()}
        />
      )}

      {tab === "kartu" && (
        <ProductCardsSection cards={cards} canScreen={canScreen} onChanged={() => router.refresh()} />
      )}
    </div>
  );
}
