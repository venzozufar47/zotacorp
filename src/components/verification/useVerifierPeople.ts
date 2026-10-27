"use client";

import { useEffect, useState } from "react";
import { listVerifierCandidates } from "@/lib/actions/verifications.actions";
import type { VerifierOption } from "./VerifierPicker";

/** Daftar orang yang boleh dipilih sebagai verifikator (dimuat sekali saat form dibuka). */
export function useVerifierPeople(): VerifierOption[] {
  const [people, setPeople] = useState<VerifierOption[]>([]);
  useEffect(() => {
    let active = true;
    listVerifierCandidates()
      .then((list) => active && setPeople(list))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return people;
}
