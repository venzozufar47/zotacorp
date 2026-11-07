-- Isian profil diseragamkan di level database: nama lengkap, nama panggilan,
-- nama kontak darurat, tempat lahir, nomor WhatsApp, NPWP.
--
-- Melanjutkan 187 (yang hanya merapikan full_name). Alasan: nama panggilan,
-- nama kontak darurat, dan tempat lahir masih tertulis bebas ("DEVI", "chelsy",
-- "bu anjar", "SEMARANG", "Tasya" + emoji), nomor WhatsApp bercampur
-- "08…", "+62 8…", "8…", dan NPWP berisi "-", "Not ID", "Tidak ada", "0".
--
-- Trigger ini IDEMPOTEN dan tidak pernah menolak tulisan: ia hanya merapikan.
-- Penolakan dengan pesan jelas ada di lapisan aplikasi (src/lib/profile/normalize.ts),
-- yang HARUS dijaga sama dengan aturan di sini.
--
-- Aturan:
--   full_name              huruf, spasi, apostrof, titik, "-" di dalam kata; angka/emoji/simbol
--                          dibuang; "-" sebagai pemisah ("Tarisa - Nur Fitri") dibuang;
--                          huruf awal besar per kata (normalize_person_name).
--   nickname               emoji/simbol/angka dibuang, maks 30 karakter, huruf awal besar;
--                          kosong → NULL.
--   emergency_contact_name huruf awal besar per kata, termasuk dalam kurung
--                          ("Djumroni (ayah)" → "Djumroni (Ayah)"); "-", "0", kosong → NULL.
--   place_of_birth         huruf awal besar; "Kab.Semarang" → "Kab. Semarang"; "-"/kosong → NULL.
--   whatsapp_number,
--   emergency_contact_whatsapp
--                          "+62…" (08…, 8…, 62…, +62… dengan spasi/strip disatukan);
--                          kosong atau nol → NULL.
--   npwp                   hanya digit; "-", "Not ID", "Tidak ada", nol → NULL.

-- 1) normalize_person_name: "(" dan ")" ikut jadi pemisah kata, agar "(ayah)" → "(Ayah)".
create or replace function public.normalize_person_name(raw text)
returns text
language plpgsql
immutable
parallel safe
set search_path = public
as $$
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
$$;

-- 2) Pembersih per kolom.
create or replace function public.profile_tidy(p text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select btrim(regexp_replace(
    translate(normalize(p, NFC), E'‘’ʼ', ''''''''),
    '[[:space:]]+', ' ', 'g'))
$$;

create or replace function public.profile_clean_full_name(p text)
returns text
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  s text;
begin
  if p is null then
    return null;
  end if;
  s := public.profile_tidy(p);
  s := regexp_replace(s, '[^[:alpha:][:space:]''.-]', '', 'g');
  s := regexp_replace(s, '(^|[[:space:]])-+|-+($|[[:space:]])', ' ', 'g');
  return public.normalize_person_name(public.profile_tidy(s));
end
$$;

create or replace function public.profile_clean_nickname(p text)
returns text
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  s text;
begin
  if p is null then
    return null;
  end if;
  s := public.profile_tidy(p);
  s := regexp_replace(s, '[^[:alpha:][:space:]''.-]', '', 'g');
  s := public.profile_tidy(left(public.profile_tidy(s), 30));
  if s = '' then
    return null;
  end if;
  return public.normalize_person_name(s);
end
$$;

create or replace function public.profile_clean_contact_name(p text)
returns text
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  s text;
begin
  if p is null then
    return null;
  end if;
  s := public.profile_tidy(p);
  if s ~ '^[-0[:space:]]*$' then
    return null;
  end if;
  return public.normalize_person_name(s);
end
$$;

create or replace function public.profile_clean_place(p text)
returns text
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  s text;
begin
  if p is null then
    return null;
  end if;
  s := public.profile_tidy(p);
  if s ~ '^[-0[:space:]]*$' then
    return null;
  end if;
  s := regexp_replace(s, '\.(?=[[:alpha:]])', '. ', 'g');
  return public.normalize_person_name(s);
end
$$;

create or replace function public.profile_clean_whatsapp(p text)
returns text
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  d text;
begin
  if p is null then
    return null;
  end if;
  d := regexp_replace(p, '\D', '', 'g');
  if d = '' or d ~ '^0+$' then
    return null;
  end if;
  if left(d, 1) = '0' then
    d := '62' || substr(d, 2);
  elsif left(d, 1) = '8' then
    d := '62' || d;
  end if;
  return '+' || d;
end
$$;

create or replace function public.profile_clean_npwp(p text)
returns text
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  d text;
begin
  if p is null then
    return null;
  end if;
  d := regexp_replace(p, '\D', '', 'g');
  if d = '' or d ~ '^0+$' then
    return null;
  end if;
  return d;
end
$$;

-- 3) Satu trigger untuk semua kolom di atas (menggantikan trigger khusus full_name dari 187).
create or replace function public.profiles_normalize()
returns trigger
language plpgsql
set search_path = public
as $$
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
$$;

drop trigger if exists profiles_normalize_full_name on public.profiles;
drop trigger if exists profiles_normalize on public.profiles;
create trigger profiles_normalize
  before insert or update on public.profiles
  for each row execute function public.profiles_normalize();

-- 4) Koreksi satu akun: "Tarisa - Nur Fitri" berisi nama panggilan di dalam nama lengkap.
update public.profiles
   set full_name = 'Nur Fitri Permata Sari',
       nickname = 'Tarisa'
 where full_name = 'Tarisa - Nur Fitri'
   and nickname is null;

-- 5) Rapikan data yang sudah ada (hanya baris yang memang berubah).
update public.profiles
   set full_name = full_name
 where (full_name, nickname, emergency_contact_name, place_of_birth,
        whatsapp_number, emergency_contact_whatsapp, npwp)
       is distinct from
       (coalesce(nullif(public.profile_clean_full_name(full_name), ''), btrim(full_name)),
        public.profile_clean_nickname(nickname),
        public.profile_clean_contact_name(emergency_contact_name),
        public.profile_clean_place(place_of_birth),
        public.profile_clean_whatsapp(whatsapp_number),
        public.profile_clean_whatsapp(emergency_contact_whatsapp),
        public.profile_clean_npwp(npwp));
