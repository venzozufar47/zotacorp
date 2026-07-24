import { redirect } from "next/navigation";

/**
 * POS lama tunggal `/pos` kini per-cabang. Pare = kanonik → arahkan ke
 * `/pospare`. (Deep-link lama `/pos/xxx` ditangani guard [branch].)
 */
export default function PosIndexRedirect() {
  redirect("/pospare");
}
