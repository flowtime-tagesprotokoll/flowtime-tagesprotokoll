-- Vortags-Übergabe: die Spätschicht (Schicht 2) hinterlässt oft Infos für
-- die Frühschicht am NÄCHSTEN Tag. Bisher wurde die uebergabe_notiz nur
-- innerhalb desselben Tages angezeigt (S1<->S2). Dieser RPC liefert die
-- neueste Übergabe-Notiz aus dem letzten Protokoll eines Shops vor einem
-- gegebenen Datum. SECURITY DEFINER, damit auch Mitarbeiter (die per RLS
-- normalerweise nur "heute" sehen) die letzte Vortags-Notiz lesen können.

create or replace function public.get_vortags_uebergabe(
  _shop_id uuid,
  _before_date date
)
returns table (
  datum date,
  schicht_nr smallint,
  uebergabe_notiz text,
  mitarbeiter_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with vortag as (
    select p.id, p.datum
      from protokolle p
     where p.shop_id = _shop_id
       and p.datum < _before_date
     order by p.datum desc
     limit 1
  ),
  -- Spätschicht zuerst (die schreibt normalerweise für den Folgetag),
  -- Frühschicht als Fallback wenn nur eine Schicht existierte.
  notiz as (
    select
      v.datum,
      sh.schicht_nr::smallint as schicht_nr,
      sh.uebergabe_notiz,
      p.name as mitarbeiter_name,
      case when sh.schicht_nr = 2 then 0 else 1 end as prio
    from vortag v
    join schichten sh on sh.protokoll_id = v.id
    left join profiles p on p.id = sh.mitarbeiter_id
    where sh.uebergabe_notiz is not null
      and length(trim(sh.uebergabe_notiz)) > 0
  )
  select datum, schicht_nr, uebergabe_notiz, mitarbeiter_name
    from notiz
   order by prio, schicht_nr desc
   limit 1;
$$;

grant execute on function public.get_vortags_uebergabe(uuid, date)
  to anon, authenticated;
