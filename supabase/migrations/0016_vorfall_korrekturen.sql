-- Doku-Bericht-Korrekturen:
--   * Admin kann nachträglich Vorfälle editieren, löschen, oder einen
--     vergessenen Vorfall nachtragen.
--   * audit_log bleibt fortlaufend & immutable — Korrekturen erzeugen neue
--     Einträge bzw. setzen `gueltig=false`. Nichts wird gelöscht oder
--     überschrieben, sodass die Historie auditfähig bleibt.
--
-- Zusätzliche Spalten:
--   gueltig                    -> false = Eintrag gilt im Bericht nicht mehr
--                                 (gelöscht oder durch eine Korrektur ersetzt)
--   bezieht_sich_auf_datum     -> Nachtrag: tatsächliches Vorfalls-Datum
--                                 (statt ts::date)
--   bezieht_sich_auf_profile_id-> Nachtrag/Korrektur: tatsächlicher MA
--   ersetzt_audit_id           -> Edit: zeigt auf den alten ungültigen Eintrag
--   korrektur_grund            -> kurze Begründung (free text)
--   korrigiert_von             -> profile_id des Admins, der korrigiert hat

alter table public.audit_log
  add column if not exists gueltig boolean not null default true,
  add column if not exists bezieht_sich_auf_datum date,
  add column if not exists bezieht_sich_auf_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists ersetzt_audit_id bigint references public.audit_log(id) on delete set null,
  add column if not exists korrektur_grund text,
  add column if not exists korrigiert_von uuid references public.profiles(id) on delete set null;

create index if not exists idx_audit_log_gueltig_action
  on public.audit_log (action, gueltig) where action in ('VORFALL','DOKU_REMINDER_OK');

-- ============================================================================
-- RPC: Vorfall bearbeiten (Kategorien + Text ändern)
-- ============================================================================
create or replace function public.edit_vorfall(
  _admin_id uuid,
  _audit_id bigint,
  _kategorien jsonb,   -- array of strings
  _labels    jsonb,    -- array of strings
  _text      text,
  _grund     text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig audit_log%rowtype;
  v_new_id bigint;
  v_admin_name text;
  v_admin_rolle text;
begin
  -- Berechtigung pruefen
  select name, rolle into v_admin_name, v_admin_rolle
    from profiles where id = _admin_id;
  if v_admin_rolle is null or v_admin_rolle <> 'admin' then
    raise exception 'Nur Admin darf Vorfaelle bearbeiten.';
  end if;

  select * into v_orig from audit_log where id = _audit_id;
  if not found then
    raise exception 'Eintrag % nicht gefunden.', _audit_id;
  end if;
  if v_orig.action <> 'VORFALL' then
    raise exception 'Eintrag % ist kein VORFALL.', _audit_id;
  end if;
  if v_orig.gueltig is false then
    raise exception 'Eintrag % ist bereits ungueltig.', _audit_id;
  end if;

  -- Neuen, korrigierten Eintrag schreiben — mit OrigPid, OrigDatum,
  -- damit er an derselben Stelle im Bericht erscheint.
  insert into audit_log (
    profile_id, user_name, rolle, action, new_val,
    bezieht_sich_auf_datum, bezieht_sich_auf_profile_id,
    ersetzt_audit_id, korrektur_grund, korrigiert_von
  ) values (
    v_orig.profile_id,
    v_orig.user_name,
    v_orig.rolle,
    'VORFALL',
    jsonb_build_object(
      'kategorien', _kategorien,
      'labels',     _labels,
      'text',       nullif(trim(_text), '')
    ),
    coalesce(v_orig.bezieht_sich_auf_datum, v_orig.ts::date),
    coalesce(v_orig.bezieht_sich_auf_profile_id, v_orig.profile_id),
    _audit_id,
    nullif(trim(_grund), ''),
    _admin_id
  )
  returning id into v_new_id;

  -- Alten Eintrag entwerten
  update audit_log
     set gueltig = false,
         korrigiert_von = _admin_id,
         korrektur_grund = nullif(trim(_grund), '')
   where id = _audit_id;

  -- Meta-Audit: der Admin hat editiert
  insert into audit_log (profile_id, user_name, rolle, action, new_val)
  values (
    _admin_id, v_admin_name, 'admin', 'VORFALL_EDIT',
    jsonb_build_object('orig_id', _audit_id, 'neu_id', v_new_id, 'grund', _grund)
  );

  return v_new_id;
end $$;

grant execute on function public.edit_vorfall(uuid, bigint, jsonb, jsonb, text, text)
  to anon, authenticated;

-- ============================================================================
-- RPC: Vorfall löschen (Soft-Delete)
-- ============================================================================
create or replace function public.delete_vorfall(
  _admin_id uuid,
  _audit_id bigint,
  _grund text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_name text;
  v_admin_rolle text;
  v_action text;
begin
  select name, rolle into v_admin_name, v_admin_rolle
    from profiles where id = _admin_id;
  if v_admin_rolle is null or v_admin_rolle <> 'admin' then
    raise exception 'Nur Admin darf Vorfaelle loeschen.';
  end if;

  select action into v_action from audit_log where id = _audit_id;
  if v_action is null then
    raise exception 'Eintrag % nicht gefunden.', _audit_id;
  end if;
  if v_action not in ('VORFALL','DOKU_REMINDER_OK') then
    raise exception 'Eintrag % ist weder VORFALL noch DOKU_REMINDER_OK.', _audit_id;
  end if;

  update audit_log
     set gueltig = false,
         korrigiert_von = _admin_id,
         korrektur_grund = nullif(trim(_grund), '')
   where id = _audit_id;

  insert into audit_log (profile_id, user_name, rolle, action, new_val)
  values (
    _admin_id, v_admin_name, 'admin', 'VORFALL_DELETE',
    jsonb_build_object('orig_id', _audit_id, 'grund', _grund)
  );
end $$;

grant execute on function public.delete_vorfall(uuid, bigint, text) to anon, authenticated;

-- ============================================================================
-- RPC: Vorfall nachtragen (Vergessen-Fall)
-- ============================================================================
create or replace function public.nachtragen_vorfall(
  _admin_id uuid,
  _fuer_profile_id uuid,
  _fuer_datum date,
  _kategorien jsonb,
  _labels    jsonb,
  _text      text,
  _grund     text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_id bigint;
  v_admin_name text;
  v_admin_rolle text;
  v_ma_name text;
  v_ma_rolle text;
begin
  select name, rolle into v_admin_name, v_admin_rolle
    from profiles where id = _admin_id;
  if v_admin_rolle is null or v_admin_rolle <> 'admin' then
    raise exception 'Nur Admin darf Vorfaelle nachtragen.';
  end if;

  select name, rolle into v_ma_name, v_ma_rolle
    from profiles where id = _fuer_profile_id;
  if v_ma_name is null then
    raise exception 'Mitarbeiter % nicht gefunden.', _fuer_profile_id;
  end if;

  insert into audit_log (
    profile_id, user_name, rolle, action, new_val,
    bezieht_sich_auf_datum, bezieht_sich_auf_profile_id,
    korrektur_grund, korrigiert_von
  ) values (
    _fuer_profile_id,
    v_ma_name,
    v_ma_rolle,
    'VORFALL',
    jsonb_build_object(
      'kategorien', _kategorien,
      'labels',     _labels,
      'text',       nullif(trim(_text), '')
    ),
    _fuer_datum,
    _fuer_profile_id,
    nullif(trim(_grund), ''),
    _admin_id
  )
  returning id into v_new_id;

  insert into audit_log (profile_id, user_name, rolle, action, new_val)
  values (
    _admin_id, v_admin_name, 'admin', 'VORFALL_NACHTRAG',
    jsonb_build_object(
      'neu_id', v_new_id,
      'fuer_profile_id', _fuer_profile_id,
      'fuer_datum', _fuer_datum,
      'grund', _grund
    )
  );

  return v_new_id;
end $$;

grant execute on function public.nachtragen_vorfall(uuid, uuid, date, jsonb, jsonb, text, text)
  to anon, authenticated;
