-- RLS ownership alone does not protect evidence columns from owner edits.
-- Browser subscription metadata remains writable; only the server records clicks.
revoke insert, update on public.push_subscriptions from anon, authenticated;
grant insert (user_id, endpoint, p256dh, auth, user_agent, device_label)
  on public.push_subscriptions to authenticated;
grant update (endpoint, p256dh, auth, user_agent, device_label)
  on public.push_subscriptions to authenticated;
