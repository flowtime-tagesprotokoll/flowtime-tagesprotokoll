-- Schulungs- und Fuehrungszeugnis-Tracking pro Mitarbeiter.
-- Drei Typen:
--   merlato_js       -> Jugend- und Spielerschutz, Praesenz, 2 Jahre gueltig
--   chevron_gw       -> Geldwaesche, Online, 1 Jahr gueltig
--   fuehrungszeugnis -> Polizeiliches FZ, max 1 Jahr alt

alter table public.profiles
  add column if not exists darf_zertifikate boolean not null default false;

-- Admin + Soner duerfen Zertifikate verwalten
update public.profiles
  set darf_zertifikate = true
  where rolle = 'admin' or name ilike 'Soner%';

create table if not exists public.zertifikate (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  typ text not null check (typ in ('merlato_js', 'chevron_gw', 'fuehrungszeugnis')),
  ausgestellt_am date not null,
  gueltig_bis date not null,
  datei_storage_path text,
  notiz text,
  hochgeladen_am timestamptz not null default now(),
  hochgeladen_von uuid references public.profiles(id) on delete set null
);

create index if not exists idx_zertifikate_profile
  on public.zertifikate (profile_id, typ, gueltig_bis desc);

alter table public.zertifikate enable row level security;

drop policy if exists zertifikate_select on public.zertifikate;
create policy zertifikate_select on public.zertifikate for select using (true);

drop policy if exists zertifikate_write_admin on public.zertifikate;
create policy zertifikate_write_admin on public.zertifikate
  for all using (public.is_admin()) with check (public.is_admin());

-- RPC fuer Soner und andere mit darf_zertifikate
create or replace function public.add_zertifikat(
  _profile_id uuid,
  _target_profile_id uuid,
  _typ text,
  _ausgestellt_am date,
  _gueltig_bis date,
  _datei_storage_path text,
  _notiz text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = _profile_id and aktiv = true and (rolle = 'admin' or darf_zertifikate = true)
  ) then
    raise exception 'Keine Berechtigung';
  end if;
  insert into public.zertifikate
    (profile_id, typ, ausgestellt_am, gueltig_bis, datei_storage_path, notiz, hochgeladen_von)
  values
    (_target_profile_id, _typ, _ausgestellt_am, _gueltig_bis,
     nullif(trim(_datei_storage_path), ''), nullif(trim(_notiz), ''), _profile_id)
  returning id into new_id;
  return new_id;
end $$;
grant execute on function public.add_zertifikat(uuid, uuid, text, date, date, text, text)
  to anon, authenticated, service_role;

create or replace function public.delete_zertifikat(_profile_id uuid, _zertifikat_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = _profile_id and aktiv = true and (rolle = 'admin' or darf_zertifikate = true)
  ) then
    raise exception 'Keine Berechtigung';
  end if;
  delete from public.zertifikate where id = _zertifikat_id;
end $$;
grant execute on function public.delete_zertifikat(uuid, uuid)
  to anon, authenticated, service_role;

-- Storage-Bucket fuer die Datei-Uploads
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('zertifikate', 'zertifikate', false, 10485760,
          ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;

drop policy if exists zertifikate_storage_read on storage.objects;
create policy zertifikate_storage_read on storage.objects for select
  using (bucket_id = 'zertifikate');
drop policy if exists zertifikate_storage_write on storage.objects;
create policy zertifikate_storage_write on storage.objects for insert
  with check (bucket_id = 'zertifikate');
drop policy if exists zertifikate_storage_delete on storage.objects;
create policy zertifikate_storage_delete on storage.objects for delete
  using (bucket_id = 'zertifikate');
