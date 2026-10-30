-- Susulan 273: kebijakan baca kampanye diskon memeriksa `bank_account_assignees` langsung (bukan lewat
-- is_admin_or_pos_assignee), jadi kasir Semarang tidak melihat kampanye rekening POS Mamaya House.
-- Samakan: penugasan rekening induk (`ledger_account_id`) ikut berlaku.

drop policy if exists "pos_disc_assignee_select" on public.pos_discount_campaigns;
create policy "pos_disc_assignee_select"
  on public.pos_discount_campaigns for select
  to authenticated
  using (
    exists (
      select 1 from public.bank_account_assignees ba
      where ba.user_id = auth.uid()
        and (
          ba.bank_account_id = pos_discount_campaigns.bank_account_id
          or ba.bank_account_id = (
            select b.ledger_account_id from public.bank_accounts b
            where b.id = pos_discount_campaigns.bank_account_id
          )
        )
    )
  );
