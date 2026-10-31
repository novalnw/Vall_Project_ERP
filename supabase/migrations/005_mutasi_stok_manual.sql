-- ============================================================
-- Laporan Mutasi Stok: input manual retur & penyesuaian
--
-- Menambah RPC untuk mencatat mutasi stok manual (Retur dan
-- Penyesuaian) sekaligus menyesuaikan stok inventory, lalu
-- menuliskannya ke tabel stok_mutasi agar tampil di laporan.
--
-- Wajib dijalankan di Supabase (SQL Editor) setelah migrasi 004.
-- ============================================================
create or replace function public.input_mutasi_stok(
  p_item_id bigint,
  p_jenis text,
  p_qty int,
  p_catatan text default null
) returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row inventory%rowtype;
  v_stock int;
  v_user text := auth.jwt() ->> 'email';
begin
  if not is_staff() then
    raise exception 'Hanya staf yang boleh mencatat mutasi stok';
  end if;

  if lower(p_jenis) not in ('retur', 'penyesuaian') then
    raise exception 'Jenis mutasi tidak valid (retur / penyesuaian)';
  end if;
  if p_qty = 0 then
    raise exception 'Jumlah tidak boleh 0';
  end if;

  select * into v_row from inventory where id = p_item_id for update;
  if not found then
    raise exception 'Produk tidak ditemukan';
  end if;
  if v_row.stock + p_qty < 0 then
    raise exception 'Stok tidak bisa negatif (sisa %)', v_row.stock;
  end if;

  update inventory set stock = stock + p_qty where id = p_item_id returning stock into v_stock;

  insert into stok_mutasi (item_id, item_name, jenis, qty, saldo, ref, dibuat_oleh)
    values (p_item_id, v_row.name, lower(p_jenis), p_qty, v_stock,
            nullif(trim(coalesce(p_catatan, '')), ''), v_user);
end
$function$;
