-- Spalte fuer Uebergabe-Notiz an die naechste Schicht
alter table public.schichten add column if not exists uebergabe_notiz text;
