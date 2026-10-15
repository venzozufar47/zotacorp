-- Penulisan nama pengguna otomatis dirapikan, apa pun cara input-nya.
--
-- Masalah: nama masuk lewat banyak jalur (daftar mandiri, admin menambah/mengubah
-- user, ubah profil sendiri, undangan investor) dan tampil apa adanya —
-- "NUR HIDAYATUS SHOLEKHAH", "Sukma arum", "Ana Intaning " (spasi di ujung).
--
-- Solusi di level DATABASE (trigger), bukan di tiap form: satu sumber kebenaran
-- yang otomatis berlaku untuk SEMUA jalur tulis, termasuk yang dibuat nanti.
--
-- Aturan (public.normalize_person_name):
--   1. Spasi di ujung dibuang, spasi/tab/baris-baru berulang jadi satu spasi.
--   2. Tiap kata ditulis Huruf Awal Besar, sisanya kecil — juga setelah "-" dan
--      "." ("al-ayyubi" → "Al-Ayyubi", "m.raihan" → "M.Raihan").
--   3. Huruf setelah apostrof TIDAK dibesarkan: "ma'ruf" → "Ma'ruf",
--      "A'yunin" tetap (lazim di nama Indonesia).
--   4. Penulisan CamelCase yang disengaja DIBIARKAN: kata yang diawali huruf
--      besar, lalu kecil, lalu besar lagi ("McDonald", "DeAndre", "AbdulRahman").
--      Kata yang diawali huruf kecil dengan huruf besar di tengah ("sUKMA", hasil
--      CapsLock terbalik) tetap dirapikan.
--   5. Idempoten: normalize(normalize(x)) = normalize(x). NULL → NULL.
--
-- Hanya `public.profiles.full_name`. Tidak menyentuh dokumen yang sudah
-- tercetak/dibekukan (kontrak, slip gaji) dan tidak menyentuh pelanggan
-- (schema yeobo).

create or replace function public.normalize_person_name_segment(seg text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when seg = '' then ''
    when seg ~ '^[[:upper:]][[:lower:]]+.*[[:upper:]]' then seg
    else upper(left(seg, 1)) || lower(substr(seg, 2))
  end
$$;

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
      if ch = '-' or ch = '.' then
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

create or replace function public.profiles_normalize_full_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.full_name := public.normalize_person_name(new.full_name);
  return new;
end
$$;

drop trigger if exists profiles_normalize_full_name on public.profiles;
create trigger profiles_normalize_full_name
  before insert or update of full_name on public.profiles
  for each row execute function public.profiles_normalize_full_name();

-- Rapikan nama yang sudah ada (idempoten; hanya baris yang memang berubah).
update public.profiles
   set full_name = public.normalize_person_name(full_name)
 where full_name is distinct from public.normalize_person_name(full_name);
