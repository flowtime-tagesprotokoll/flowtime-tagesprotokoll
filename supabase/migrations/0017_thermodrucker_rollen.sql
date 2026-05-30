-- Thermodrucker-Rollen-Tracking
-- Jeder Mitarbeiter kann einmal aufs jeweilige Terminal-Symbol klicken,
-- wenn er eine Rolle getauscht hat. Damit haben wir pro Terminal eine
-- Historie und sehen ungefaehr, wann der naechste Wechsel faellig sein
-- duerfte. 8 Terminals (Nr 1 bis 8).

create table if not exists public.thermodrucker_log (
  id bigserial primary key,
  terminal_nr smallint not null check (terminal_nr between 1 and 8),
  getauscht_am timestamptz not null default now(),
  getauscht_von uuid references public.profiles(id) on delete set null
);

create index if not exists idx_thermodrucker_log_terminal_zeit
  on public.thermodrucker_log (terminal_nr, getauscht_am desc);

alter table public.thermodrucker_log enable row level security;

drop policy if exists thermodrucker_log_select on public.thermodrucker_log;
create policy thermodrucker_log_select on public.thermodrucker_log
  for select using (true);

drop policy if exists thermodrucker_log_insert on public.thermodrucker_log;
create policy thermodrucker_log_insert on public.thermodrucker_log
  for insert with check (true);

-- Admin darf auch loeschen, falls Fehleintrag.
drop policy if exists thermodrucker_log_delete_admin on public.thermodrucker_log;
create policy thermodrucker_log_delete_admin on public.thermodrucker_log
  for delete using (public.is_admin());

grant select, insert on table public.thermodrucker_log to anon, authenticated;
grant all on table public.thermodrucker_log to service_role;
grant usage, select on sequence public.thermodrucker_log_id_seq to anon, authenticated;
grant all on sequence public.thermodrucker_log_id_seq to service_role;

-- RPC: liefert pro Terminal (1..8) den letzten Tausch (oder null).
create or replace function public.get_thermodrucker_status()
returns table (
  terminal_nr smallint,
  letzter_tausch timestamptz,
  letzter_von_profile_id uuid,
  letzter_von_name text,
  anzahl_letzte_30_tage int
)
language sql
stable
security definer
set search_path = public
as $$
  with reihe as (
    select generate_series(1, 8)::smallint as nr
  ),
  letzte as (
    select distinct on (l.terminal_nr)
      l.terminal_nr,
      l.getauscht_am,
      l.getauscht_von
    from thermodrucker_log l
    order by l.terminal_nr, l.getauscht_am desc
  ),
  anzahl as (
    select terminal_nr, count(*)::int as anz
      from thermodrucker_log
     where getauscht_am > now() - interval '30 days'
     group by terminal_nr
  )
  select
    r.nr as terminal_nr,
    le.getauscht_am as letzter_tausch,
    le.getauscht_von as letzter_von_profile_id,
    p.name as letzter_von_name,
    coalesce(an.anz, 0) as anzahl_letzte_30_tage
  from reihe r
  left join letzte le on le.terminal_nr = r.nr
  left join anzahl an on an.terminal_nr = r.nr
  left join profiles p on p.id = le.getauscht_von
  order by r.nr;
$$;

grant execute on function public.get_thermodrucker_status() to anon, authenticated;

-- Hilfs-RPC zum Eintragen (logged auch im audit_log)
create or replace function public.log_thermodrucker_tausch(
  _profile_id uuid,
  _terminal_nr smallint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_name text;
  v_rolle text;
begin
  if _terminal_nr < 1 or _terminal_nr > 8 then
    raise exception 'Terminal-Nr muss zwischen 1 und 8 liegen.';
  end if;
  select name, rolle into v_name, v_rolle from profiles where id = _profile_id;

  insert into thermodrucker_log (terminal_nr, getauscht_von)
    values (_terminal_nr, _profile_id)
    returning id into v_id;

  insert into audit_log (profile_id, user_name, rolle, action, new_val)
    values (
      _profile_id, v_name, v_rolle, 'THERMODRUCKER_TAUSCH',
      jsonb_build_object('terminal_nr', _terminal_nr, 'log_id', v_id)
    );

  return v_id;
end $$;

grant execute on function public.log_thermodrucker_tausch(uuid, smallint)
  to anon, authenticated;
