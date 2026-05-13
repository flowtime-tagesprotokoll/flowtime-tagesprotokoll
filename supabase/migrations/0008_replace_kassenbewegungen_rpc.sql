-- Atomare Ersetzung aller Kassenbewegungen einer Schicht in EINER Transaktion.
-- Vorher: delete-then-insert (oder insert-then-delete) waren beide
-- race-anfaellig. Bei parallelen Saves derselben Schicht (zwei Tabs/Geraete)
-- konnten Bewegungen verdoppelt werden — was den Aufladungs-Saldo
-- dauerhaft verfaelscht haette. Diese Funktion erledigt das atomar.
--
-- Parameter:
--   _schicht_id  : Schicht, deren Bewegungen ersetzt werden
--   _bewegungen  : JSONB-Array, z.B.
--     '[{"typ":"einlage","beschreibung":"Nezir","betrag":50,"reihenfolge":0}, ...]'
--
-- Berechtigung: setzt SECURITY INVOKER um RLS zu respektieren — der Aufrufer
-- braucht die normalen UPDATE/DELETE-Rechte auf kassenbewegungen (RLS prueft
-- das gegen Schicht->Protokoll->Datum wie ueblich).
create or replace function public.replace_kassenbewegungen(
  _schicht_id uuid,
  _bewegungen jsonb
) returns void
language plpgsql
security invoker
as $$
begin
  -- Atomar: erst loeschen, dann neu einfuegen — in einer Transaktion.
  delete from public.kassenbewegungen where schicht_id = _schicht_id;

  if _bewegungen is null or jsonb_array_length(_bewegungen) = 0 then
    return;
  end if;

  insert into public.kassenbewegungen (schicht_id, typ, beschreibung, betrag, reihenfolge)
  select
    _schicht_id,
    (b->>'typ')::text,
    nullif(b->>'beschreibung', ''),
    (b->>'betrag')::numeric,
    coalesce((b->>'reihenfolge')::int, 0)
  from jsonb_array_elements(_bewegungen) as b;
end
$$;

grant execute on function public.replace_kassenbewegungen(uuid, jsonb) to anon, authenticated;
