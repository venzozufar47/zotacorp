-- Zota Booth cloud schema. Portable: everything is prefixed booth_, and the only
-- dependency on the host project is public.booth_can_manage() (see the roles seam file).
-- No foreign keys point at tables outside booth_*; booking_id / pos_order_id are soft references.

create table public.booth_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null check (brand in ('yeobo_booth', 'yeobo_space')),
  venue text,
  starts_on date,
  ends_on date,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  booking_id uuid,
  pos_order_id uuid,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.booth_templates (
  id text primary key,
  name text not null,
  shots integer not null check (shots > 0),
  canvas jsonb not null,
  slots jsonb not null,
  footer jsonb,
  overlay_path text,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Frozen copy of every template version, so old sessions can be re-rendered with their original layout.
create table public.booth_template_versions (
  template_id text not null references public.booth_templates (id) on delete cascade,
  version integer not null,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  primary key (template_id, version)
);

create or replace function public.booth_templates_versioning()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.name, new.shots, new.canvas, new.slots, new.footer, new.overlay_path)
       is distinct from (old.name, old.shots, old.canvas, old.slots, old.footer, old.overlay_path) then
      new.version := old.version + 1;
      new.updated_at := now();
    else
      new.version := old.version;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.booth_templates_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.booth_template_versions (template_id, version, definition)
  values (
    new.id,
    new.version,
    jsonb_build_object(
      'id', new.id, 'name', new.name, 'shots', new.shots, 'canvas', new.canvas,
      'slots', new.slots, 'footer', new.footer, 'overlayPath', new.overlay_path, 'version', new.version
    )
  )
  on conflict (template_id, version) do nothing;
  return new;
end;
$$;

create trigger booth_templates_versioning
  before update on public.booth_templates
  for each row execute function public.booth_templates_versioning();

create trigger booth_templates_snapshot
  after insert or update on public.booth_templates
  for each row execute function public.booth_templates_snapshot();

create table public.booth_event_templates (
  event_id uuid not null references public.booth_events (id) on delete cascade,
  template_id text not null references public.booth_templates (id),
  position integer not null default 0,
  primary key (event_id, template_id)
);

create table public.booth_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null check (brand in ('yeobo_booth', 'yeobo_space')),
  location text,
  camera_driver text,
  token_hash text not null unique,
  active_event_id uuid references public.booth_events (id) on delete set null,
  app_version text,
  camera_ready boolean,
  printer_ready boolean,
  queue_pending integer,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.booth_sessions (
  id uuid primary key,
  event_id uuid not null references public.booth_events (id),
  device_id uuid not null references public.booth_devices (id),
  template_id text not null references public.booth_templates (id),
  template_version integer not null,
  status text not null default 'registered' check (status in ('registered', 'uploaded', 'deleted')),
  public_token text not null unique check (public_token ~ '^[A-Za-z0-9_-]{22,128}$'),
  captured_at timestamptz not null,
  uploaded_at timestamptz,
  expires_at timestamptz,
  printed_at timestamptz,
  created_at timestamptz not null default now()
);

create index booth_sessions_event_idx on public.booth_sessions (event_id, captured_at desc);
create index booth_sessions_device_idx on public.booth_sessions (device_id);
create index booth_sessions_expiry_idx on public.booth_sessions (expires_at) where status = 'uploaded';

create table public.booth_photos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.booth_sessions (id) on delete cascade,
  kind text not null check (kind in ('raw', 'final', 'print', 'thumb')),
  idx integer not null default 0,
  storage_path text not null,
  width integer,
  height integer,
  bytes bigint not null check (bytes > 0),
  unique (session_id, kind, idx)
);

-- Row level security: only booth managers (via the seam function) from the dashboard.
-- The booth API and gallery run server-side with the service role, which bypasses RLS.
alter table public.booth_events enable row level security;
alter table public.booth_templates enable row level security;
alter table public.booth_template_versions enable row level security;
alter table public.booth_event_templates enable row level security;
alter table public.booth_devices enable row level security;
alter table public.booth_sessions enable row level security;
alter table public.booth_photos enable row level security;

create policy booth_manage_all on public.booth_events for all to authenticated
  using (public.booth_can_manage()) with check (public.booth_can_manage());
create policy booth_manage_all on public.booth_templates for all to authenticated
  using (public.booth_can_manage()) with check (public.booth_can_manage());
create policy booth_manage_all on public.booth_template_versions for all to authenticated
  using (public.booth_can_manage()) with check (public.booth_can_manage());
create policy booth_manage_all on public.booth_event_templates for all to authenticated
  using (public.booth_can_manage()) with check (public.booth_can_manage());
create policy booth_manage_all on public.booth_devices for all to authenticated
  using (public.booth_can_manage()) with check (public.booth_can_manage());
create policy booth_manage_all on public.booth_sessions for all to authenticated
  using (public.booth_can_manage()) with check (public.booth_can_manage());
create policy booth_manage_all on public.booth_photos for all to authenticated
  using (public.booth_can_manage()) with check (public.booth_can_manage());

-- token_hash must never leave the server, not even to dashboard users.
revoke all on table public.booth_events, public.booth_templates, public.booth_template_versions,
  public.booth_event_templates, public.booth_devices, public.booth_sessions, public.booth_photos
  from anon, authenticated;
grant select, insert, update, delete on table public.booth_events, public.booth_templates,
  public.booth_template_versions, public.booth_event_templates, public.booth_sessions, public.booth_photos
  to authenticated;
grant select (id, name, brand, location, camera_driver, active_event_id, app_version, camera_ready,
  printer_ready, queue_pending, last_seen_at, revoked_at, created_at) on public.booth_devices to authenticated;
grant update (name, location, active_event_id, revoked_at) on public.booth_devices to authenticated;
grant all on table public.booth_events, public.booth_templates, public.booth_template_versions,
  public.booth_event_templates, public.booth_devices, public.booth_sessions, public.booth_photos
  to service_role;

-- Free-tier guard: the API refuses new sessions once booth photos pass a configured size.
create or replace function public.booth_storage_bytes()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(p.bytes), 0)::bigint
  from public.booth_photos p
  join public.booth_sessions s on s.id = p.session_id
  where s.status <> 'deleted';
$$;

revoke all on function public.booth_storage_bytes() from public, anon, authenticated;
grant execute on function public.booth_storage_bytes() to service_role;

-- Private buckets. No storage policies on purpose: only the service role (server) can touch them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('booth-templates', 'booth-templates', false, 5242880, array['image/png']),
  ('booth-photos', 'booth-photos', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;
