-- PIN-Hash fuer Mitarbeiter-Login
alter table public.profiles add column if not exists pin_hash text;
