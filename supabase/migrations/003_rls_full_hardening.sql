-- ============================================================
-- Hardening RLS menyeluruh (semua tabel inti ERP + storage)
--
-- Model akses:
--   • STAFF (owner/admin/kasir/gudang): akses penuh ke semua data
--     bisnis (single shared dataset, tanpa konsep tenant).
--   • PELANGGAN: hanya melihat/mengubah data miliknya sendiri lewat
--     rantai profiles.pelanggan_id -> pelanggan.id -> (*).pelanggan_id.
--
-- Wajib dijalankan setelah migrasi 001 & 002.
-- ============================================================

-- ---------- Helper: pelanggan_id dari user yang login ----------
create or replace function public.my_pelanggan_id()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select pelanggan_id from public.profiles where id = auth.uid()
$$;

-- ---------- Helper: apakah user adalah owner ----------
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and trim(lower(p.role)) = 'owner'
  );
$$;

-- ============================================================
-- BAGIAN 1: TABEL STAFF-ONLY (global, akses penuh staf)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'akun_kas','harga_supplier','inventory','supplier',
    'log_aktivitas','opname_logs','purchase_order','po_item',
    'kas_mutasi','pengeluaran','stok_mutasi','penerimaan',
    'doc_templates','documents'
  ]
  loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'all_staff_'||t, t);
      execute format(
        'create policy %I on public.%I for all to authenticated
           using (public.is_staff()) with check (public.is_staff())',
        'all_staff_'||t, t);
    end if;
  end loop;
end $$;

-- ============================================================
-- BAGIAN 2: TABEL PORTAL (staf penuh + pelanggan hanya miliknya)
-- ============================================================

-- ---------- invoice ----------
alter table public.invoice enable row level security;
drop policy if exists "invoice_all" on public.invoice;
drop policy if exists "invoice_own" on public.invoice;
create policy "invoice_all" on public.invoice
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "invoice_own" on public.invoice
  for select to authenticated
  using (pelanggan_id = public.my_pelanggan_id());

-- ---------- invoice_item (transitif lewat invoice) ----------
alter table public.invoice_item enable row level security;
drop policy if exists "invoice_item_all" on public.invoice_item;
drop policy if exists "invoice_item_own" on public.invoice_item;
create policy "invoice_item_all" on public.invoice_item
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "invoice_item_own" on public.invoice_item
  for select to authenticated
  using (exists (select 1 from public.invoice
        where invoice.id = invoice_item.invoice_id
          and invoice.pelanggan_id = public.my_pelanggan_id()));

-- ---------- pesanan ----------
alter table public.pesanan enable row level security;
drop policy if exists "pesanan_all" on public.pesanan;
drop policy if exists "pesanan_own" on public.pesanan;
create policy "pesanan_all" on public.pesanan
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "pesanan_own" on public.pesanan
  for select to authenticated
  using (pelanggan_id = public.my_pelanggan_id());

-- ---------- pesanan_item (transitif lewat pesanan) ----------
alter table public.pesanan_item enable row level security;
drop policy if exists "pesanan_item_all" on public.pesanan_item;
drop policy if exists "pesanan_item_own" on public.pesanan_item;
create policy "pesanan_item_all" on public.pesanan_item
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "pesanan_item_own" on public.pesanan_item
  for select to authenticated
  using (exists (select 1 from public.pesanan
        where pesanan.id = pesanan_item.pesanan_id
          and pesanan.pelanggan_id = public.my_pelanggan_id()));

-- ---------- pembayaran_klaim ----------
alter table public.pembayaran_klaim enable row level security;
drop policy if exists "klaim_all" on public.pembayaran_klaim;
drop policy if exists "klaim_own" on public.pembayaran_klaim;
create policy "klaim_all" on public.pembayaran_klaim
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "klaim_own" on public.pembayaran_klaim
  for select to authenticated
  using (pelanggan_id = public.my_pelanggan_id());

-- ---------- pembayaran (transitif lewat invoice) ----------
alter table public.pembayaran enable row level security;
drop policy if exists "bayar_all" on public.pembayaran;
drop policy if exists "bayar_own" on public.pembayaran;
create policy "bayar_all" on public.pembayaran
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "bayar_own" on public.pembayaran
  for select to authenticated
  using (exists (select 1 from public.invoice
        where invoice.id = pembayaran.invoice_id
          and invoice.pelanggan_id = public.my_pelanggan_id()));

-- ---------- pelanggan: staf penuh, pelanggan baca/ubah miliknya ----------
alter table public.pelanggan enable row level security;
drop policy if exists "pelanggan_all" on public.pelanggan;
drop policy if exists "pelanggan_own" on public.pelanggan;
create policy "pelanggan_all" on public.pelanggan
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "pelanggan_own" on public.pelanggan
  for select to authenticated
  using (id = public.my_pelanggan_id());
create policy "pelanggan_own_update" on public.pelanggan
  for update to authenticated
  using (id = public.my_pelanggan_id())
  with check (id = public.my_pelanggan_id());

-- ============================================================
-- BAGIAN 3: PROFILES (hal khusus)
-- ============================================================
-- - setiap user membaca barisnya sendiri
-- - user boleh menyisipkan baris sendiri (saat daftar, jika belum ada trigger)
-- - hanya owner yang boleh mengubah peran/pelanggan_id
alter table public.profiles enable row level security;
drop policy if exists "profiles_own_read" on public.profiles;
drop policy if exists "profiles_staff_read" on public.profiles;
drop policy if exists "profiles_own_insert" on public.profiles;
drop policy if exists "profiles_owner_write" on public.profiles;
create policy "profiles_staff_read" on public.profiles
  for select to authenticated
  using (public.is_staff());
create policy "profiles_own_read" on public.profiles
  for select to authenticated
  using (id = auth.uid());
create policy "profiles_own_insert" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());
create policy "profiles_owner_write" on public.profiles
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- ============================================================
-- BAGIAN 4: PENGATURAN (read semua, write staf)
-- ============================================================
alter table public.pengaturan enable row level security;
drop policy if exists "pengaturan_read" on public.pengaturan;
drop policy if exists "pengaturan_staff_write" on public.pengaturan;
create policy "pengaturan_read" on public.pengaturan
  for select to authenticated
  using (true);
create policy "pengaturan_staff_write" on public.pengaturan
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ============================================================
-- BAGIAN 5: STORAGE BUCKET 'bukti'
-- ============================================================
-- - staf: akses penuh (untuk melihat bukti & membuat signed URL)
-- - pelanggan: hanya folder sendiri (prefix = auth.uid())
drop policy if exists "bukti_staff_all" on storage.objects;
drop policy if exists "bukti_customer_own" on storage.objects;
create policy "bukti_staff_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'bukti' and public.is_staff())
  with check (bucket_id = 'bukti' and public.is_staff());
create policy "bukti_customer_own" on storage.objects
  for all to authenticated
  using (bucket_id = 'bukti'
    and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'bukti'
    and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- CATATAN
-- ============================================================
-- • Tabel 'katalog' adalah VIEW. Untuk membatasi kolom yang tampil ke
--   pelanggan, ganti definisi view-nya (jangan sampai mengekspos kolom
--   internal seperti harga beli / stok sensitif). RLS view hanya berlaku
--   bila view dibuat dengan security_invoker.
-- • Semua operasi tulis utama berjalan lewat RPC (security definer) yang
--   tetap bekerja karena mengeksekusi sebagai pemilik tabel.
-- ============================================================
