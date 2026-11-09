# State machines

This file lists the app's state machines: their states, invariants, transition tables, and the invalid states the code could actually reach. It was audited on 2026-11-09 against the code on `claude/akun-karyawan-rombak` (base `ccab8b28`) and the production database (Supabase `lzhplabqgbstttutftry`).

**Keep it current.** If you add a status value, a new writer of a status column, or a new side effect on a transition, update the machine's table here. If you fix or find an issue, update its entry under [Issues](#issues).

## How to read this

- **Explicit** machine: a `status`-like column with a `CHECK` constraint.
- **Implicit** machine: the state is a combination of columns, for example `payment_status × voided_at × settled_at`.
- **Guard** says how a transition protects itself against a concurrent writer:
  - **CAS** (compare-and-set): the `UPDATE` filters on the source state (`.eq("status", "pending")`) and checks that a row came back.
  - **Read-check**: the code reads the state, checks it, and then writes with no state filter. Two writers can both pass the check. This is the most common bug class found in this audit.
  - **Unique**: a unique index makes the second writer fail.
  - **DB trigger**: Postgres enforces the rule for every client, including direct PostgREST calls.
- Every exported function in a `"use server"` file is a public endpoint. Any authenticated user can also call PostgREST directly with their own JWT. RLS limits which **rows** they can write, but not which **columns**, because `authenticated` has `UPDATE` on every column of most tables. So a UI-only or action-only rule is not a guard.

## Index

| # | Machine | Storage | Kind | Audit depth | Open issues |
|---|---|---|---|---|---|
| 1 | Payslip | `payslips.status`, `employee_response`, `payment_status` | explicit, composite | full | SM-11, SM-12 |
| 2 | Overtime | `overtime_requests.status` + `attendance_logs.overtime_status` | explicit, dual-write | full | none |
| 3 | Attendance log | `attendance_logs.checked_out_at`, `status`, `late_proof_status` | implicit + explicit | partial | SM-7 |
| 4 | Leave request | `leave_requests.status` | explicit | full | none |
| 5 | Approval request | `approval_requests.status` | explicit | full | none |
| 6 | POS sale / pesanan | `pos_sales.payment_status`, `voided_at`, `settled_at`, `cashflow_transaction_id` | implicit | full | SM-10 |
| 7 | POS shift | `pos_shifts.status` | explicit | full | none (well guarded) |
| 8 | Cake order | `cake_orders.status` + `pos_stock_movements` | explicit + side state | partial | SM-8 |
| 9 | Bonus run | `bonus_runs.status` + `bonus_run_shares` | explicit | full | none |
| 10 | Ticket | `tickets.status`, `handler_level` | explicit | partial | SM-9 |
| 11 | Assigned task | `assigned_tasks.status` | explicit | partial | none found |
| 12 | HR grievance | `hr_grievances.status` | explicit | partial | none found |
| 13 | Employee lifecycle | `profiles.is_active`, `resigned_at` | implicit | full | SM-6 |
| 14 | Employment contract | `employment_contracts.status` | explicit | listed only | not audited |
| 15 | Other machines | see [Not audited](#not-audited) | | listed only | |

---

## 1. Payslip

Files: `src/lib/actions/payslip.actions.ts`, `src/lib/payslip/lifecycle.ts`. DB guard: `payslips_guard_transitions` (migration 323).

**States.** `status ∈ {draft, finalized}` × `employee_response ∈ {pending, acknowledged, issue}` × `payment_status ∈ {unpaid, paid}`. `lifecycle.ts#overallStageLabel` collapses these into `draft | awaiting_response | issue | awaiting_payment | paid`.

**Invariants**

- I1. Employees only see `finalized` slips (RLS `employee_read_own_payslips`).
- I2. The money columns of a `finalized` slip do not change while it stays `finalized`. To change them, reopen it to `draft` first. This is a DB trigger since migration 323.
- I3. A slip is marked `paid` only while it is `finalized`. Unmarking is always allowed, for correcting a mistaken click.
- I4. An employee can change only `employee_response`, `employee_response_message`, and `employee_response_at`. This is a DB trigger since migration 323.
- I5. `employee_response = issue` implies `employee_response_message` is not empty (enforced in the action).

**Transitions**

| From | To | Action | Actor | Guard |
|---|---|---|---|---|
| none | draft | `calculatePayslip` (insert), `bulkCalculatePayslips` (upsert) | admin | unique `(user_id, month, year)` |
| draft | draft (recalculated) | `calculatePayslip`, `updatePayslipManualEntries`, `saveDeliverables` | admin | CAS `status=draft` (was read-check) |
| draft | draft (bulk recalculated) | `bulkCalculatePayslips` | admin | DB trigger I2 rejects a concurrently finalized row |
| draft | finalized | `finalizePayslip`, `bulkFinalizePayslipsForMonth` | admin | CAS `status=draft` (single finalize was unguarded) |
| finalized | draft | `reopenPayslip` | admin | asks for a second confirmation if `acknowledged` (SM-11) |
| finalized · pending/issue | finalized · acknowledged/issue/pending | `submitPayslipResponse` | owning employee | CAS `status=finalized` (was read-check) |
| finalized · issue | finalized · pending | `answerPayslipIssue` | admin | CAS `employee_response=issue` |
| finalized · unpaid | finalized · paid | `markPayslipPaid`, `bulkMarkPayslipsPaid` | admin | CAS `status=finalized` (was unguarded) |
| any · paid | any · unpaid | `markPayslipPaid(false)` | admin | none needed |

Fixed: SM-1, SM-4. Open: SM-11, SM-12.

## 2. Overtime

Files: `src/lib/actions/overtime.actions.ts`, `attendance.actions.ts` (check-out). **Payroll reads `attendance_logs.overtime_status` only.** `overtime_requests` is the review queue. See `payslip.actions.ts` near "overtime_requests currently informational".

**States.** `overtime_requests.status ∈ {pending, approved, rejected}` and `attendance_logs.overtime_status ∈ {null, pending, approved, rejected}`.

**Invariants**

- I1. Once a request is decided, `attendance_logs.overtime_status` equals `overtime_requests.status`. Production check on 2026-11-09 found 0 mismatches.
- I2. Only an admin sets `approved` or `rejected`. This is a DB trigger since migration 323.
- I3. `rejected` implies `is_overtime = false` and `overtime_minutes = 0`.

| From | To | Action | Guard |
|---|---|---|---|
| null | pending | check-out with overtime (`attendance.actions.ts`) | RLS on own open log |
| pending | approved / rejected | `reviewOvertimeRequest` | CAS on the request (was read-check). If the log write fails, the request goes back to `pending` (was: request decided, log not) |
| any | any | admin attendance edit (`overtimeStatus` patch) | admin only |

Fixed: SM-1 (self-approval), SM-3.

## 3. Attendance log

Files: `src/lib/actions/attendance.actions.ts`, `src/app/api/attendance/upload-proof/route.ts`.

**States.** Open (`checked_out_at IS NULL`) → closed. `status ∈ {on_time, late, late_excused, flexible, bonus, unknown}`. `late_proof_status ∈ {null, pending, approved, rejected}`.

**Invariants**

- I1. The employee can update only their own open log (RLS `attendance_update_own`).
- I2. `late_excused`, `late_proof_status ∈ {approved, rejected}`, and `late_proof_admin_note` are set only by an admin. This is a DB trigger since migration 323.

| From | To | Action | Actor |
|---|---|---|---|
| none | open | check-in (insert) | employee |
| open | closed | check-out | employee |
| late · proof null | late · proof pending | upload proof | employee |
| late · proof pending | late_excused · approved, or late · rejected | `reviewLateProof` | admin |
| any | bonus | `setLogWorkdayClassification` | admin |

Open: SM-7. The computed columns (`status`, `late_minutes`, `checked_in_at`, `bonus_day`) are written with the employee's own client.

## 4. Leave request

File: `src/lib/actions/leave-requests.actions.ts`. `status ∈ {pending, approved, rejected}`. The approver is an admin or any of the employee's direct leaders. There can be more than one leader.

| From | To | Action | Guard |
|---|---|---|---|
| none | pending | submit | none |
| pending | approved / rejected | `decideLeaveRequest` | CAS `status=pending` (was read-check: two leaders could both decide, the last write won, and the employee got two contradictory pushes) |

## 5. Approval request (SOP 2.4)

File: `src/lib/actions/approval-requests.actions.ts`. `status ∈ {pending, approved, rejected, changed, auto_approved}`.

Invariant: `auto_approved` is used only for a request that was still `pending` when the auto-approval wrote it, after 2 business days, with no money impact and no safety or sanction impact.

| From | To | Action | Guard |
|---|---|---|---|
| none | pending | `submitApprovalRequest` | none |
| pending | approved / rejected / changed | `decideApprovalRequest` (owner) | CAS (was read-check) |
| pending | auto_approved | `applyAutoApprovals`, which runs on every `listApprovalRequests` call | CAS (was unguarded: any page load could overwrite the owner's decision that landed between its SELECT and UPDATE) |

## 6. POS sale and pesanan

Files: `src/lib/actions/pos.actions.ts`, `pos-pesanan.actions.ts`, `src/lib/pos/settle-lease.ts`. Trigger: `cashflow_tx_void_pos_sale` (deleting the cashflow transaction sets `voided_at`).

**States (implicit)**

| State | `payment_status` | `voided_at` | `settled_at` | `cashflow_transaction_id` |
|---|---|---|---|---|
| Pesanan open | pending | null | null | null |
| Pesanan settling (claim) | pending | null | now, under 2 min | null |
| Pesanan cancelled | pending | set | null | null |
| Paid (cash/QRIS) | paid | null | set (null on legacy rows) | set |
| Paid (admin) | paid | null | set | null |
| Voided after paid | paid | set | set | null (the transaction is deleted) |

**Invariants**

- I1. `pending` implies `settled_at IS NULL`, except during a live settle claim. Verified in production on 2026-11-09: 54 of 54 pending rows had `settled_at` null.
- I2. A paid cash or QRIS sale has exactly one cashflow credit. 0 rows in production have none.
- I3. A sale is never both paid and cancelled through the pesanan flow. Voiding a paid sale goes only through `voidPosSale`, which deletes the ledger row first.

| From | To | Action | Guard |
|---|---|---|---|
| none | paid | `createPosSale` (direct sale) | none needed |
| none | open | `createPosSale` (pesanan) | none needed |
| open | open (items edited) | `editPesanan` | CAS claim + lease-free (was CAS only) |
| open | settling → paid | `settlePesanan` | **claim lease** `settled_at` (was read-check, so a double tap or two devices produced two cashflow credits, which is double revenue). The final write uses CAS on its own claim. On failure the claim is released |
| open | cancelled | `cancelPesanan` | CAS `voided_at IS NULL` **and** `payment_status=pending` and no live lease (was `voided_at` only, so cancelling while another device settled left a paid and voided sale with its money still counted) |
| paid | voided | `voidPosSale` | deleting the ledger row is the atomic gate; admin settles use CAS `voided_at IS NULL` |

Fixed: SM-2. Open: SM-10.

## 7. POS shift

File: `src/lib/actions/pos-shift.actions.ts`. `status ∈ {open, closed}`. This one is well guarded and is the model to follow.

| From | To | Action | Guard |
|---|---|---|---|
| none | open | `openShift` | unique index "one open shift per account" (23505). Expense rows are compensated if they fail |
| open | closed | `closeShift` | CAS `status=open`. Expenses written for a losing close are deleted |
| open | closed (forced) | `forceCloseShift` (admin) | CAS `status=open` |

## 8. Cake order

Files: `src/lib/actions/cake-orders.actions.ts`, `src/lib/cake-orders/ready-stock.ts`. `status ∈ {submitted, in_progress, ready, delivering, done, cancelled, discarded}`. For ready-stock cakes, `pos_stock_movements` (`production` and `withdrawal`, unique per `(cake_order_id, type)`) mirrors physical stock.

**Invariant.** A ready-stock cake has a `withdrawal` movement exactly when its status is one of `done`, `cancelled`, or `discarded`, or when it was sold through POS or claimed free.

| From | To | Action | Notes |
|---|---|---|---|
| none | submitted | order form | |
| submitted | in_progress | `verifyAndSendSlip` | automatic only |
| submitted, in_progress | ready | `setOrderProductionStatus` | CAS `.in(status, [submitted, in_progress])` |
| ready | in_progress | production revert | CAS `status=ready` |
| ready, delivering | done | `updateCakeOrderStatus` | pickup orders go through POS `markCakePickedUpAtPos`. Records a withdrawal |
| any | cancelled | `updateCakeOrderStatus` | records a withdrawal |
| done | earlier column | drag-back | clears `picked_up_*` and reverses the withdrawal |
| **cancelled** | earlier column | drag-back | **does not reverse the withdrawal** (SM-8) |

`updateCakeOrderStatus` validates against a value it read earlier and writes without a state filter (read-check). The stock side effects are idempotent because of the unique index, so the practical impact is limited to SM-8.

## 9. Bonus run

Files: `src/lib/actions/bonus.actions.ts`, `src/lib/bonus/publish-run.ts`. `status ∈ {draft, finalized}`. Unique `(branch, period)` and `(run_id, user_id)`.

**Invariant.** A `finalized` run has its `bonus_run_shares`. Recipients see only finalized runs.

| From | To | Action | Guard |
|---|---|---|---|
| none | draft | `publishBonusRunRows` seed (upsert, ignoring duplicates) | unique |
| draft | finalized | claim inside `publishBonusRunRows` | CAS `status=draft` |
| finalized | draft | rollback when writing shares fails | CAS `status=finalized` |

The old code upserted `finalized` before writing shares. If writing shares failed, the run stayed finalized with no shares, and every retry was refused with "sudah terbit" (already published). Two concurrent publishes both ran and sent pushes twice. Fixed in SM-5.

## 10. Ticket

File: `src/lib/actions/tickets.actions.ts`. `status ∈ {open, in_progress, escalated, owner_handling, resolved, cancelled}` × `handler_level`. Most transitions are CAS and check the affected rows; `notifications.test.ts` covers this. The exception is `delegateTicket` (SM-9).

## 11 to 13. Assigned task, grievance, employee lifecycle

- **Assigned task** `{backlog, open, submitted, approved, cancelled}`: submit, review, and cancel are CAS with row checks. No issue found.
- **Grievance** `{submitted, confirmed, investigating, decided}`: confirm is CAS `status=submitted`, decide is CAS `status≠decided`. No issue found.
- **Employee lifecycle** (implicit): pending registration (`is_active=false`, `resigned_at` null), then active (`is_active=true`), then resigned (`is_active=false`, `resigned_at` set). A resigned employee can be reactivated, and the audit columns are kept. Admin approval and rejection are CAS (`pending-registrations.actions.ts`). Before migration 323, `profiles_update_own` let a pending registrant set their own `is_active=true` through PostgREST and skip approval. The DB trigger `profiles_guard_lifecycle` now blocks this. See SM-1. Open: SM-6.

## Not audited

These have status columns but were only listed, not traced. Audit them before relying on them:

- `employment_contracts`: `draft → pending_signature → signed → terminated`. Unguarded updates were seen at lines 702, 804, 1167, and 1328.
- `cashflow_statements` (`draft`, `confirmed`)
- `cash_closings` (`pending_verification`, `verified`)
- `verifications` (`pending`, `verified`, `rejected`, `void`; has unit tests)
- `procurement_purchases.review_status` and `arrived_at`
- `yeobo_booth` bookings (`scheduled`, `ongoing`, `completed`, `cancelled` × `payment_status`)
- `booth` sessions and events
- `product_rnd`
- `cleaning_task_completions.review_status` (has a DB guard, migration 130)
- `evaluation_360`
- `unit_scorecard` periods and actions
- `social_insights` runs
- `customer_complaints`
- `sop` governance

---

## Issues

Priority means business impact × reachability. **P0**: anyone with an employee account can do it today. **P1**: money or payroll goes wrong under ordinary concurrency, such as a double tap, two devices, or two approvers. **P2**: a state gets stuck, or there are duplicate notifications. **P3**: an edge case with limited impact.

| ID | P | Status | Summary |
|---|---|---|---|
| SM-1 | P0 | **Fixed in code, migration 323 not yet applied** | Employees could write decision columns directly |
| SM-2 | P1 | Fixed | Pesanan double settle and settle-versus-cancel races |
| SM-3 | P1 | Fixed | Pending-decision read-check races (overtime, leave, approvals) |
| SM-4 | P1 | Fixed | Payslip lifecycle read-check races and double finalize |
| SM-5 | P2 | Fixed | Bonus publish left a finalized run without shares |
| SM-6 | P1 | **Open, needs a product decision** | `/api/profile/update` lets employees edit payroll fields on themselves |
| SM-7 | P2 | Open | Computed attendance columns are written with the employee's client |
| SM-8 | P3 | Open | Reopening a cancelled ready-stock cake leaves its stock withdrawn |
| SM-9 | P3 | Open | `delegateTicket` reports success and pushes when the update hit 0 rows |
| SM-10 | P3 | Open | A settle that starts during `editPesanan` can see half-edited items |
| SM-11 | P3 | Open, decision | `reopenPayslip` allows reopening a paid slip, giving draft + paid |
| SM-12 | P3 | Open | `saveDeliverables` replaces deliverables before the draft check holds |

### SM-1: employees can write decision columns directly (P0)

**Evidence (production, 2026-11-09).**

- `information_schema.column_privileges`: `authenticated` has `UPDATE` on all 41 `payslips` columns.
- `pg_policies`:
  - `payslip_self_response_update` checks only `auth.uid() = user_id and status = 'finalized'`.
  - `attendance_update_own` checks only `user_id = auth.uid() and checked_out_at is null`, and `attendance_insert_own` checks only `user_id = auth.uid()`.
  - `profiles_update_own` checks only `id = auth.uid()` and `role = 'employee'`.
- Before 323 there was no trigger on `payslips` except the issue archive, and no trigger on `attendance_logs` except `updated_at`.

**Reachable attacks**, each a single PostgREST call made with the employee's own session:

- `PATCH /payslips?id=eq.<own>` with `{payment_status: 'paid', net_total: …}`.
- `POST /attendance_logs` with `{date: <past>, is_overtime: true, overtime_minutes: 600, overtime_status: 'approved'}`. Payroll pays it, because `payslip.actions.ts` only checks `log.overtime_status === 'approved'`.
- `PATCH /profiles?id=eq.<self>` with `{is_active: true}`. A pending registrant approves themself.

**Fix.** `supabase/migrations/323_state_machine_guards.sql` adds `BEFORE` triggers in the same pattern as `cleaning_guard_review_columns`. Admins and the service role pass, and everyone else is limited to the columns their workflow needs. It also makes the money columns of a finalized payslip immutable for every role. That also closes the race between bulk recalculate and finalize, whose upsert cannot carry a state filter.

**Test.** `supabase/tests/state_machine_guards.test.sql` runs in one transaction and rolls back.

**Not yet applied to production.** Apply it, then run the SQL test.

### SM-2: pesanan settle (P1)

`settlePesanan` checked `payment_status = 'pending'` and then created the ledger row with no claim. Two settles that overlap (a double tap, or two cashier devices) both inserted a `cashflow_transactions` credit. Each overwrote `pos_sales.cashflow_transaction_id`, so one credit became an orphan: double revenue that `voidPosSale` cannot remove. A cancel racing a settle left the sale paid and voided with its ledger row still counted. No duplicate was found in production yet, so the bug is reachable but has not been seen.

**Fix.** Claim with `settled_at` before any side effect, using a 2-minute lease (`src/lib/pos/settle-lease.ts`). The final write is CAS on that claim. Every failure path releases the claim. Edit and cancel refuse while a live claim exists.

**Residual.** If a claim outlives its lease (the process stalls for more than 2 minutes) and is taken over, the losing settle's rollback calls `reverseReadyCakeSalePayments(saleId)`, which deletes cake-payment legs by sale and could remove the winner's legs too. This is theoretical.

### SM-3: pending-decision races (P1)

`reviewOvertimeRequest`, `decideLeaveRequest`, `decideApprovalRequest`, and `applyAutoApprovals` each read `pending` and then wrote with no state filter. Overtime was the worst case: it is a dual write, so two admins interleaving could leave the request `rejected` while the log, which payroll reads, says `approved`. Overtime also ignored the error from the log write, which left the request decided while payroll never saw the decision. All of these are now CAS with a check on the affected rows. A failed overtime log write now returns the request to `pending`.

### SM-4: payslip lifecycle (P1)

- `calculatePayslip` and `updatePayslipManualEntries` could overwrite the numbers of a slip that was finalized between their read and their write.
- `submitPayslipResponse` could record an acknowledgement on a slip just reopened for revision.
- `finalizePayslip` on an already finalized slip (a double click, or two admins) cleared the employee's acknowledgement or dispute and pushed a second time.
- `markPayslipPaid` and `bulkMarkPayslipsPaid` could mark a draft slip paid.

All of these now use CAS. Bulk upsert is covered by the trigger from SM-1.

### SM-5: bonus publish (P2)

See [machine 9](#9-bonus-run).

### SM-6: employees can edit payroll fields on themselves (P1, open)

`src/app/api/profile/update/route.ts` writes with the **service role** and has one `ALLOWED_FIELDS` list for self-edits and admin edits. Any employee can therefore set these fields on their own profile:

- `grace_period_min`, `work_start_time`, `work_end_time`, `workdays`, `workday_check_enabled`, `is_flexible_schedule`, `break_enabled`, `break_windows`: these change lateness, and therefore late penalties and attendance status.
- `holiday_bonus_enabled`, `extra_work_enabled`, `payslip_excluded`, `is_probation`
- `business_unit`, `job_role`, `first_day_of_work`

The service role bypasses SM-1's triggers. This is a product decision: decide which fields an employee may edit on their own profile, then split the list into self-editable fields and admin-only fields.

### SM-7: computed attendance columns are self-writable (P2, open)

Check-in and check-out write `status`, `late_minutes`, `checked_in_at`, and `bonus_day` with the employee's client, so an employee can rewrite them through PostgREST while their log is open. Migration 323 only locks the decision columns. Fix: move check-in and check-out writes to the service role, then guard those columns too.

### SM-8: reopening a cancelled ready-stock cake (P3, open)

`updateCakeOrderStatus` reverses the stock withdrawal only when moving out of `done`. Moving out of `cancelled` (back to `ready` or `delivering`) leaves the cake counted as withdrawn while the board shows it available. Production has no such row yet. Fix: also reverse when `current === 'cancelled'`. Also make the status write CAS on `current`.

### SM-9: `delegateTicket` false success (P3, open)

The update uses `.in("status", ["open", "in_progress"])` but does not `.select()` the affected rows. If the ticket was resolved or cancelled concurrently, the action still returns ok and pushes "Tiket diteruskan ke kamu" (ticket forwarded to you).

### SM-10: settle during an edit (P3, open)

`editPesanan` claims at the start and re-checks before writing the header, but a settle that claims after the edit's first check can read items while they are being rewritten. The header CAS rejects the edit, but the item rows were already changed. A full fix needs the edit to take the same lease.

### SM-11: reopening a paid payslip (P3, open, decision)

`reopenPayslip` asks for a second confirmation only when the slip is `acknowledged`, not when it is `paid`. A recalculation after reopening changes `net_total` for money that has already been transferred. Decide whether a paid slip should be reopenable at all.

### SM-12: `saveDeliverables` ordering (P3, open)

The action checks `status = draft`, deletes and reinserts deliverables, and then recalculates. The recalculation is now CAS and fails if the slip was finalized in between, but the deliverables were already replaced under a finalized slip.

## Regression tests

| Test | Covers |
|---|---|
| `src/lib/state-machines/transitions.test.ts` (in `npm test`) | SM-2, SM-3, SM-4, SM-5. Runs the real server actions on `fake-db.ts`, which evaluates filters and can inject a concurrent write between read and write (`onRead`) or a failure (`failOn`). Against the pre-fix actions, 12 of 17 fail |
| `supabase/tests/state_machine_guards.test.sql` | SM-1 (DB triggers). Needs migration 323 applied, or pasted after `begin;` |
| `src/lib/tickets/notifications.test.ts` | ticket CAS (existing) |

## Production evidence queries (2026-11-09)

All of these returned 0, meaning no invalid state has been observed yet. The races above are reachable from the code; none had fired at the time of the audit.

- Paid cash or QRIS sales without a ledger row
- Draft payslips marked paid
- Decided overtime requests whose log disagrees
- Leave requests still `pending` but with `decided_at` set
- `auto_approved` approvals whose note is not the auto-approval note
- Duplicate pesanan ledger rows per sale
