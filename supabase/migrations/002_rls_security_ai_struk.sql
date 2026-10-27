-- ============================================================
-- Perbaikan keamanan RLS untuk AI Struk
-- Mengganti policy "semua user authenticated" menjadi hanya
-- staf (owner/admin/kasir/gudang). Pelanggan publik tidak lagi
-- bisa membaca/mengubah struk atau file di bucket receipts.
-- ============================================================

-- ---------- Helper: apakah user yang login adalah staf ----------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and trim(lower(role)) in ('owner', 'admin', 'kasir', 'gudang')
  );
$$;

-- ---------- documents: hanya staf ----------
drop policy if exists "documents all auth" on public.documents;
drop policy if exists "documents staff all" on public.documents;
create policy "documents staff all" on public.documents
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- doc_templates: hanya staf (baca + kelola) ----------
drop policy if exists "doc_templates read auth" on public.doc_templates;
drop policy if exists "doc_templates staff all" on public.doc_templates;
create policy "doc_templates staff all" on public.doc_templates
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- Storage bucket 'receipts': hanya staf ----------
drop policy if exists "receipts all auth" on storage.objects;
drop policy if exists "receipts staff all" on storage.objects;
create policy "receipts staff all" on storage.objects
  for all to authenticated
  using (bucket_id = 'receipts' and public.is_staff())
  with check (bucket_id = 'receipts' and public.is_staff());
