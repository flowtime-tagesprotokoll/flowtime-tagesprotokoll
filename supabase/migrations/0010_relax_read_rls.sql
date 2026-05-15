-- Gezielter Lese-Zugriff fuer den Vortags-Carry und das Aufladungs-Banner,
-- OHNE Mitarbeitern den Zugriff auf alle alten Protokolle zu geben.
--
-- Migration 0007 hatte das Lesen versehentlich auf das Schreib-Fenster
-- (heute + Late-Shift-Carry) beschraenkt. Folge: Mitarbeiter konnten nach
-- 08:00 die gestrigen Schichten nicht mehr abrufen, der Auto-Carry des
-- heutigen Kassenstarts fiel aus und die Werte mussten manuell
-- abgeschrieben werden.
--
-- Loesung: zwei SECURITY-DEFINER-Funktionen, die nur das Minimum liefern,
-- das die App fuer Auto-Carry und Aufladungs-Banner braucht. Die
-- generellen SELECT-Policies auf schichten/kassenbewegungen bleiben
-- restriktiv — Mitarbeiter koennen weiterhin keine alten Protokolle
-- einsehen.

-------------------------------------------------------------------------
-- 1) Vortags-IST: liefert den IST-Wert der letzten Schicht eines Shops
--    vor dem angegebenen Datum. Geht bis zu 90 Tage zurueck und ueber-
--    springt leere Platzhalter-Tage ohne IST.
-------------------------------------------------------------------------
create or replace function public.get_vortags_ist(
  _shop_id uuid,
  _before_date date
)
returns table (datum date, ist numeric)
language sql
security definer
set search_path = public
as $$
  select p.datum, s.kassenist
  from public.schichten s
  join public.protokolle p on p.id = s.protokoll_id
  where p.shop_id = _shop_id
    and p.datum < _before_date
    and p.datum >= _before_date - interval '90 days'
    and s.kassenist is not null
  order by p.datum desc, s.schicht_nr desc
  limit 1
$$;

grant execute on function public.get_vortags_ist(uuid, date)
  to anon, authenticated, service_role;

-------------------------------------------------------------------------
-- 2) Aufladungs-Bewegungen: liefert NUR die Bewegungs-Beschreibung +
--    typ + betrag + datum fuer einen Shop und Zeitraum. Keine IDs,
--    keine Verknuepfung zu Mitarbeitern, keine sensiblen Felder.
--    Wird vom Aufladungs-Banner verwendet, das offene Kunden-Salden
--    aggregiert. Standardmaessig die letzten 180 Tage.
-------------------------------------------------------------------------
create or replace function public.get_aufladung_bewegungen(
  _shop_id uuid,
  _since date default null
)
returns table (
  datum date,
  typ text,
  beschreibung text,
  betrag numeric
)
language sql
security definer
set search_path = public
as $$
  select p.datum, k.typ, k.beschreibung, k.betrag
  from public.kassenbewegungen k
  join public.schichten s on s.id = k.schicht_id
  join public.protokolle p on p.id = s.protokoll_id
  where p.shop_id = _shop_id
    and p.datum >= coalesce(_since, current_date - interval '180 days')
$$;

grant execute on function public.get_aufladung_bewegungen(uuid, date)
  to anon, authenticated, service_role;
