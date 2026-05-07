-- =====================================================
-- Flowtime Tagesprotokoll — Initial Schema
-- Migration 0001
-- =====================================================
-- Auth-Modell: Nur Admin (Tamer) hat Auth-Konto. Mitarbeiter wählen sich
-- über Profil-Liste aus, ohne eigenes Login. Anon-Zugriff via Publishable
-- Key, RLS schränkt auf heutiges Datum ein.

create extension if not exists "uuid-ossp";

-- =====================================================
-- TABLES
-- =====================================================

create table public.shops (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  kurz          text not null,
  aktiv         boolean not null default true,
  reihenfolge   int not null default 0,
  created_at    timestamptz not null default now()
);

create table public.profiles (
  id            uuid primary key default uuid_generate_v4(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  name          text not null,
  rolle         text not null check (rolle in ('admin', 'bezirksleiter', 'mitarbeiter')),
  aktiv         boolean not null default true,
  reihenfolge   int not null default 0,
  created_at    timestamptz not null default now()
);

create table public.shop_mitarbeiter (
  shop_id       uuid not null references public.shops(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  primary key (shop_id, profile_id)
);

create table public.protokolle (
  id              uuid primary key default uuid_generate_v4(),
  shop_id         uuid not null references public.shops(id) on delete restrict,
  datum           date not null,
  erstellt_von    uuid references public.profiles(id) on delete set null,
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  unique (shop_id, datum)
);

create table public.schichten (
  id                       uuid primary key default uuid_generate_v4(),
  protokoll_id             uuid not null references public.protokolle(id) on delete cascade,
  schicht_nr               int not null check (schicht_nr in (1, 2)),
  mitarbeiter_id           uuid references public.profiles(id) on delete set null,
  zeit_von                 time,
  zeit_bis                 time,
  kassenstart              numeric(10,2),
  kassenstart_manuell      boolean not null default false,
  kassenstart_grund        text,
  kassenabrechnung         numeric(10,2),
  beleg_storage_path       text,
  guthaben_kundenkarte     numeric(10,2),
  offene_auszahlungen      numeric(10,2),
  kassenist                numeric(10,2),
  kommentar                text,
  unique (protokoll_id, schicht_nr)
);

create table public.kassenbewegungen (
  id            uuid primary key default uuid_generate_v4(),
  schicht_id    uuid not null references public.schichten(id) on delete cascade,
  typ           text not null check (typ in ('einlage', 'entnahme')),
  beschreibung  text,
  betrag        numeric(10,2) not null,
  reihenfolge   int not null default 0
);

create table public.audit_log (
  id            bigserial primary key,
  ts            timestamptz not null default now(),
  profile_id    uuid references public.profiles(id) on delete set null,
  user_name     text,
  rolle         text,
  action        text not null,
  proto_id      uuid,
  field         text,
  old_val       jsonb,
  new_val       jsonb
);

-- =====================================================
-- TRIGGERS
-- =====================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.aktualisiert_am = now();
  return new;
end;
$$ language plpgsql;

create trigger protokolle_set_updated_at
  before update on public.protokolle
  for each row execute function public.set_updated_at();

-- =====================================================
-- INDICES
-- =====================================================

create index idx_protokolle_shop_datum on public.protokolle (shop_id, datum desc);
create index idx_schichten_protokoll on public.schichten (protokoll_id);
create index idx_kassenbewegungen_schicht on public.kassenbewegungen (schicht_id);
create index idx_audit_ts on public.audit_log (ts desc);
create index idx_audit_proto on public.audit_log (proto_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

alter table public.shops enable row level security;
alter table public.profiles enable row level security;
alter table public.shop_mitarbeiter enable row level security;
alter table public.protokolle enable row level security;
alter table public.schichten enable row level security;
alter table public.kassenbewegungen enable row level security;
alter table public.audit_log enable row level security;

-- Hilfsfunktion: ist aktueller Auth-User Admin?
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where auth_user_id = auth.uid() and rolle = 'admin' and aktiv = true
  );
$$ language sql stable security definer;

-- Shops: lesen für alle, schreiben nur Admin
create policy shops_select_all on public.shops for select using (true);
create policy shops_admin_all on public.shops for all
  using (public.is_admin()) with check (public.is_admin());

-- Profiles: lesen für alle (Mitarbeiter-Dropdown), schreiben nur Admin
create policy profiles_select_all on public.profiles for select using (true);
create policy profiles_admin_all on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- shop_mitarbeiter
create policy shop_mit_select_all on public.shop_mitarbeiter for select using (true);
create policy shop_mit_admin_all on public.shop_mitarbeiter for all
  using (public.is_admin()) with check (public.is_admin());

-- Protokolle: Anon nur heute, Admin alles
create policy protokolle_select on public.protokolle for select
  using (public.is_admin() or datum = current_date);
create policy protokolle_insert on public.protokolle for insert
  with check (public.is_admin() or datum = current_date);
create policy protokolle_update on public.protokolle for update
  using (public.is_admin() or datum = current_date)
  with check (public.is_admin() or datum = current_date);
create policy protokolle_delete_admin on public.protokolle for delete
  using (public.is_admin());

-- Schichten: folgen Protokoll-Datum
create policy schichten_select on public.schichten for select using (
  public.is_admin() or exists (
    select 1 from public.protokolle p
    where p.id = schichten.protokoll_id and p.datum = current_date
  )
);
create policy schichten_write on public.schichten for all using (
  public.is_admin() or exists (
    select 1 from public.protokolle p
    where p.id = schichten.protokoll_id and p.datum = current_date
  )
) with check (
  public.is_admin() or exists (
    select 1 from public.protokolle p
    where p.id = schichten.protokoll_id and p.datum = current_date
  )
);

-- Kassenbewegungen: folgen Schicht
create policy kassenbewegungen_select on public.kassenbewegungen for select using (
  public.is_admin() or exists (
    select 1 from public.schichten s
    join public.protokolle p on p.id = s.protokoll_id
    where s.id = kassenbewegungen.schicht_id and p.datum = current_date
  )
);
create policy kassenbewegungen_write on public.kassenbewegungen for all using (
  public.is_admin() or exists (
    select 1 from public.schichten s
    join public.protokolle p on p.id = s.protokoll_id
    where s.id = kassenbewegungen.schicht_id and p.datum = current_date
  )
) with check (
  public.is_admin() or exists (
    select 1 from public.schichten s
    join public.protokolle p on p.id = s.protokoll_id
    where s.id = kassenbewegungen.schicht_id and p.datum = current_date
  )
);

-- Audit-Log: nur Admin liest, jeder schreibt
create policy audit_admin_read on public.audit_log for select using (public.is_admin());
create policy audit_anyone_insert on public.audit_log for insert with check (true);
