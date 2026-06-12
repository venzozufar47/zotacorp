/**
 * Pure per-branch-month dividend context — shared by the per-branch
 * allocation popover (`loadMonthContext` di yeobo-dividend.actions.ts) DAN
 * konsol dividen lintas cabang. Tidak menyentuh DB: semua input (PnL
 * report, recipients, branch config) di-PASS oleh pemanggil, supaya konsol
 * bisa fetch report SEKALI lalu menghitung 3 cabang tanpa re-fetch.
 */
import type { YeoboPnLReport } from "@/lib/cashflow/pnl-yeobo";
import type {
  DividendRecipient,
  DividendBranchConfig,
} from "@/lib/actions/yeobo-dividend.actions";
import {
  getYeoboDividendPool,
  cumulativeDividendPool,
  isBranchAfterBep,
  computeRecipientAmounts,
  investorPoolFracBeforeBep,
  type DivRecipient,
  type RecipientAmount,
} from "./dividend-allocation";

export interface BranchMonthContext {
  /** Recipients aktif (inactive sudah difilter). */
  recipients: DividendRecipient[];
  config: DividendBranchConfig;
  pool: number;
  /** Akumulasi dividen cabang s/d (year, month) inklusif. */
  cumThrough: number;
  /** Estimasi total bagi hasil investor s/d bulan ini (porsi investor
   *  sebelum BEP × akumulasi dividen). */
  investorRecouped: number;
  afterBep: boolean;
  computed: RecipientAmount[];
  /** Management % efektif (residual). */
  mgmtPct: number;
}

export function buildBranchMonthContext(args: {
  report: YeoboPnLReport;
  branch: string;
  year: number;
  month: number;
  /** Recipients cabang ini (boleh termasuk inactive — difilter di sini). */
  recipients: DividendRecipient[];
  config: DividendBranchConfig;
}): BranchMonthContext {
  const { report, branch, year, month, config } = args;
  const recipients = args.recipients.filter((r) => r.active);

  const pool = getYeoboDividendPool(report, branch, year, month);
  const cumThrough = cumulativeDividendPool(report, branch, year, month);
  const cumBefore = cumThrough - pool;
  const afterBep = isBranchAfterBep({
    config,
    cumulativeDividendBeforeMonth: cumBefore,
    year,
    month,
  });
  const investorRecouped = Math.round(
    investorPoolFracBeforeBep(config) * cumThrough
  );

  const divRecipients: DivRecipient[] = recipients.map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    poolPct: r.poolPct,
    investIdr: r.investIdr,
    sortOrder: r.sortOrder,
    userId: r.userId,
    contractId: r.contractId,
  }));
  const computed = computeRecipientAmounts({
    pool,
    afterBep,
    config,
    recipients: divRecipients,
  });

  // Management % efektif (residual). Σ poolPct = 100 → nominal 35/50; Jebres
  // (Σ = 110%) → turun (mgmt dikorbankan).
  const mgmtRow = computed.find((c) => c.kind === "management");
  const mgmtPct =
    pool > 0 && mgmtRow
      ? Math.round((mgmtRow.amount / pool) * 1000) / 10
      : afterBep
        ? config.mgmtPctAfterBep
        : config.mgmtPctBeforeBep;

  return {
    recipients,
    config,
    pool,
    cumThrough,
    investorRecouped,
    afterBep,
    computed,
    mgmtPct,
  };
}
