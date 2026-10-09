import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// ---------- Peran & akses ----------
export const ROLES = { owner: 'Pemilik usaha', admin: 'Admin', kasir: 'Kasir', gudang: 'Gudang' };
export const ROLE_DESC = {
  owner: 'Semua menu, termasuk peran & akses.',
  admin: 'Semua menu kecuali peran & akses.',
  kasir: 'Invoice, pembayaran, pelanggan, produk, dan laporan penjualan.',
  gudang: 'Produk, supplier, PO, penerimaan, harga supplier, opname, dan mutasi stok.',
};
const ACCESS = {
  owner: '*',
  admin: ['ringkasan', 'invoice_baru', 'invoice', 'pembayaran', 'pengeluaran', 'kas', 'log', 'pelanggan', 'barang', 'supplier', 'po', 'terima', 'harga_supplier', 'opname', 'lap_jual', 'lap_pelanggan', 'mutasi', 'laba_rugi', 'riwayat', 'pengaturan'],
  kasir: ['ringkasan', 'invoice_baru', 'invoice', 'pembayaran', 'pelanggan', 'barang', 'lap_jual', 'lap_pelanggan'],
  gudang: ['ringkasan', 'barang', 'supplier', 'po', 'terima', 'harga_supplier', 'opname', 'mutasi', 'riwayat'],
};
export const can = (role, tab) => ACCESS[role] === '*' || !!ACCESS[role]?.includes(tab);

// ---------- Helper ----------
export const parseHarga = (p) => Number(String(p ?? '').replace(/[^\d]/g, '')) || 0;
export const rupiah = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
export const tgl = (d) => new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
export const tglD = (d) => (d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { dateStyle: 'medium' }) : '-');
export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const monthStart = () => today().slice(0, 8) + '01';
export const isoStart = (d) => new Date(d + 'T00:00:00').toISOString();
export const isoEnd = (d) => new Date(d + 'T23:59:59').toISOString();

export function exportCSV(nama, rows) {
  if (!rows.length) return;
  const h = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [h.join(','), ...rows.map((r) => h.map((k) => esc(r[k])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
  a.download = nama + '.csv';
  a.click();
}

export const logAct = (user, aksi, detail) =>
  supabase.from('log_aktivitas').insert({ user_email: user, aksi, detail: detail || null }).then(() => {});

export function saldoAkun(a, pay, exp, mut) {
  const n = (x) => +x || 0;
  const sum = (arr) => arr.reduce((s, x) => s + n(x.jumlah), 0);
  return n(a.saldo_awal)
    + sum(pay.filter((p) => p.akun_id === a.id))
    + sum(mut.filter((m) => m.akun_id === a.id && m.jenis === 'masuk'))
    - sum(exp.filter((e) => e.akun_id === a.id))
    - sum(mut.filter((m) => m.akun_id === a.id && m.jenis === 'keluar'));
}

// ---------- Status invoice ----------
export const INV_LABEL = { belum_bayar: 'Belum dibayar', sebagian: 'Dibayar sebagian', lunas: 'Lunas', terlambat: 'Jatuh tempo' };
export function invStatus(i) {
  if (i.status === 'lunas') return 'lunas';
  if (i.jatuh_tempo && i.jatuh_tempo < today()) return 'terlambat';
  return i.status;
}
export const InvBadge = ({ i }) => <span className={'badge inv-' + invStatus(i)}>{INV_LABEL[invStatus(i)]}</span>;

// ---------- Hook data ----------
export function useTable(table, { select = '*', order = 'id', asc = false, limit = 1000 } = {}) {
  const [s, setS] = useState({ rows: [], loading: true, error: '' });
  const load = useCallback(async () => {
    const { data, error } = await supabase.from(table).select(select).order(order, { ascending: asc }).limit(limit);
    setS({ rows: data || [], loading: false, error: error ? error.message : '' });
  }, [table, select, order, asc, limit]);
  useEffect(() => { load(); }, [load]);
  return { ...s, load };
}

export function usePengaturan() {
  const [cfg, setCfg] = useState({ nama_usaha: 'Usaha Saya', alamat: '', telepon: '', prefix_invoice: 'INV', ppn_persen: 0, jatuh_tempo_hari: 14 });
  const load = useCallback(async () => {
    const { data } = await supabase.from('pengaturan').select('*').eq('id', 1).maybeSingle();
    if (data) setCfg(data);
  }, []);
  useEffect(() => { load(); }, [load]);
  return [cfg, load];
}

export function useRange() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const UI = (
    <div className="filters">
      <label className="field inl">Dari<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="field inl">Sampai<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
    </div>
  );
  return { from, to, UI };
}

// ---------- Komponen ----------
export const ErrorNote = ({ error }) =>
  error ? <div className="notice">Gagal memuat data: {error}. Pastikan SQL ERP sudah dijalankan di Supabase.</div> : null;

export const EmptyRow = ({ cols, loading, text = 'Belum ada data.' }) => (
  <tr><td colSpan={cols}><div className="emptystate"><span>{loading ? 'Memuat…' : text}</span></div></td></tr>
);

export const Field = ({ label, children }) => <label className="field">{label}{children}</label>;

export const Stat = ({ label, value, tone }) => (
  <div className={'stat ' + (tone || '')}><b>{value}</b><span>{label}</span></div>
);

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mhead"><h3>{title}</h3><button type="button" className="iconbtn sm" aria-label="Tutup" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function LineEditor({ items, lines, setLines, priceOf, showStock }) {
  const set = (i, p) => setLines(lines.map((l, k) => (k === i ? { ...l, ...p } : l)));
  return (
    <div className="lines">
      {lines.map((l, i) => (
        <div className="lrow" key={i}>
          <select value={l.item_id} onChange={(e) => {
            const it = items.find((x) => String(x.id) === e.target.value);
            set(i, { item_id: e.target.value, harga: it ? priceOf(it) : '' });
          }}>
            <option value="">Pilih produk</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.name}{showStock ? ` (stok ${it.stock})` : ''}</option>)}
          </select>
          <input type="number" min="1" value={l.qty} aria-label="Jumlah" onChange={(e) => set(i, { qty: e.target.value })} />
          <input type="number" min="0" value={l.harga} placeholder="Harga" aria-label="Harga" onChange={(e) => set(i, { harga: e.target.value })} />
          <b className="lsub">{rupiah((+l.qty || 0) * (+l.harga || 0))}</b>
          <button type="button" className="iconbtn sm bad" aria-label="Hapus baris" onClick={() => setLines(lines.length > 1 ? lines.filter((_, k) => k !== i) : lines)}>✕</button>
        </div>
      ))}
      <button type="button" className="btn ghost" onClick={() => setLines([...lines, { item_id: '', qty: 1, harga: '' }])}>+ Tambah baris</button>
    </div>
  );
}