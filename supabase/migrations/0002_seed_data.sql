-- =====================================================
-- Flowtime Tagesprotokoll — Seed Data
-- Migration 0002
-- =====================================================
-- Initial-Daten aus der alten HTML-App (USERS + SHOPS Konstanten)
-- auth_user_id für Tamer wird später beim Erstellen seines Supabase-
-- Auth-Accounts manuell ergänzt (separate update statement).

insert into public.shops (name, kurz, reihenfolge) values
  ('Stöckener Str. 99', 'STÖ', 1),
  ('Markgrafstr. 1',    'MGR', 2);

insert into public.profiles (name, rolle, reihenfolge) values
  ('Tamer Halil', 'admin',        0),
  ('Oskar',       'mitarbeiter',  1),
  ('Soner',       'mitarbeiter',  2),
  ('Mehdi',       'mitarbeiter',  3),
  ('Vedat',       'mitarbeiter',  4),
  ('Erdem',       'mitarbeiter',  5),
  ('Riadh',       'mitarbeiter',  6),
  ('Elhadji',     'mitarbeiter',  7);

-- Alle Mitarbeiter sind in beiden Shops einsetzbar (wie in der alten App)
insert into public.shop_mitarbeiter (shop_id, profile_id)
select s.id, p.id from public.shops s cross join public.profiles p
where p.rolle = 'mitarbeiter';
