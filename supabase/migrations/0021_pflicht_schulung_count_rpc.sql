-- Zählung der Pflicht-Schulungs-Bestätigungen pro Mitarbeiter.
--
-- Hintergrund: audit_log hat eine strenge RLS-Policy (nur Admin darf SELECT).
-- Für die Pflicht-Schulungs-Modal-Logik muss aber jeder Mitarbeiter
-- herausfinden können, wie viele PFLICHT_SCHULUNG_GW_PEP_OK-Einträge er
-- selbst schon hat (für den 5x-Pflichtphase-Zähler + 15-Tage-Auffrischung).
--
-- SECURITY DEFINER läuft mit den Rechten des Owners und umgeht so RLS,
-- liefert aber ausschließlich die eigenen Bestätigungs-Timestamps zurück.

create or replace function public.get_pflicht_schulung_count(
  _profile_id uuid
)
returns table (
  ts timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select al.ts
    from audit_log al
   where al.profile_id = _profile_id
     and al.action = 'PFLICHT_SCHULUNG_GW_PEP_OK'
   order by al.ts desc;
$$;

grant execute on function public.get_pflicht_schulung_count(uuid)
  to anon, authenticated;
