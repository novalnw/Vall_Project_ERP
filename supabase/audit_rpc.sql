-- ============================================================
-- AUDIT KEAMANAN RPC
--
-- Jalankan di Supabase Dashboard -> SQL Editor, lalu baca hasilnya.
-- Skrip ini:
--   1. Menampilkan definisi lengkap setiap fungsi (RPC).
--   2. Menandai pola berbahaya: SECURITY DEFINER tanpa cek peran,
--      parameter p_user / p_user_email (spoofable dari client),
--      dan fungsi yang bisa dipanggil oleh anon.
-- ============================================================

-- ---------- 1. Semua fungsi di schema public ----------
select
  p.oid::regprocedure as function_signature,
  p.prosecdef as security_definer,
  p.proacl,
  pg_get_functiondef(p.oid) as source_code
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
order by p.proname;

-- ---------- 2. Fungsi yang memakai SECURITY DEFINER ----------
select
  p.oid::regprocedure as function_signature,
  pg_get_functiondef(p.oid) as source_code
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and p.prosecdef
order by p.proname;

-- ---------- 3. Fungsi dengan param p_user / p_user_email /
--              parameter yang bisa dispoof dari client ----------
select
  p.oid::regprocedure as function_signature,
  p.proname,
  pg_get_function_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and (
    pg_get_function_arguments(p.oid) ilike '%p_user%'
    or pg_get_function_arguments(p.oid) ilike '%_email%'
    or pg_get_function_arguments(p.oid) ilike '%user_email%'
  )
order by p.proname;

-- ---------- 4. Cek apakah anon bisa execute fungsi-fungsi ini ----------
-- (menampilkan ACL untuk role anon)
select
  p.oid::regprocedure as function_signature,
  p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and (p.proacl is null or p.proacl::text ilike '%anon%')
order by p.proname;

-- ---------- 5. SARAN: pola aman untuk setiap RPC yang berhubungan
--              dengan penulisan data. Ganti ROLE_CHECK sesuai peran. ---
-- Contoh cek peran (taruh di awal fungsi):
--
--   if not exists (
--     select 1 from public.profiles
--     where id = auth.uid()
--       and trim(lower(role)) in ('owner','admin','kasir')
--   ) then
--     raise exception 'Akses ditolak: bukan staf';
--   end if;
--
-- Untuk RPC pelanggan, WAJIB validasi bahwa record milik pelanggan
-- yang sedang login:
--
--   if not exists (
--     select 1
--     from public.invoice i
--     join public.profiles p on p.pelanggan_id = i.pelanggan_id
--     where i.id = p_invoice
--       and p.id = auth.uid()
--   ) then
--     raise exception 'Akses ditolak: invoice bukan milik Anda';
--   end if;
--
-- ============================================================
