-- Sepideh Halil ist Vorortverantwortliche Stoeckener Str. Sie arbeitet nicht
-- an der Kasse und hat keine Schichten — aber ihre Zertifikate muessen
-- aktuell sein. Wir fuehren ein Flag 'nur_verwaltung' ein, das Profile aus
-- allen operativen Listen ausblendet (Login, Arbeitsplan, Stunden) — sie
-- taucht nur in der Zertifikate-Uebersicht auf.

alter table public.profiles
  add column if not exists nur_verwaltung boolean not null default false;

insert into public.profiles
  (name, rolle, aktiv, reihenfolge, pin_hash, darf_arbeitsplan, darf_zertifikate, nur_verwaltung)
values
  ('Sepideh Halil', 'mitarbeiter', true, 99, null, false, true, true)
on conflict do nothing;
