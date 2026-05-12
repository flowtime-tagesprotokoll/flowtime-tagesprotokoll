-- Spaete Schichten (z.B. WM-Spiele): Mitarbeiter muessen auch nach Mitternacht
-- noch auf das Protokoll der laufenden Schicht zugreifen koennen, das vom
-- Datum her bereits "gestern" ist. Deshalb gilt fuer Mitarbeiter ab jetzt:
--
--   Das gestrige Protokoll bleibt bis 08:00 Berlin-Zeit am Folgetag editierbar.
--
-- Ab 08:00 Berlin wird es read-only (nur Admin darf danach noch aendern).
-- Zeitzone: Europe/Berlin (DST-sicher).

-- Helper: aktuelles Berlin-Datum
create or replace function public.berlin_today() returns date
language sql stable as $$
  select (now() at time zone 'Europe/Berlin')::date
$$;

-- Helper: ist das gegebene Datum 'gestern' UND aktuelle Berlin-Zeit ist vor 08:00?
create or replace function public.is_late_shift_carry(d date) returns boolean
language sql stable as $$
  select
    d = public.berlin_today() - 1
    and (now() at time zone 'Europe/Berlin')::time < '08:00:00'
$$;

-- Helper: darf der aktuelle Aufrufer das Protokoll mit Datum `d` lesen/schreiben?
create or replace function public.allowed_protokoll_datum(d date) returns boolean
language sql stable as $$
  select
    public.is_admin()
    or d = public.berlin_today()
    or public.is_late_shift_carry(d)
$$;

-- protokolle-Policies neu anlegen
drop policy if exists protokolle_select_all on public.protokolle;
drop policy if exists protokolle_insert_today on public.protokolle;
drop policy if exists protokolle_update_today on public.protokolle;
drop policy if exists protokolle_delete_admin on public.protokolle;

create policy protokolle_select_all on public.protokolle for select using (true);

create policy protokolle_insert_today on public.protokolle for insert
  with check (public.allowed_protokoll_datum(datum));

create policy protokolle_update_today on public.protokolle for update
  using (public.allowed_protokoll_datum(datum))
  with check (public.allowed_protokoll_datum(datum));

create policy protokolle_delete_admin on public.protokolle for delete
  using (public.is_admin());

-- schichten-Policies
drop policy if exists schichten_select on public.schichten;
drop policy if exists schichten_write on public.schichten;

create policy schichten_select on public.schichten for select using (
  exists (
    select 1 from public.protokolle p
    where p.id = schichten.protokoll_id
      and (public.is_admin() or public.allowed_protokoll_datum(p.datum))
  )
);
create policy schichten_write on public.schichten for all using (
  exists (
    select 1 from public.protokolle p
    where p.id = schichten.protokoll_id
      and public.allowed_protokoll_datum(p.datum)
  )
) with check (
  exists (
    select 1 from public.protokolle p
    where p.id = schichten.protokoll_id
      and public.allowed_protokoll_datum(p.datum)
  )
);

-- kassenbewegungen-Policies
drop policy if exists kassenbewegungen_select on public.kassenbewegungen;
drop policy if exists kassenbewegungen_write on public.kassenbewegungen;

create policy kassenbewegungen_select on public.kassenbewegungen for select using (
  exists (
    select 1 from public.schichten s join public.protokolle p on s.protokoll_id = p.id
    where s.id = kassenbewegungen.schicht_id
      and (public.is_admin() or public.allowed_protokoll_datum(p.datum))
  )
);
create policy kassenbewegungen_write on public.kassenbewegungen for all using (
  exists (
    select 1 from public.schichten s join public.protokolle p on s.protokoll_id = p.id
    where s.id = kassenbewegungen.schicht_id
      and public.allowed_protokoll_datum(p.datum)
  )
) with check (
  exists (
    select 1 from public.schichten s join public.protokolle p on s.protokoll_id = p.id
    where s.id = kassenbewegungen.schicht_id
      and public.allowed_protokoll_datum(p.datum)
  )
);
