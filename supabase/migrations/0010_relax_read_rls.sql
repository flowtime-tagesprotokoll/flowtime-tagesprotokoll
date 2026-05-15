-- RLS-Korrektur: Lesen von Schichten und Kassenbewegungen muss IMMER erlaubt
-- sein, damit die App
--   - die Vortags-IST fuer den Auto-Carry des heutigen Kassenstarts findet
--   - die offenen Aufladungen aller Kunden ueber die letzten 180 Tage saldiert
--   - Reports und Doku-Bericht auch alte Daten lesen koennen
--
-- Migration 0007 hatte das Lesen versehentlich auf den Schreib-Zeitraum
-- (heute + Late-Shift-Carry-Fenster) eingeschraenkt. Mitarbeiter konnten
-- dadurch nach 08:00 Berlin die gestrigen Schichten nicht mehr lesen und
-- der Vortags-Auto-Carry hat nie gegriffen — die Werte mussten manuell
-- abgeschrieben werden.
--
-- Schreiben bleibt unveraendert nur fuer das aktuelle Schreibfenster
-- (heute, oder gestern vor 08:00 Berlin).

drop policy if exists schichten_select on public.schichten;
create policy schichten_select on public.schichten for select using (true);

drop policy if exists kassenbewegungen_select on public.kassenbewegungen;
create policy kassenbewegungen_select on public.kassenbewegungen for select using (true);
