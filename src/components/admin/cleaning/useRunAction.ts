"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type ActionResult = { ok: true } | { ok: true; id: string } | { error: string };

/**
 * Shared "run a server action" helper for the cleaning admin screens: runs the
 * action in a transition, toasts on error / optional success, then refreshes.
 * Also exposes `startTransition` + `router` for custom flows (create/assign)
 * so they share the same `pending` state used to disable controls.
 */
export function useRunAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<ActionResult>, ok?: string) {
    startTransition(async () => {
      const res = await fn();
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if (ok) toast.success(ok);
      router.refresh();
    });
  }

  return { run, pending, startTransition, router };
}
