-- Two extra rule knobs requested by the admin:
--
--   `side_filter`  — scope a rule to only debit or only credit rows
--                    (or 'any' for both). Lets admin write rules like
--                    "notes contains 'Transfer' AND it's a credit row".
--
--   `is_fallback`  — run this rule AFTER all non-fallback rules, and
--                    it only fills slots still null. Admin's phrase:
--                    "if category not match with anything". A fallback
--                    rule must pick exactly one of set_category or
--                    set_branch (enforced in the server action, not
--                    SQL, since we can't express xor cleanly here).

alter table public.cashflow_rules
  add column if not exists side_filter text not null default 'any'
    check (side_filter in ('any','debit','credit'));

alter table public.cashflow_rules
  add column if not exists is_fallback boolean not null default false;
