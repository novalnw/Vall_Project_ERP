-- ============================================================
-- Perbaikan keamanan RPC
--
-- 1. Tambah cek peran staf (is_staff) pada RPC yang sebelumnya
--    tanpa validasi: buat_invoice, buat_po, catat_pembayaran,
--    terima_barang. Ini mencegah pelanggan (atau siapa pun yang
--    sudah login) memanggil fungsi staf.
--
-- 2. Hapus ketergantungan pada param p_user yang datang dari
--    client (spoofable). Ganti dengan identitas dari JWT:
--    auth.jwt()->>'email'.
--
-- Catatan: tanda tangan fungsi dipertahankan (p_user tetap ada)
-- agar client tetap berjalan, tetapi nilainya TIDAK lagi dipercaya.
-- ============================================================

-- ---------- buat_invoice ----------
create or replace function public.buat_invoice(
  p_pelanggan bigint, p_tanggal date, p_tempo date,
  p_diskon numeric, p_ppn numeric, p_catatan text,
  p_items jsonb, p_user text
) returns bigint language plpgsql as $function$
declare
  r jsonb; v_id bigint; v_nomor text; v_prefix text;
  v_sub numeric := 0; v_pajak numeric; v_total numeric;
  v_inv inventory%rowtype; v_qty int; v_harga numeric;
  v_user text := auth.jwt() ->> 'email';
begin
  if not is_staff() then raise exception 'Hanya staf yang boleh membuat invoice'; end if;
  select prefix_invoice into v_prefix from pengaturan where id = 1;
  v_prefix := coalesce(v_prefix, 'INV');
  for r in select * from jsonb_array_elements(p_items) loop
    v_sub := v_sub + (r->>'qty')::int * (r->>'harga')::numeric;
  end loop;
  v_pajak := round(greatest(v_sub - p_diskon, 0) * p_ppn / 100);
  v_total := greatest(v_sub - p_diskon, 0) + v_pajak;
  v_nomor := v_prefix || '-' || to_char(p_tanggal, 'YYMM') || '-' || lpad(nextval('invoice_seq')::text, 4, '0');
  insert into invoice (nomor, pelanggan_id, tanggal, jatuh_tempo, subtotal, diskon, ppn_persen, ppn, total, catatan, dibuat_oleh)
    values (v_nomor, p_pelanggan, p_tanggal, p_tempo, v_sub, p_diskon, p_ppn, v_pajak, v_total, p_catatan, v_user)
    returning id into v_id;
  for r in select * from jsonb_array_elements(p_items) loop
    v_qty := (r->>'qty')::int; v_harga := (r->>'harga')::numeric;
    select * into v_inv from inventory where id = (r->>'item_id')::bigint for update;
    if not found then raise exception 'Produk tidak ditemukan'; end if;
    if v_inv.stock < v_qty then raise exception 'Stok % tidak cukup (sisa %)', v_inv.name, v_inv.stock; end if;
    update inventory set stock = stock - v_qty where id = v_inv.id;
    insert into invoice_item (invoice_id, item_id, nama, qty, harga, hpp, subtotal)
      values (v_id, v_inv.id, v_inv.name, v_qty, v_harga, coalesce(v_inv.harga_beli, 0), v_qty * v_harga);
    insert into stok_mutasi (item_id, item_name, jenis, qty, saldo, ref, dibuat_oleh)
      values (v_inv.id, v_inv.name, 'invoice', -v_qty, v_inv.stock - v_qty, v_nomor, v_user);
  end loop;
  return v_id;
end $function$;

-- ---------- buat_po ----------
create or replace function public.buat_po(
  p_supplier bigint, p_tanggal date, p_catatan text,
  p_items jsonb, p_user text
) returns bigint language plpgsql as $function$
declare
  r jsonb; v_id bigint; v_total numeric := 0; v_nama text;
  v_user text := auth.jwt() ->> 'email';
begin
  if not is_staff() then raise exception 'Hanya staf yang boleh membuat purchase order'; end if;
  for r in select * from jsonb_array_elements(p_items) loop
    v_total := v_total + (r->>'qty')::int * (r->>'harga')::numeric;
  end loop;
  insert into purchase_order (nomor, supplier_id, tanggal, catatan, total, dibuat_oleh)
    values ('PO-' || to_char(p_tanggal, 'YYMM') || '-' || lpad(nextval('po_seq')::text, 4, '0'), p_supplier, p_tanggal, p_catatan, v_total, v_user)
    returning id into v_id;
  for r in select * from jsonb_array_elements(p_items) loop
    select name into v_nama from inventory where id = (r->>'item_id')::bigint;
    insert into po_item (po_id, item_id, nama, qty, harga)
      values (v_id, (r->>'item_id')::bigint, v_nama, (r->>'qty')::int, (r->>'harga')::numeric);
  end loop;
  return v_id;
end $function$;

-- ---------- catat_pembayaran ----------
create or replace function public.catat_pembayaran(
  p_invoice bigint, p_jumlah numeric, p_akun bigint,
  p_metode text, p_tanggal date, p_catatan text, p_user text
) returns bigint language plpgsql as $function$
declare
  v_total numeric; v_bayar numeric; v_id bigint;
  v_user text := auth.jwt() ->> 'email';
begin
  if not is_staff() then raise exception 'Hanya staf yang boleh mencatat pembayaran'; end if;
  select total, dibayar into v_total, v_bayar from invoice where id = p_invoice for update;
  if v_total is null then raise exception 'Invoice tidak ditemukan'; end if;
  if p_jumlah <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  if v_bayar + p_jumlah > v_total then raise exception 'Pembayaran melebihi sisa tagihan'; end if;
  insert into pembayaran (invoice_id, akun_id, tanggal, jumlah, metode, catatan, dibuat_oleh, nomor_nota)
    values (p_invoice, p_akun, p_tanggal, p_jumlah, p_metode, p_catatan, v_user,
            'NT-' || to_char(p_tanggal, 'YYMM') || '-' || lpad(nextval('nota_seq')::text, 4, '0'))
    returning id into v_id;
  update invoice set dibayar = v_bayar + p_jumlah,
    status = case when v_bayar + p_jumlah >= v_total then 'lunas' else 'sebagian' end
  where id = p_invoice;
  return v_id;
end $function$;

-- ---------- terima_barang ----------
create or replace function public.terima_barang(
  p_po bigint, p_items jsonb, p_catatan text, p_user text
) returns void language plpgsql as $function$
declare
  r jsonb; v_q int; v_row po_item%rowtype; v_stock int; v_nomor text;
  v_user text := auth.jwt() ->> 'email';
begin
  if not is_staff() then raise exception 'Hanya staf yang boleh menerima barang'; end if;
  select nomor into v_nomor from purchase_order where id = p_po;
  for r in select * from jsonb_array_elements(p_items) loop
    v_q := (r->>'qty')::int;
    continue when v_q <= 0;
    select * into v_row from po_item where id = (r->>'po_item_id')::bigint and po_id = p_po for update;
    if not found then raise exception 'Item PO tidak ditemukan'; end if;
    if v_q > v_row.qty - v_row.qty_diterima then raise exception 'Qty terima % melebihi sisa pesanan', v_row.nama; end if;
    update po_item set qty_diterima = qty_diterima + v_q where id = v_row.id;
    update inventory set stock = stock + v_q, harga_beli = v_row.harga where id = v_row.item_id returning stock into v_stock;
    insert into penerimaan (po_id, item_id, nama, qty, catatan, dibuat_oleh) values (p_po, v_row.item_id, v_row.nama, v_q, p_catatan, v_user);
    insert into stok_mutasi (item_id, item_name, jenis, qty, saldo, ref, dibuat_oleh) values (v_row.item_id, v_row.nama, 'penerimaan', v_q, v_stock, v_nomor, v_user);
  end loop;
  update purchase_order set status = case
    when not exists (select 1 from po_item where po_id = p_po and qty_diterima < qty) then 'diterima'
    when exists (select 1 from po_item where po_id = p_po and qty_diterima > 0) then 'sebagian'
    else status end
  where id = p_po;
end $function$;

-- ---------- setujui_pesanan ----------
create or replace function public.setujui_pesanan(p_id bigint, p_user text)
  returns bigint language plpgsql as $function$
declare
  v_p pesanan%rowtype; v_cfg pengaturan%rowtype; v_inv bigint;
  v_user text := auth.jwt() ->> 'email';
begin
  if not is_staff() then raise exception 'Hanya staf yang boleh memproses pesanan'; end if;
  select * into v_p from pesanan where id = p_id for update;
  if not found or v_p.status <> 'menunggu' then raise exception 'Pesanan tidak bisa diproses'; end if;
  select * into v_cfg from pengaturan where id = 1;
  v_inv := buat_invoice(
    v_p.pelanggan_id, current_date, current_date + coalesce(v_cfg.jatuh_tempo_hari, 14), 0, coalesce(v_cfg.ppn_persen, 0),
    'Dari pesanan ' || v_p.nomor,
    (select jsonb_agg(jsonb_build_object('item_id', item_id, 'qty', qty, 'harga', harga)) from pesanan_item where pesanan_id = p_id),
    v_user);
  update pesanan set status = 'disetujui', invoice_id = v_inv, diproses_oleh = v_user, diproses_at = now() where id = p_id;
  return v_inv;
end $function$;

-- ---------- tolak_pesanan ----------
create or replace function public.tolak_pesanan(p_id bigint, p_alasan text, p_user text)
  returns void language plpgsql as $function$
declare v_user text := auth.jwt() ->> 'email';
begin
  if not is_staff() then raise exception 'Hanya staf yang boleh memproses pesanan'; end if;
  update pesanan set status = 'ditolak', catatan_admin = p_alasan, diproses_oleh = v_user, diproses_at = now()
    where id = p_id and status = 'menunggu';
  if not found then raise exception 'Pesanan tidak bisa diproses'; end if;
end $function$;

-- ---------- konfirmasi_pembayaran ----------
create or replace function public.konfirmasi_pembayaran(p_klaim bigint, p_akun bigint, p_user text)
  returns bigint language plpgsql as $function$
declare
  v_k pembayaran_klaim%rowtype; v_pid bigint;
  v_user text := auth.jwt() ->> 'email';
begin
  if not is_staff() then raise exception 'Hanya staf yang boleh mengonfirmasi'; end if;
  select * into v_k from pembayaran_klaim where id = p_klaim for update;
  if not found or v_k.status <> 'menunggu' then raise exception 'Pembayaran tidak bisa diproses'; end if;
  v_pid := catat_pembayaran(v_k.invoice_id, v_k.jumlah, p_akun, v_k.metode, v_k.tanggal,
                            trim(coalesce(v_k.catatan, '') || ' (via portal pelanggan)'), v_user);
  update pembayaran_klaim set status = 'dikonfirmasi', pembayaran_id = v_pid, diproses_oleh = v_user, diproses_at = now()
    where id = p_klaim;
  return v_pid;
end $function$;

-- ---------- tolak_pembayaran ----------
create or replace function public.tolak_pembayaran(p_klaim bigint, p_alasan text, p_user text)
  returns void language plpgsql as $function$
declare v_user text := auth.jwt() ->> 'email';
begin
  if not is_staff() then raise exception 'Hanya staf yang boleh memproses pembayaran'; end if;
  update pembayaran_klaim set status = 'ditolak', catatan_admin = p_alasan, diproses_oleh = v_user, diproses_at = now()
    where id = p_klaim and status = 'menunggu';
  if not found then raise exception 'Pembayaran tidak bisa diproses'; end if;
end $function$;
