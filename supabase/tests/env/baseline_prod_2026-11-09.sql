-- Snapshot skema PRODUKSI (Supabase lzhplabqgbstttutftry) per 2026-11-09,
-- SEBELUM migrasi 323/324, hanya untuk tabel yang disentuh migrasi itu:
-- profiles, payslips, payslip_response_history, attendance_logs,
-- attendance_break_logs, overtime_requests — kolom, default, constraint,
-- indeks, RLS policy, trigger, dan fungsi trigger diambil apa adanya dari
-- pg_catalog. Foreign key ke tabel lain (auth.users dll.) sengaja dilewati.
--
-- Pembantu Supabase yang ditiru: peran anon/authenticated/service_role,
-- auth.uid() dari request.jwt.claims, dan grant penuh untuk authenticated
-- (sama seperti produksi: 41/41 kolom payslips bisa di-UPDATE).
--
-- Dipakai supabase/tests/run-db-tests.mjs (Postgres lokal via PGlite).

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(current_setting('request.jwt.claim.sub', true),
             (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')),
    '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- ─── tabel ────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid not null,
  full_name text default ''::text not null,
  email text default ''::text not null,
  department text default ''::text not null,
  "position" text default ''::text not null,
  role text default 'employee'::text not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  nickname text,
  business_unit text,
  job_role text,
  gender text,
  date_of_birth date,
  place_of_birth text,
  current_city text,
  whatsapp_number text,
  npwp text,
  emergency_contact_name text,
  emergency_contact_whatsapp text,
  first_day_of_work date,
  motto text,
  shirt_size text,
  is_flexible_schedule boolean default false not null,
  work_start_time time without time zone default '09:00:00'::time without time zone not null,
  work_end_time time without time zone default '18:00:00'::time without time zone not null,
  grace_period_min integer default 15 not null,
  domisili_provinsi text,
  domisili_kota text,
  domisili_kecamatan text,
  domisili_kelurahan text,
  domisili_alamat text,
  asal_provinsi text,
  asal_kota text,
  asal_kecamatan text,
  asal_kelurahan text,
  asal_alamat text,
  extra_work_enabled boolean default false not null,
  streak_personal_best integer default 0 not null,
  streak_last_milestone integer default 0 not null,
  birthday_last_greeted date,
  anniversary_last_greeted date,
  payslip_excluded boolean default false not null,
  avatar_url text,
  avatar_seed text,
  is_probation boolean default false not null,
  pos_pin_hash text,
  workday_check_enabled boolean default false not null,
  workdays smallint default 126 not null,
  resigned_at timestamp with time zone,
  resigned_by uuid,
  break_enabled boolean default false not null,
  break_windows jsonb default '[]'::jsonb not null,
  holiday_bonus_enabled boolean default false not null,
  nik text,
  disc_test_required boolean default false not null,
  push_notification_exempt boolean default false not null,
  npwp_not_applicable boolean default false not null
);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'employee'::text, 'investor'::text])));
CREATE INDEX idx_profiles_resigned_at ON public.profiles USING btree (resigned_at) WHERE (resigned_at IS NOT NULL);
CREATE UNIQUE INDEX profiles_single_admin ON public.profiles USING btree (role) WHERE (role = 'admin'::text);
alter table public.profiles enable row level security;

create table public.overtime_requests (
  id uuid default gen_random_uuid() not null,
  attendance_log_id uuid not null,
  user_id uuid not null,
  date date not null,
  overtime_minutes integer not null,
  reason text not null,
  status text default 'pending'::text not null,
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.overtime_requests add constraint overtime_requests_log_unique UNIQUE (attendance_log_id);
alter table public.overtime_requests add constraint overtime_requests_pkey PRIMARY KEY (id);
alter table public.overtime_requests add constraint overtime_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.overtime_requests enable row level security;

create table public.payslips (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  month integer not null,
  year integer not null,
  actual_work_days integer default 0 not null,
  expected_work_days integer default 22 not null,
  base_salary numeric default 0 not null,
  prorated_salary numeric default 0 not null,
  extra_day_bonus numeric default 0 not null,
  total_overtime_minutes integer default 0 not null,
  overtime_pay numeric default 0 not null,
  total_late_minutes integer default 0 not null,
  late_penalty numeric default 0 not null,
  monthly_bonus numeric default 0 not null,
  monthly_bonus_note text,
  debt_deduction numeric default 0 not null,
  other_penalty numeric default 0 not null,
  other_penalty_note text,
  net_total numeric default 0 not null,
  status text default 'draft'::text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deliverables_achievement_pct numeric default 0 not null,
  deliverables_pay numeric default 0 not null,
  breakdown_json jsonb,
  extra_work_pay integer default 0 not null,
  debt_deduction_note text,
  debt_deduction_auto integer default 0 not null,
  debt_deduction_manual integer default 0 not null,
  inputs_signature text,
  employee_response text default 'pending'::text not null,
  employee_response_message text,
  employee_response_at timestamp with time zone,
  payment_status text default 'unpaid'::text not null,
  payment_at timestamp with time zone,
  payment_note text,
  bonus_day_pay integer default 0 not null,
  cake_bonus integer default 0 not null,
  cake_bonus_note text,
  admin_issue_reply text,
  admin_issue_reply_at timestamp with time zone
);
alter table public.payslips add constraint payslips_employee_response_check CHECK ((employee_response = ANY (ARRAY['pending'::text, 'acknowledged'::text, 'issue'::text])));
alter table public.payslips add constraint payslips_extra_work_pay_check CHECK ((extra_work_pay >= 0));
alter table public.payslips add constraint payslips_month_check CHECK (((month >= 1) AND (month <= 12)));
alter table public.payslips add constraint payslips_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'paid'::text])));
alter table public.payslips add constraint payslips_pkey PRIMARY KEY (id);
alter table public.payslips add constraint payslips_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'finalized'::text])));
alter table public.payslips add constraint payslips_user_id_month_year_key UNIQUE (user_id, month, year);
alter table public.payslips enable row level security;

create table public.payslip_response_history (
  id uuid default gen_random_uuid() not null,
  payslip_id uuid not null,
  user_id uuid not null,
  message text not null,
  responded_at timestamp with time zone,
  archived_at timestamp with time zone default now() not null,
  archived_reason text not null,
  admin_reply text
);
alter table public.payslip_response_history add constraint payslip_response_history_archived_reason_check CHECK ((archived_reason = ANY (ARRAY['refinalized'::text, 'edited'::text, 'answered'::text])));
alter table public.payslip_response_history add constraint payslip_response_history_pkey PRIMARY KEY (id);
alter table public.payslip_response_history enable row level security;

create table public.attendance_break_logs (
  id uuid default gen_random_uuid() not null,
  attendance_log_id uuid not null,
  user_id uuid not null,
  date date not null,
  window_start text not null,
  window_end text not null,
  break_out_at timestamp with time zone not null,
  break_out_latitude double precision,
  break_out_longitude double precision,
  break_out_selfie_path text,
  break_out_matched_location_id uuid,
  break_in_at timestamp with time zone,
  break_in_latitude double precision,
  break_in_longitude double precision,
  break_in_selfie_path text,
  break_in_matched_location_id uuid,
  late_return boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.attendance_break_logs add constraint attendance_break_logs_pkey PRIMARY KEY (id);
alter table public.attendance_break_logs enable row level security;

create table public.attendance_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  date date not null,
  checked_in_at timestamp with time zone not null,
  checked_out_at timestamp with time zone,
  latitude double precision,
  longitude double precision,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  status text default 'unknown'::text not null,
  late_minutes integer default 0 not null,
  late_proof_url text,
  is_overtime boolean default false not null,
  overtime_minutes integer default 0 not null,
  overtime_status text,
  late_checkout_reason text,
  late_proof_status text,
  late_proof_admin_note text,
  checkout_latitude double precision,
  checkout_longitude double precision,
  checkout_outside_note text,
  matched_location_id uuid,
  selfie_path text,
  is_early_arrival boolean default false not null,
  late_proof_reason text,
  bonus_day boolean default false not null,
  total_break_minutes integer default 0 not null,
  selfie_purged_at timestamp with time zone,
  selfie_ai_flag text,
  selfie_ai_note text,
  selfie_ai_verdict text,
  selfie_ai_attempts integer default 0 not null,
  selfie_ai_reviewed_at timestamp with time zone
);
alter table public.attendance_logs add constraint attendance_logs_late_proof_status_check CHECK ((late_proof_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.attendance_logs add constraint attendance_logs_overtime_status_check CHECK ((overtime_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.attendance_logs add constraint attendance_logs_pkey PRIMARY KEY (id);
alter table public.attendance_logs add constraint attendance_logs_selfie_ai_flag_check CHECK (((selfie_ai_flag IS NULL) OR (selfie_ai_flag = ANY (ARRAY['ok'::text, 'anomaly'::text]))));
alter table public.attendance_logs add constraint attendance_logs_selfie_ai_verdict_chk CHECK (((selfie_ai_verdict IS NULL) OR (selfie_ai_verdict = ANY (ARRAY['ok'::text, 'overridden'::text, 'unchecked'::text]))));
alter table public.attendance_logs add constraint attendance_logs_status_check CHECK ((status = ANY (ARRAY['on_time'::text, 'late'::text, 'late_excused'::text, 'flexible'::text, 'bonus'::text, 'unknown'::text])));
alter table public.attendance_logs add constraint attendance_logs_user_date_unique UNIQUE (user_id, date);
alter table public.attendance_logs enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;

-- ─── fungsi ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_payslip_issue_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.employee_response = 'issue'
     and old.employee_response_message is not null
     and btrim(old.employee_response_message) <> ''
     and new.employee_response_message is distinct from old.employee_response_message then
    insert into public.payslip_response_history (payslip_id, user_id, message, responded_at, archived_reason, admin_reply)
    values (
      old.id,
      old.user_id,
      old.employee_response_message,
      old.employee_response_at,
      case
        when new.admin_issue_reply_at is distinct from old.admin_issue_reply_at and new.admin_issue_reply_at is not null
          then 'answered'
        when old.status = 'draft' and new.status = 'finalized' then 'refinalized'
        else 'edited'
      end,
      case
        when new.admin_issue_reply_at is distinct from old.admin_issue_reply_at and new.admin_issue_reply_at is not null
          then new.admin_issue_reply
        else null
      end
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_person_name_segment(seg text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  select case
    when seg = '' then ''
    when seg ~ '^[[:upper:]][[:lower:]]+.*[[:upper:]]' then seg
    else upper(left(seg, 1)) || lower(substr(seg, 2))
  end
$function$;

CREATE OR REPLACE FUNCTION public.normalize_person_name(raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
declare
  t text;
  tok text;
  i int;
  ch text;
  seg text;
  res text;
  parts text[] := '{}';
begin
  if raw is null then
    return null;
  end if;
  t := regexp_replace(btrim(raw), '\s+', ' ', 'g');
  if t = '' then
    return '';
  end if;
  foreach tok in array string_to_array(t, ' ') loop
    res := '';
    seg := '';
    for i in 1..char_length(tok) loop
      ch := substr(tok, i, 1);
      if ch = '-' or ch = '.' or ch = '(' or ch = ')' then
        res := res || public.normalize_person_name_segment(seg) || ch;
        seg := '';
      else
        seg := seg || ch;
      end if;
    end loop;
    res := res || public.normalize_person_name_segment(seg);
    parts := parts || res;
  end loop;
  return array_to_string(parts, ' ');
end
$function$;

CREATE OR REPLACE FUNCTION public.profile_tidy(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  select btrim(regexp_replace(
    translate(normalize(p, NFC), E'‘’ʼ', ''''''''),
    '[[:space:]]+', ' ', 'g'))
$function$;

CREATE OR REPLACE FUNCTION public.profile_clean_contact_name(p text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $function$
declare s text;
begin
  if p is null then return null; end if;
  s := public.profile_tidy(p);
  if s ~ '^[-0[:space:]]*$' then return null; end if;
  return public.normalize_person_name(s);
end
$function$;

CREATE OR REPLACE FUNCTION public.profile_clean_full_name(p text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $function$
declare s text;
begin
  if p is null then return null; end if;
  s := public.profile_tidy(p);
  s := regexp_replace(s, '[^[:alpha:][:space:]''.-]', '', 'g');
  s := regexp_replace(s, '(^|[[:space:]])-+|-+($|[[:space:]])', ' ', 'g');
  return public.normalize_person_name(public.profile_tidy(s));
end
$function$;

CREATE OR REPLACE FUNCTION public.profile_clean_nickname(p text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $function$
declare s text;
begin
  if p is null then return null; end if;
  s := public.profile_tidy(p);
  s := regexp_replace(s, '[^[:alpha:][:space:]''.-]', '', 'g');
  s := public.profile_tidy(left(public.profile_tidy(s), 30));
  if s = '' then return null; end if;
  return public.normalize_person_name(s);
end
$function$;

CREATE OR REPLACE FUNCTION public.profile_clean_npwp(p text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $function$
declare d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '\D', '', 'g');
  if d = '' or d ~ '^0+$' then return null; end if;
  return d;
end
$function$;

CREATE OR REPLACE FUNCTION public.profile_clean_place(p text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $function$
declare s text;
begin
  if p is null then return null; end if;
  s := public.profile_tidy(p);
  if s ~ '^[-0[:space:]]*$' then return null; end if;
  s := regexp_replace(s, '\.(?=[[:alpha:]])', '. ', 'g');
  return public.normalize_person_name(s);
end
$function$;

CREATE OR REPLACE FUNCTION public.profile_clean_whatsapp(p text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $function$
declare d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '\D', '', 'g');
  if d = '' or d ~ '^0+$' then return null; end if;
  if left(d, 1) = '0' then d := '62' || substr(d, 2);
  elsif left(d, 1) = '8' then d := '62' || d;
  end if;
  return '+' || d;
end
$function$;

CREATE OR REPLACE FUNCTION public.profiles_normalize()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.full_name is not null then
    new.full_name := coalesce(
      nullif(public.profile_clean_full_name(new.full_name), ''),
      btrim(new.full_name)
    );
  end if;
  new.nickname := public.profile_clean_nickname(new.nickname);
  new.emergency_contact_name := public.profile_clean_contact_name(new.emergency_contact_name);
  new.place_of_birth := public.profile_clean_place(new.place_of_birth);
  new.whatsapp_number := public.profile_clean_whatsapp(new.whatsapp_number);
  new.emergency_contact_whatsapp := public.profile_clean_whatsapp(new.emergency_contact_whatsapp);
  new.npwp := public.profile_clean_npwp(new.npwp);
  return new;
end
$function$;

-- ─── trigger ──────────────────────────────────────────────────────────────

CREATE TRIGGER profiles_normalize BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_normalize();
CREATE TRIGGER set_attendance_logs_updated_at BEFORE UPDATE ON public.attendance_logs FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_overtime_requests_updated_at BEFORE UPDATE ON public.overtime_requests FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_archive_payslip_issue_message BEFORE UPDATE OF employee_response_message ON public.payslips FOR EACH ROW EXECUTE FUNCTION archive_payslip_issue_message();

-- ─── RLS policy ───────────────────────────────────────────────────────────

create policy attendance_delete_admin on public.attendance_logs as PERMISSIVE for DELETE to public using (is_admin());
create policy attendance_insert_own on public.attendance_logs as PERMISSIVE for INSERT to authenticated with check ((user_id = auth.uid()));
create policy attendance_select_admin on public.attendance_logs as PERMISSIVE for SELECT to authenticated using (is_admin());
create policy attendance_select_own on public.attendance_logs as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
create policy attendance_update_admin on public.attendance_logs as PERMISSIVE for UPDATE to authenticated using (is_admin());
create policy attendance_update_own on public.attendance_logs as PERMISSIVE for UPDATE to authenticated using (((user_id = auth.uid()) AND (checked_out_at IS NULL))) with check ((user_id = auth.uid()));
create policy profiles_insert_service on public.profiles as PERMISSIVE for INSERT to authenticated with check ((id = auth.uid()));
create policy profiles_select_admin on public.profiles as PERMISSIVE for SELECT to authenticated using (is_admin());
create policy profiles_select_own on public.profiles as PERMISSIVE for SELECT to authenticated using ((id = auth.uid()));
create policy profiles_update_admin on public.profiles as PERMISSIVE for UPDATE to authenticated using (is_admin());
create policy profiles_update_own on public.profiles as PERMISSIVE for UPDATE to authenticated using ((id = auth.uid())) with check (((id = auth.uid()) AND (role = 'employee'::text)));
create policy attendance_break_delete_admin on public.attendance_break_logs as PERMISSIVE for DELETE to public using (is_admin());
create policy attendance_break_insert_own on public.attendance_break_logs as PERMISSIVE for INSERT to public with check ((user_id = auth.uid()));
create policy attendance_break_select_admin on public.attendance_break_logs as PERMISSIVE for SELECT to public using (is_admin());
create policy attendance_break_select_own on public.attendance_break_logs as PERMISSIVE for SELECT to public using ((user_id = auth.uid()));
create policy attendance_break_update_admin on public.attendance_break_logs as PERMISSIVE for UPDATE to public using (is_admin());
create policy attendance_break_update_own on public.attendance_break_logs as PERMISSIVE for UPDATE to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy overtime_requests_delete_admin on public.overtime_requests as PERMISSIVE for DELETE to public using (is_admin());
create policy overtime_requests_insert_own on public.overtime_requests as PERMISSIVE for INSERT to authenticated with check ((user_id = auth.uid()));
create policy overtime_requests_select_admin on public.overtime_requests as PERMISSIVE for SELECT to authenticated using (is_admin());
create policy overtime_requests_select_own on public.overtime_requests as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
create policy overtime_requests_update_admin on public.overtime_requests as PERMISSIVE for UPDATE to authenticated using (is_admin());
create policy admin_full_payslips on public.payslips as PERMISSIVE for ALL to public using (is_admin());
create policy employee_read_own_payslips on public.payslips as PERMISSIVE for SELECT to public using (((auth.uid() = user_id) AND (status = 'finalized'::text)));
create policy payslip_self_response_update on public.payslips as PERMISSIVE for UPDATE to public using (((auth.uid() = user_id) AND (status = 'finalized'::text))) with check (((auth.uid() = user_id) AND (status = 'finalized'::text)));
create policy prh_admin_select on public.payslip_response_history as PERMISSIVE for SELECT to authenticated using (is_admin());
create policy prh_self_select on public.payslip_response_history as PERMISSIVE for SELECT to authenticated using ((user_id = auth.uid()));
