-- =====================================================
-- Flowtime Tagesprotokoll — Storage Bucket
-- Migration 0003
-- =====================================================
-- Bucket "belege" für hochgeladene Z-Bon-Fotos.
-- Pfad-Konvention: belege/<shop_id>/<datum>/<schicht_nr>.jpg

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'belege',
  'belege',
  false,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Storage Policies
-- Lesen: Admin alles, Anon nur Belege zu heute (gleicher RLS-Approach wie protokolle)
drop policy if exists belege_select on storage.objects;
create policy belege_select on storage.objects for select
  using (
    bucket_id = 'belege' and (
      public.is_admin()
      or (
        -- Anon kann lesen, wenn Pfad mit heutigem Datum übereinstimmt:
        -- belege/<shop_id>/<datum>/<schicht_nr>.jpg
        split_part(name, '/', 2) = current_date::text
      )
    )
  );

drop policy if exists belege_insert on storage.objects;
create policy belege_insert on storage.objects for insert
  with check (
    bucket_id = 'belege' and (
      public.is_admin()
      or split_part(name, '/', 2) = current_date::text
    )
  );

drop policy if exists belege_update on storage.objects;
create policy belege_update on storage.objects for update
  using (
    bucket_id = 'belege' and (
      public.is_admin()
      or split_part(name, '/', 2) = current_date::text
    )
  );

drop policy if exists belege_delete_admin on storage.objects;
create policy belege_delete_admin on storage.objects for delete
  using (bucket_id = 'belege' and public.is_admin());
