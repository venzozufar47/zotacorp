"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AttendanceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  // Auto-retry once when the error boundary catches
  useEffect(() => {
    console.error("[attendance-error]", error.message, error.digest);
    // Automatically attempt recovery
    reset();
  }, [error, reset]);

  return null;
}
