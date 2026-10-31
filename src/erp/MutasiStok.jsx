import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { ErrorNote, EmptyRow, Stat, exportCSV, tgl, useRange, isoStart, isoEnd } from './ui';

const JENIS = {
  invoice: 'Keluar',
  penerimaan: 'Masuk',
  opname: 'Penyesuaian',
  retur: 'Retur',
  penyesuaian: 'Penyesuaian',
  keluar: 'Keluar',
};

export default function LaporanMutasiStok({ items, onOpname, notify, reload, user }) {
  const { from, to, UI } = useRange();
  const [rows, setRows] = useState([]);
  const [it, setIt] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ item_id: '', jenis: 'retur', qty: '', catatan: '' });

  const load = () => {
    let q = supabase.from('stok_mutasi').select('*')
      .gte('created_at', isoStart(from)).lte('created_at', isoEnd(to))
      .order('id', { ascending: false }).limit(1000);
    if (it) q = q.eq('item_id', +it);
    q.then(({ data, error }) => { setErr(error?.message || ''); setRows(data || []); });
  };
  useEffect(load, [from, to, it]);

  const simpan = async (e) => {
    e.preventDefault();
    const qty = parseInt(f.qty, 10);
    if (!f.item_id || !qty) { notify('Pilih produk dan isi jumlah.', 'err'); return; }
    const akhirQty = f.jenis === 'retur' ? Math.abs(qty) : qty;
    setLoading(true);

    let error = null;
    const rpc = await supabase.rpc('input_mutasi_stok', {
      p_item_id: +f.item_id,
      p_jenis: f.jenis,
      p_qty: akhirQty,
      p_catatan: f.catatan.trim() || null,
    });
    if (!rpc.error) {
      // RPC berhasil
    } else if (String(rpc.error.message).includes('Could not find the function')) {
      // Fungsi SQL belum dibuat -> fallback langsung dari client
      const item = items.find((i) => i.id === +f.item_id);
      const baru = (item?.stock || 0) + akhirQty;
      if (!item) error = { message: 'Produk tidak ditemukan.' };
      else if (baru < 0) error = { message: `Stok tidak bisa negatif (sisa ${item.stock}).` };
      else {
        const u = await supabase.from('inventory').update({ stock: baru }).eq('id', item.id);
        if (u.error) error = u.error;
        else {
          const ins = await supabase.from('stok_mutasi').insert({
            item_id: item.id, item_name: item.name, jenis: f.jenis,
            qty: akhirQty, saldo: baru,
            ref: f.catatan.trim() || null,
            dibuat_oleh: user || null,
          });
          if (ins.error) error = ins.error;
        }
      }
    } else {
      error = rpc.error;
    }

    setLoading(false);
    if (error) { notify('Gagal menyimpan: ' + error.message, 'err'); return; }
    notify('Mutasi tercatat.');
    setOpen(false); setF({ item_id: '', jenis: 'retur', qty: '', catatan: '' });
    load(); if (reload) reload();
  };

  const bersihkan = async () => {
    if (!window.confirm('Hapus SEMUA catatan mutasi stok? Tindakan ini tidak bisa dibatalkan.')) return;
    setLoading(true);
    const { error } = await supabase.from('stok_mutasi').delete().neq('id', 0);
    setLoading(false);
    if (error) { notify('Gagal membersihkan: ' + error.message, 'err'); return; }
    notify('Semua mutasi stok dihapus.');
    load();
  };

  const masuk = rows.filter((r) => r.qty > 0).reduce((a, r) => a + r.qty, 0);
  const keluar = rows.filter((r) => r.qty < 0).reduce((a, r) => a - r.qty, 0);
  const bersih = masuk - keluar;

  return (
    <>
      <ErrorNote error={err} />

      <div className="actions">
        <button className="btn ghost" onClick={onOpname}>Mulai opname</button>
        <button className="btn" onClick={() => setOpen(true)}>+ Catat mutasi manual</button>
        {rows.length > 0 && <button className="btn ghost danger-t" onClick={bersihkan} disabled={loading}>Bersihkan mutasi</button>}
      </div>

      {UI}

      <div className="filters">
        <select value={it} onChange={(e) => setIt(e.target.value)}>
          <option value="">Semua produk</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <span className="grow" />
        <button className="btn ghost" onClick={() => exportCSV('laporan-mutasi-stok', rows.map((r) => ({ Tanggal: tgl(r.created_at), Barang: r.item_name, 'Jenis mutasi': JENIS[r.jenis] || r.jenis, Jumlah: r.qty, 'Stok akhir': r.saldo, Keterangan: r.ref || '-', 'Nama admin': r.dibuat_oleh })))}>CSV</button>
      </div>

      <div className="stats">
        <Stat label="Total masuk" value={'+' + masuk} />
        <Stat label="Total keluar" value={'-' + keluar} tone="warn" />
        <Stat label="Selisih bersih" value={(bersih > 0 ? '+' : '') + bersih} tone={bersih < 0 ? 'warn' : ''} />
        <Stat label="Transaksi" value={rows.length} />
      </div>

      <div className="tablewrap"><table>
        <thead><tr><th>Tanggal</th><th>Barang</th><th>Jenis mutasi</th><th className="n">Jumlah</th><th className="n">Stok akhir</th><th>Keterangan</th><th>Nama admin</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const arah = r.qty > 0 ? 'pos' : r.qty < 0 ? 'neg' : 'mut';
            return (
              <tr key={r.id}>
                <td>{tgl(r.created_at)}</td>
                <td><b>{r.item_name}</b></td>
                <td><span className="chip">{JENIS[r.jenis] || r.jenis}</span></td>
                <td className={'n ' + arah}><b>{r.qty > 0 ? '+' : ''}{r.qty}</b></td>
                <td className="n">{r.saldo}</td>
                <td className="muted">{r.ref || '-'}</td>
                <td className="muted">{r.dibuat_oleh || '-'}</td>
              </tr>
            );
          })}
          {!rows.length && <EmptyRow cols={7} text="Belum ada mutasi pada periode ini." />}
        </tbody>
      </table></div>

      {open && (
        <div className="overlay" onMouseDown={() => setOpen(false)}>
          <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={simpan}>
            <div className="mhead"><h3>Catat mutasi stok</h3><button type="button" className="iconbtn sm" aria-label="Tutup" onClick={() => setOpen(false)}>✕</button></div>
            <label className="field">Produk
              <select required value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value })}>
                <option value="">Pilih produk</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name} (stok {i.stock})</option>)}
              </select>
            </label>
            <div className="two">
              <label className="field">Jenis mutasi
                <select value={f.jenis} onChange={(e) => setF({ ...f, jenis: e.target.value })}>
                  <option value="retur">Retur (barang kembali)</option>
                  <option value="penyesuaian">Penyesuaian</option>
                </select>
              </label>
              <label className="field">Jumlah
                <input type="number" required value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} placeholder="cth: 5 atau -3" />
              </label>
            </div>
            <label className="field">Keterangan
              <input value={f.catatan} onChange={(e) => setF({ ...f, catatan: e.target.value })} placeholder="Alasan, nomor retur, dll." />
            </label>
            <p className="muted small">{f.jenis === 'retur' ? 'Retur otomatis ditambahkan ke stok (masuk).' : 'Penyesuaian memakai tanda +/- untuk menambah atau mengurangi stok.'}</p>
            <div className="row end">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Batal</button>
              <button className="btn" disabled={loading}>{loading ? 'Menyimpan…' : 'Simpan'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
