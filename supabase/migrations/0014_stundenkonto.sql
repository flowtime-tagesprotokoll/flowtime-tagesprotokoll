-- Stundenkonto pro Mitarbeiter:
--   - sollstunden_pro_monat: vertraglich vereinbarte monatliche Stunden
--   - anfangssaldo: Stunden-Saldo (Plus = Guthaben, Minus = Minus) zum
--     Stichtag (Stand Ende des Vormonats vor App-Einfuehrung)
--   - anfangsstichtag: Datum, ab dem das System rechnet
--     (Saldo gilt PER ENDE dieses Tages, naechster Monat zaehlt voll)
--
-- Berechnung des Live-Saldos:
--   Saldo = anfangssaldo
--         + sum over alle abgeschlossenen Monate ab (anfangsstichtag+1d):
--              (Ist-Stunden_des_Monats - sollstunden_pro_monat)
--         + (laufender Monat: Ist-bisher) - 0   (Soll wird erst bei
--                                                 Monatsende verrechnet)

create table if not exists public.stundenkonto_basis (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  sollstunden_pro_monat numeric(6, 2) not null,
  anfangssaldo numeric(7, 2) not null default 0,
  anfangsstichtag date not null default '2026-04-30',
  updated_at timestamptz not null default now()
);

alter table public.stundenkonto_basis enable row level security;

drop policy if exists stundenkonto_basis_select on public.stundenkonto_basis;
create policy stundenkonto_basis_select on public.stundenkonto_basis
  for select using (true);

drop policy if exists stundenkonto_basis_write_admin on public.stundenkonto_basis;
create policy stundenkonto_basis_write_admin on public.stundenkonto_basis
  for all using (public.is_admin()) with check (public.is_admin());

-- Seed Werte (Stand Ende April 2026, lt. Excel-Liste vom Inhaber).
-- Sepideh + Tamer haben (noch) keine Eintragung -- werden bei Bedarf
-- nachgepflegt.
insert into public.stundenkonto_basis
  (profile_id, sollstunden_pro_monat, anfangssaldo, anfangsstichtag)
select id, soll, saldo, date '2026-04-30'
from (values
  ('Soner Dönmez',     216.00::numeric,   0.00::numeric),
  ('Mehdi Tounsi',      82.00,            10.95),
  ('Erdem Gündem',      43.00,           -12.75),
  ('Oskar Lirek',       43.00,             0.28),
  ('Vedat Göktas',      43.00,            -8.51),
  ('Elhadji Mamadou',   43.00,            18.62),
  ('Riadh Sellami',     86.67,            13.58)
) as t(name, soll, saldo)
join public.profiles p on p.name = t.name
on conflict (profile_id) do update set
  sollstunden_pro_monat = excluded.sollstunden_pro_monat,
  anfangssaldo = excluded.anfangssaldo,
  anfangsstichtag = excluded.anfangsstichtag,
  updated_at = now();

-- RPC: liefert pro Monat ab anfangsstichtag bis aktueller Monat eine Zeile
-- mit Ist/Soll/Diff/KumulSaldo. SECURITY DEFINER, damit Mitarbeiter auch
-- ihre eigenen historischen Schichten zaehlen koennen, ohne dass die
-- schichten-RLS aufgeweicht werden muss.

create or replace function public.get_stundenkonto(_profile_id uuid)
returns table (
  monat            text,    -- 'YYYY-MM'
  ist_stunden      numeric, -- Stunden in DIESEM Monat aus Protokoll-Schichten
  soll_stunden     numeric, -- vereinbart pro Monat
  diff             numeric, -- ist - soll (Plus = Guthaben gewonnen)
  kum_saldo        numeric, -- kumuliert von anfangssaldo bis incl. dieses Monat
  ist_laufend      boolean  -- true wenn es der NICHT abgeschlossene aktuelle Monat ist
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
  v_effektiv_soll numeric;
begin
  select * into v_basis from stundenkonto_basis where profile_id = _profile_id;
  if not found then
    return;
  end if;

  v_kum := v_basis.anfangssaldo;
  -- Erster relevanter Monat = Monat nach dem anfangsstichtag.
  v_start := date_trunc('month', v_basis.anfangsstichtag + interval '1 day')::date;
  v_now_month := date_trunc('month', current_date)::date;
  v_iter := v_start;

  while v_iter <= v_now_month loop
    v_month_start := v_iter;
    v_month_end := (v_iter + interval '1 month' - interval '1 day')::date;
    v_is_current := (v_iter = v_now_month);

    select coalesce(sum(extract(epoch from (sh.zeit_bis - sh.zeit_von)) / 3600.0), 0)
      into v_ist
      from public.schichten sh
      join public.protokolle p on p.id = sh.protokoll_id
     where sh.mitarbeiter_id = _profile_id
       and p.datum between v_month_start and v_month_end;

    -- Im laufenden Monat wird der Soll noch NICHT mit verrechnet, damit der
    -- Saldo nicht kuenstlich rot ist, nur weil der Monat noch laeuft.
    if v_is_current then
      v_effektiv_soll := 0;
    else
      v_effektiv_soll := v_basis.sollstunden_pro_monat;
    end if;

    v_kum := v_kum + (v_ist - v_effektiv_soll);

    monat := to_char(v_iter, 'YYYY-MM');
    ist_stunden  := round(v_ist::numeric, 2);
    soll_stunden := v_basis.sollstunden_pro_monat;
    diff         := round((v_ist - v_basis.sollstunden_pro_monat)::numeric, 2);
    kum_saldo    := round(v_kum::numeric, 2);
    ist_laufend  := v_is_current;

    return next;
    v_iter := (v_iter + interval '1 month')::date;
  end loop;

  return;
end $$;

grant execute on function public.get_stundenkonto(uuid) to anon, authenticated;
