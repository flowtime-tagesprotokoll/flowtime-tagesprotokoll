-- Monatlicher Arbeitsplan pro Shop. Mitarbeiter sehen, Admin + ausgewaehlte
-- Mitarbeiter (Soner) duerfen bearbeiten.

-- Flag auf Mitarbeiter-Profil: darf den Arbeitsplan eintragen.
alter table public.profiles
  add column if not exists darf_arbeitsplan boolean not null default false;

update public.profiles set darf_arbeitsplan = true where name ilike 'Soner%';

-- Eintraege selbst: ein Datensatz pro (Shop, Datum, Schichtnummer).
create table if not exists public.arbeitsplaene (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  datum date not null,
  schicht_nr smallint not null check (schicht_nr in (1, 2)),
  eintrag text,
  aktualisiert_am timestamptz not null default now(),
  unique (shop_id, datum, schicht_nr)
);

create index if not exists idx_arbeitsplaene_shop_datum on public.arbeitsplaene (shop_id, datum);

alter table public.arbeitsplaene enable row level security;

-- Lesen darf jeder (auch Mitarbeiter ohne Auth-Konto).
drop policy if exists arbeitsplaene_select on public.arbeitsplaene;
create policy arbeitsplaene_select on public.arbeitsplaene for select using (true);

-- Schreiben direkt auf der Tabelle: nur Admin (auth.uid gesetzt + Profil-Admin).
-- Mitarbeiter laufen ueber die RPC unten, die die Berechtigung selbst prueft.
drop policy if exists arbeitsplaene_write_admin on public.arbeitsplaene;
create policy arbeitsplaene_write_admin on public.arbeitsplaene
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- RPC fuer Mitarbeiter mit darf_arbeitsplan = true. Setzt einen Eintrag
-- (Upsert) und prueft die Berechtigung intern. SECURITY DEFINER damit der
-- Aufruf die RLS-Policies umgehen kann.
create or replace function public.set_arbeitsplan_eintrag(
  _profile_id uuid,
  _shop_id   uuid,
  _datum     date,
  _schicht_nr smallint,
  _eintrag   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = _profile_id
      and aktiv = true
      and (rolle = 'admin' or darf_arbeitsplan = true)
  ) then
    raise exception 'Keine Berechtigung fuer Arbeitsplan-Bearbeitung';
  end if;
  insert into public.arbeitsplaene (shop_id, datum, schicht_nr, eintrag, aktualisiert_am)
  values (_shop_id, _datum, _schicht_nr, nullif(trim(_eintrag), ''), now())
  on conflict (shop_id, datum, schicht_nr)
  do update set
    eintrag = excluded.eintrag,
    aktualisiert_am = excluded.aktualisiert_am;
end
$$;

grant execute on function public.set_arbeitsplan_eintrag(uuid, uuid, date, smallint, text)
  to anon, authenticated, service_role;
