"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Upload, Trash2, Crop, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeAvatar } from "@/components/shared/EmployeeAvatar";
import { AvatarCropDialog } from "./AvatarCropDialog";
import {
  regenerateAvatarSeed,
  uploadAvatar,
  clearUploadedAvatar,
} from "@/lib/actions/avatar.actions";

interface Props {
  profileId: string;
  fullName: string | null;
  avatarUrl: string | null;
  avatarSeed: string | null;
  /** Baris kecil di bawah nama, mis. "Kasir · Yeobo Space". */
  subtitle?: string | null;
}

export function AvatarCard({
  profileId,
  fullName,
  avatarUrl,
  avatarSeed,
  subtitle,
}: Props) {
  const router = useRouter();
  const [showActions, setShowActions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [optimisticSeed, setOptimisticSeed] = useState<string | null>(null);
  const [optimisticUrl, setOptimisticUrl] = useState<string | null>(null);
  const effectiveSeed = optimisticSeed ?? avatarSeed;
  const effectiveUrl = optimisticUrl ?? avatarUrl;
  const isUploaded = !!effectiveUrl;

  // Crop dialog state — opened after file pick, before upload.
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  // Revoke object URLs when they go out of scope to avoid leaks.
  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  function regenerate() {
    startTransition(async () => {
      const res = await regenerateAvatarSeed();
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setOptimisticSeed(res.seed);
      toast.success("Avatar di-regenerate");
      router.refresh();
    });
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Hanya file gambar");
      return;
    }
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(URL.createObjectURL(file));
    setCropOpen(true);
    e.target.value = "";
  }

  function uploadBlob(blob: Blob) {
    const fd = new FormData();
    fd.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
    startTransition(async () => {
      const res = await uploadAvatar(fd);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setOptimisticUrl(res.url);
      setCropOpen(false);
      toast.success("Foto profil di-upload");
      router.refresh();
    });
  }

  /** Re-crop existing uploaded photo without re-picking file. */
  function recropExisting() {
    if (!effectiveUrl) return;
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(effectiveUrl);
    setCropOpen(true);
  }

  function clearUploaded() {
    if (
      !confirm("Hapus foto upload? Avatar akan kembali ke versi generated.")
    )
      return;
    startTransition(async () => {
      const res = await clearUploadedAvatar();
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setOptimisticUrl(null);
      toast.success("Foto dihapus, kembali ke avatar generated");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <EmployeeAvatar
          id={profileId}
          full_name={fullName}
          avatar_url={effectiveUrl}
          avatar_seed={effectiveSeed}
          size="lg"
          className="size-16"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold leading-tight">
            {fullName || "Karyawan"}
          </p>
          {subtitle && (
            <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 shrink-0 gap-1.5"
          aria-expanded={showActions}
          onClick={() => setShowActions((v) => !v)}
        >
          <Camera size={14} /> Foto
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFilePicked}
      />
      {showActions && (
        <div className="mt-3 space-y-2 rounded-2xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">
            {isUploaded
              ? "Foto kamu sendiri."
              : "Avatar dibuat otomatis dari namamu. Acak ulang atau upload foto sendiri."}
          </p>
          <div className="flex flex-wrap gap-2">
            {!isUploaded && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={regenerate}
                disabled={pending}
                loading={pending}
                className="min-h-11 gap-1.5"
              >
                <Sparkles size={14} /> Acak ulang
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              className="min-h-11 gap-1.5"
            >
              <Upload size={14} />
              {isUploaded ? "Ganti foto" : "Upload foto"}
            </Button>
            {isUploaded && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={recropExisting}
                disabled={pending}
                className="min-h-11 gap-1.5"
              >
                <Crop size={14} /> Atur posisi
              </Button>
            )}
            {isUploaded && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearUploaded}
                disabled={pending}
                className="min-h-11 gap-1.5 text-destructive"
              >
                <Trash2 size={14} /> Hapus foto
              </Button>
            )}
          </div>
        </div>
      )}
      <AvatarCropDialog
        src={cropSrc}
        open={cropOpen}
        onOpenChange={(o) => {
          setCropOpen(o);
          if (!o && cropSrc) {
            URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
          }
        }}
        onConfirm={uploadBlob}
        pending={pending}
      />
    </div>
  );
}
