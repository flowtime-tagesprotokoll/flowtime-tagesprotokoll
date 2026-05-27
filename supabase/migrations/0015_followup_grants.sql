-- Supabase aendert ab Oktober 2026 das Default-Verhalten: neue Tabellen im
-- public-Schema werden NICHT mehr automatisch ueber die Data API
-- (PostgREST / supabase-js) freigegeben. Wir geben deshalb fuer alle nach
-- 0009_explicit_grants.sql hinzugekommenen Tabellen die Grants explizit,
-- damit das Schema auch nach dem Stichtag noch sauber deploybar ist.
--
-- Idempotent: die Statements ueberschreiben bestehende Grants nicht und
-- werfen auch keinen Fehler, wenn die Berechtigung schon existiert.

grant select, insert, update, delete on table public.arbeitsplaene to anon, authenticated;
grant select, insert, update, delete on table public.arbeitsplan_tag_meta to anon, authenticated;
grant select, insert, update, delete on table public.zertifikate to anon, authenticated;
grant select, insert, update, delete on table public.stundenkonto_basis to anon, authenticated;

-- service_role bekommt grundsaetzlich alles (Admin-Tools, Backup, Migrations).
grant all on table public.arbeitsplaene to service_role;
grant all on table public.arbeitsplan_tag_meta to service_role;
grant all on table public.zertifikate to service_role;
grant all on table public.stundenkonto_basis to service_role;

-- Sequences (falls vorhanden) ebenfalls freigeben, sonst fallen
-- INSERTs mit Default-IDs spaeter auf die Nase.
grant usage, select on all sequences in schema public to anon, authenticated;
grant all on all sequences in schema public to service_role;

-- Default-Privilegien fuer ZUKUENFTIGE Tabellen/Sequences ab jetzt:
-- jede neu angelegte Tabelle bekommt automatisch die Standard-Grants.
-- Wirkt unabhaengig vom Supabase-Auto-Grant.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public
  grant all on sequences to service_role;
