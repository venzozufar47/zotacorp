-- Rename "Cash (non-operasional)" → "Cash" for Cash Haengbocake Pare rekening,
-- and enforce branch = 'Pare' for all its transactions (mirroring Semarang pattern).

-- 1. Set default_branch on the Pare rekening itself.
update public.bank_accounts
set default_branch = 'Pare'
where id = '947136f6-4458-40e6-9c4b-fd3a2a183a9f';

-- 2. Rename category on its transactions.
update public.cashflow_transactions t
set category = 'Cash'
from public.cashflow_statements s
where s.id = t.statement_id
  and s.bank_account_id = '947136f6-4458-40e6-9c4b-fd3a2a183a9f'
  and t.category = 'Cash (non-operasional)';

-- 3. Force branch = 'Pare' for all its transactions.
update public.cashflow_transactions t
set branch = 'Pare'
from public.cashflow_statements s
where s.id = t.statement_id
  and s.bank_account_id = '947136f6-4458-40e6-9c4b-fd3a2a183a9f'
  and (t.branch is null or t.branch <> 'Pare');
