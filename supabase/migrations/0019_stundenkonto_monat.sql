-- Monats-Override für das Stundenkonto:
--   * ausgezahlt_override: normalerweise wird die vertragliche Sollstundenzahl
--     als "ausgezahlt" verbucht (das kommt aufs Bankkonto). Weicht die
--     Zahlung in einem Monat ab, wird der tatsaechliche Wert hier hinterlegt.
--   * zusatz_stunden: zusaetzliche Stunden, die NICHT als Schicht im
--     Protokoll erfasst wurden (z.B. Schulungen, bezahlter Freizeitausgleich).
--     Kann positiv oder negativ sein.
--   * notiz: Freitext (z.B. "Schulung Geldwaesche 8h").

create table if not exists public.stundenkonto_monat (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  monat text not null check (monat ~ '^\d{4}-\d{2}$'),
  ausgezahlt_override numeric(6, 2),
  zusatz_stunden numeric(6, 2) not null default 0,
  notiz text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (profile_id, monat)
);

alter table public.stundenkonto_monat enable row level security;

drop policy if exists stundenkonto_monat_select on public.stundenkonto_monat;
create policy stundenkonto_monat_select on public.stundenkonto_monat
  for select using (true);

drop policy if exists stundenkonto_monat_write_admin on public.stundenkonto_monat;
create policy stundenkonto_monat_write_admin on public.stundenkonto_monat
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on table public.stundenkonto_monat
  to anon, authenticated;
grant all on table public.stundenkonto_monat to service_role;

-- Neu: RPC beruecksichtigt jetzt monatliche Overrides + Zusatz-Stunden.
drop function if exists public.get_stundenkonto(uuid);
create or replace function public.get_stundenkonto(_profile_id uuid)
returns table (
  monat            text,
  ist_stunden      numeric,   -- Schichten + Zusatz-Stunden (Schulung etc.)
  soll_stunden     numeric,
  ausgezahlt       numeric,   -- Override wenn gesetzt, sonst Soll
  zusatz_stunden   numeric,
  diff             numeric,   -- ist - ausgezahlt (fliesst ins Guthaben)
  kum_saldo        numeric,
  ist_laufend      boolean,
  notiz            text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_basis stundenkonto_basis%rowtype;
  v_kum numeric;
  v_start date;
  v_now_month date;
  v_iter date;
  v_month_start date;
  v_month_end date;
  v_ist numeric;
  v_is_current boolean;
  v_month_key text;
  v_override numeric;
  v_zusatz numeric;
  v_notiz text;
  v_ausgezahlt numeric;
begin
  select * into v_basis from stundenkonto_basis where profile_id = _profile_id;
  if not found then
    return;
  end if;

  v_kum := v_basis.anfangssaldo;
  v_start := date_trunc('month', v_basis.anfangsstichtag + interval '1 day')::date;
  v_now_month := date_trunc('month', current_date)::date;
  v_iter := v_start;

  while v_iter <= v_now_month loop
    v_month_start := v_iter;
    v_month_end := (v_iter + interval '1 month' - interval '1 day')::date;
    v_is_current := (v_iter = v_now_month);
    v_month_key := to_char(v_iter, 'YYYY-MM');

    select coalesce(sum(extract(epoch from (sh.zeit_bis - sh.zeit_von)) / 3600.0), 0)
      into v_ist
      from public.schichten sh
      join public.protokolle p on p.id = sh.protokoll_id
     where sh.mitarbeiter_id = _profile_id
       and p.datum between v_month_start and v_month_end;

    -- Monats-Override + Zusatz
    v_override := null;
    v_zusatz := 0;
    v_notiz := null;
    select skm.ausgezahlt_override, skm.zusatz_stunden, skm.notiz
      into v_override, v_zusatz, v_notiz
      from stundenkonto_monat skm
     where skm.profile_id = _profile_id and skm.monat = v_month_key;

    v_ist := v_ist + coalesce(v_zusatz, 0);

    -- Ausgezahlt: im laufenden Monat noch 0, sonst Override oder Soll.
    if v_is_current then
      v_ausgezahlt := 0;
    else
      v_ausgezahlt := coalesce(v_override, v_basis.sollstunden_pro_monat);
    end if;

    v_kum := v_kum + (v_ist - v_ausgezahlt);

    monat          := v_month_key;
    ist_stunden    := round(v_ist::numeric, 2);
    soll_stunden   := v_basis.sollstunden_pro_monat;
    ausgezahlt     := round(v_ausgezahlt::numeric, 2);
    zusatz_stunden := round(coalesce(v_zusatz, 0)::numeric, 2);
    diff           := round((v_ist - v_ausgezahlt)::numeric, 2);
    kum_saldo      := round(v_kum::numeric, 2);
    ist_laufend    := v_is_current;
    notiz          := v_notiz;

    return next;
    v_iter := (v_iter + interval '1 month')::date;
  end loop;

  return;
end $$;

grant execute on function public.get_stundenkonto(uuid) to anon, authenticated;

-- RPC für Lohnjournal-Übersicht: alle aktiven Mitarbeiter x letzte 13 Monate
create or replace function public.get_lohnjournal(_von_monat text default null)
returns table (
  profile_id       uuid,
  profile_name     text,
  reihenfolge      int,
  monat            text,
  ist_stunden      numeric,
  soll_stunden     numeric,
  ausgezahlt       numeric,
  zusatz_stunden   numeric,
  diff             numeric,
  kum_saldo        numeric,
  ist_laufend      boolean,
  notiz            text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    p.name as profile_name,
    p.reihenfolge,
    gk.monat,
    gk.ist_stunden,
    gk.soll_stunden,
    gk.ausgezahlt,
    gk.zusatz_stunden,
    gk.diff,
    gk.kum_saldo,
    gk.ist_laufend,
    gk.notiz
  from public.profiles p
  join public.stundenkonto_basis b on b.profile_id = p.id
  cross join lateral public.get_stundenkonto(p.id) gk
  where p.aktiv = true
    and p.rolle <> 'admin'
    and coalesce(p.nur_verwaltung, false) = false
    and (_von_monat is null or gk.monat >= _von_monat)
  order by p.reihenfolge, p.name, gk.monat;
$$;

grant execute on function public.get_lohnjournal(text) to anon, authenticated;
