-- Supabase-Aenderung 30.10.2026: neue Tabellen erfordern explizite GRANTs.
-- Damit unsere Migrationen ab jetzt konsistent sind UND falls Supabase
-- die bestehenden Grants jemals neu setzt, deklarieren wir sie hier
-- ausdruecklich. Idempotent — kann mehrfach laufen ohne Schaden.

-- Tabellen
do $$
declare t text;
begin
  foreach t in array array[
    'shops','profiles','shop_mitarbeiter',
    'protokolle','schichten','kassenbewegungen','audit_log'
  ]
  loop
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

-- Sequenzen (fuer Tabellen mit identity/serial)
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- RPC-Funktionen
grant execute on function public.berlin_today()           to anon, authenticated, service_role;
grant execute on function public.is_late_shift_carry(date) to anon, authenticated, service_role;
grant execute on function public.allowed_protokoll_datum(date) to anon, authenticated, service_role;
grant execute on function public.is_admin()                to anon, authenticated, service_role;
grant execute on function public.replace_kassenbewegungen(uuid, jsonb) to anon, authenticated, service_role;

-- Zukuenftige Tabellen/Funktionen: default privileges auf 'public' setzen,
-- damit neue Objekte automatisch die richtigen GRANTs bekommen.
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
