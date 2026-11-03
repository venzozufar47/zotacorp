"use server";

import { getCurrentUser } from "@/lib/supabase/cached";
import { resolveUserBranches } from "@/lib/branches/user-branches";
import { createAdminClient } from "./_supabase-admin";
import { requireAdminOrPosAssignee, type ActionResult } from "./_gates";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { wibDayStart } from "@/lib/feedback/store";
import { ASPECT_ALL_GOOD, type FeedbackBranch } from "@/lib/feedback/constants";

interface EmployeeFeedbackRow {
  id: string;
  branch: FeedbackBranch;
  rating: number;
  aspects: string[] | null;
  comment: string | null;
  product_wish: string | null;
  created_at: string;
}

export interface EmployeeFeedbackSummary {
  branch: FeedbackBranch;
  count: number;
  average: number | null;
  commentCount: number;
  productWishCount: number;
  productWishes: { text: string; count: number }[];
  topAspects: { key: string; count: number }[];
  recent: EmployeeFeedbackRow[];
}

/** Cabang selalu berasal dari sesi dan penugasan server, tidak menerima pilihan cabang dari klien. */
export async function getMyCustomerFeedback(): Promise<ActionResult<EmployeeFeedbackSummary[]>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Silakan masuk terlebih dahulu." };
  const branches = await resolveUserBranches(user.id);
  if (branches.length === 0) return { ok: true, data: [] };
  return loadFeedback(branches);
}

/** Cabang mengikuti rekening POS yang diizinkan, bukan pilihan cabang dari klien. */
export async function getPosCustomerFeedback(bankAccountId: string): Promise<ActionResult<EmployeeFeedbackSummary[]>> {
  const gate = await requireAdminOrPosAssignee(bankAccountId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const { data: account, error } = await createAdminClient().from("bank_accounts")
    .select("default_branch, ledger_account_id").eq("id", bankAccountId).maybeSingle();
  if (error) return { ok: false, error: "Outlet belum dapat dimuat." };
  const branch = account?.default_branch;
  if (account?.ledger_account_id || (branch !== "Pare" && branch !== "Semarang")) {
    return { ok: true, data: [] };
  }
  return loadFeedback([branch]);
}

async function loadFeedback(branches: FeedbackBranch[]): Promise<ActionResult<EmployeeFeedbackSummary[]>> {

  const today = jakartaDateString(new Date());
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  const since = wibDayStart(start.toISOString().slice(0, 10));
  const db = createAdminClient();
  const rows: EmployeeFeedbackRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("customer_feedback" as never)
      .select("id, branch, rating, aspects, comment, product_wish, created_at")
      .in("branch", branches)
      .eq("hidden", false)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 999);
    if (error) return { ok: false, error: "Feedback belum dapat dimuat. Coba muat ulang halaman." };
    const page = (data ?? []) as unknown as EmployeeFeedbackRow[];
    rows.push(...page);
    if (page.length < 1000) break;
  }

  return { ok: true, data: branches.map((branch) => {
    const own = rows.filter((row) => row.branch === branch);
    const counts = new Map<string, number>();
    const wishes = new Map<string, { text: string; count: number }>();
    for (const row of own) {
      const text = row.product_wish?.trim();
      if (text) {
        const key = text.toLocaleLowerCase("id-ID").replace(/\s+/g, " ");
        const existing = wishes.get(key);
        wishes.set(key, { text: existing?.text ?? text, count: (existing?.count ?? 0) + 1 });
      }
      for (const key of new Set(row.aspects ?? [])) {
        if (key !== ASPECT_ALL_GOOD) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return {
      branch,
      count: own.length,
      average: own.length ? own.reduce((sum, row) => sum + row.rating, 0) / own.length : null,
      commentCount: own.filter((row) => row.comment?.trim()).length,
      productWishCount: own.filter((row) => row.product_wish?.trim()).length,
      productWishes: [...wishes.values()].sort((a, b) => b.count - a.count),
      topAspects: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, count]) => ({ key, count })),
      recent: own.slice(0, 10),
    };
  }) };
}
