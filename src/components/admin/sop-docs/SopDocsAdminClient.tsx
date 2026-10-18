"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createSopDocument,
  updateSopDocument,
  setSopDocumentActive,
  listAckStatusForDocument,
  type SopDocumentAdminView,
  type SopAckStatusRow,
} from "@/lib/actions/sop-documents.actions";

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function SopFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SopDocumentAdminView | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial;

  async function save() {
    setSaving(true);
    try {
      const res = isEdit
        ? await updateSopDocument({ id: initial!.id, title, category, body })
        : await createSopDocument({ title, category, body });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? "SOP diperbarui — karyawan perlu mengakui ulang" : "SOP ditambahkan");
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setTitle(initial?.title ?? "");
          setCategory(initial?.category ?? "");
          setBody(initial?.body ?? "");
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit SOP" : "Tambah SOP"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {isEdit && (
            <p className="text-xs text-warning">
              Menyimpan perubahan isi akan menaikkan versi — semua karyawan perlu mengakui ulang.
            </p>
          )}
          <div>
            <Label htmlFor="sop-title">Judul</Label>
            <Input id="sop-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sop-category">Kategori</Label>
            <Input id="sop-category" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sop-body">Isi SOP</Label>
            <Textarea id="sop-body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} loading={saving} className="w-full">
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AckStatusDialog({
  documentId,
  open,
  onOpenChange,
}: {
  documentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<SopAckStatusRow[] | null>(null);

  async function load() {
    if (!documentId) return;
    setRows(null);
    const data = await listAckStatusForDocument(documentId);
    setRows(data);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) void load();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Status pengakuan</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {rows == null && <p className="text-sm text-muted-foreground">Memuat...</p>}
          {rows?.map((r) => (
            <div key={r.userId} className="flex items-center justify-between text-sm">
              <span>{r.name}</span>
              {r.acknowledged ? (
                <span className="text-xs text-success">{dateLabel(r.acknowledgedAt!)}</span>
              ) : (
                <Badge variant="destructive">Belum</Badge>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SopDocCard({ doc, onChanged }: { doc: SopDocumentAdminView; onChanged: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function toggleActive() {
    setToggling(true);
    try {
      const res = await setSopDocumentActive({ id: doc.id, isActive: !doc.isActive });
      if (!res.ok) toast.error(res.error);
      else onChanged();
    } finally {
      setToggling(false);
    }
  }

  return (
    <Card className={doc.isActive ? "" : "opacity-60"}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{doc.title}</span>
          <Badge variant="secondary">v{doc.version}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {doc.category} · diubah {dateLabel(doc.updatedAt)} oleh {doc.updatedByName ?? "—"}
          {!doc.isActive && " · diarsipkan"}
        </p>
        <p className="text-sm">
          {doc.ackedCount}/{doc.totalEmployees} karyawan sudah mengakui versi ini
        </p>
        <div className="flex gap-2">
          <Button size="xs" variant="outline" onClick={() => setStatusOpen(true)}>
            Lihat status
          </Button>
          <Button size="xs" variant="outline" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <Button size="xs" variant="secondary" loading={toggling} onClick={toggleActive}>
            {doc.isActive ? "Arsipkan" : "Aktifkan"}
          </Button>
        </div>
      </CardContent>
      <SopFormDialog open={editOpen} onOpenChange={setEditOpen} initial={doc} onSaved={onChanged} />
      <AckStatusDialog documentId={doc.id} open={statusOpen} onOpenChange={setStatusOpen} />
    </Card>
  );
}

export function SopDocsAdminClient({ documents }: { documents: SopDocumentAdminView[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => setCreateOpen(true)}>
        <Plus size={16} /> Tambah SOP
      </Button>
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada SOP terdaftar.</p>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <SopDocCard key={doc.id} doc={doc} onChanged={refresh} />
          ))}
        </div>
      )}
      <SopFormDialog open={createOpen} onOpenChange={setCreateOpen} initial={null} onSaved={refresh} />
    </div>
  );
}
