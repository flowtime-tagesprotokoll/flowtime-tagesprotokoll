-- Zusaetzliche Berechtigung: darf_lohnjournal
--   Erlaubt Lesezugriff aufs Lohnjournal (Ist/Soll/Ausgezahlt/Saldo aller MAs).
--   Schreibrechte bleiben Admin-only.

alter table public.profiles
  add column if not exists darf_lohnjournal boolean not null default false;

-- Soner bekommt Lesezugriff, weil er die Arbeitsplaene macht und die
-- Stunden im Auge behalten muss.
update public.profiles
  set darf_lohnjournal = true
  where name ilike 'Soner%'
     or rolle = 'admin';
