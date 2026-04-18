-- Admin-editable WhatsApp message templates.
--
-- Every outbound WA the system sends (birthday greeting, streak
-- milestone, attendance alert, reminder, etc.) has a string template
-- with {placeholder} interpolation points. Admins can customize the
-- copy per template from the Whatsapp tab in /admin/settings.
--
-- Missing rows = sistem fall back to hardcoded copy in
-- src/lib/whatsapp/templates.ts (TEMPLATE_DEFAULTS). "Reset to default"
-- in the UI is just a DELETE on the row.

create table public.whatsapp_templates (
  template_key text primary key,
  body text not null check (char_length(body) between 1 and 2000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.whatsapp_templates enable row level security;

-- Admins only. Dispatchers use the service-role client and bypass RLS.
create policy wa_templates_admin_select
  on public.whatsapp_templates for select to authenticated
  using (public.is_admin());

create policy wa_templates_admin_insert
  on public.whatsapp_templates for insert to authenticated
  with check (public.is_admin());

create policy wa_templates_admin_update
  on public.whatsapp_templates for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy wa_templates_admin_delete
  on public.whatsapp_templates for delete to authenticated
  using (public.is_admin());
