"use client";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { resolveAvatarSrc, type AvatarSubject } from "@/lib/avatar";

interface Props extends AvatarSubject {
  size?: "default" | "sm" | "lg";
  className?: string;
}

/**
 * Drop-in avatar for any place that shows a karyawan. Falls back to a
 * letter chip if both the uploaded photo AND the DiceBear request
 * fail (rare — DiceBear is highly available, but we still want a
 * graceful render during outages).
 */
export function EmployeeAvatar({
  size = "default",
  className,
  ...subject
}: Props) {
  const src = resolveAvatarSrc(subject);
  const initial = (subject.full_name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <Avatar size={size} className={className}>
      <AvatarImage src={src} alt={subject.full_name ?? "avatar"} />
      <AvatarFallback>{initial}</AvatarFallback>
    </Avatar>
  );
}
