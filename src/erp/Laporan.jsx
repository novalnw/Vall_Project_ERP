import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { EmptyRow, ErrorNote, INV_LABEL, InvBadge, Stat, exportCSV, invStatus, isoEnd, isoStart, monthStart, rupiah, saldoAkun, tgl, tglD, useRange } from './ui';

const n = (x) => +x || 0;

// ================= Laporan penjualan =================
export function LaporanPenjualan() {
  const { from, to, UI } = useRange();
  const [rows, setRows] = useState([]);
  const [top, setTop] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const a = await supabase.from('invoice').select('*, pelanggan(nama)').gte('tanggal', from).lte('tanggal', to).order('tanggal', { ascending: false });
      const b = await supabase.from('invoice_item').select('nama, qty, subtotal, invoice!inner(tanggal)').gte('invoice.tanggal', from).lte('invoice.tanggal', to);
      setErr(a.error?.message || ''); setRows(a.data || []);
      const m = {};
      (b.data || []).forEach((x) => { m[x.nama] = m[x.nama] || { nama: x.nama, qty: 0, omzet: 0 }; m[x.nama].qty += n(x.qty); m[x.nama].omzet += n(x.subtotal); });
      setTop(Object.values(m).sort((p, q) => q.omzet - p.omzet).slice(0, 5));
    })();
  }, [from, to]);

  const total = rows.reduce((a, i) => a + n(i.total), 0);
  const bayar = rows.reduce((a, i) => a + n(i.dibayar), 0);

  return (
    <>
      <ErrorNote error={err} />
      {UI}
      <div className="stats">
        <Stat label="Jumlah invoice" value={rows.length} />
        <Stat label="Total penjualan" value={rupiah(total)} />
        <Stat label="Sudah dibayar" value={rupiah(bayar)} />
        <Stat label="Piutang" value={rupiah(total - bayar)} tone="warn" />
      </div>
      <div className="grid2">
        <section className="card">
          <h3>Produk terlaris</h3>
          {top.map((t) => <div className="line" key={t.nama}><span>{t.nama} <small>· {t.qty} terjual</small></span><b>{rupiah(t.omzet)}</b></div>)}
          {!top.length && <p className="muted">Belum ada penjualan pada periode ini.</p>}
        </section>
      </div>
      <div className="filters" style={{ marginTop: 16 }}>
        <span className="grow" />
        <button className="btn ghost" onClick={() => exportCSV('laporan-penjualan', rows.map((i) => ({ Nomor: i.nomor, Tanggal: i.tanggal, Pelanggan: i.pelanggan?.nama, Total: i.total, Dibayar: i.dibayar, Sisa: n(i.total) - n(i.dibayar), Status: INV_LABEL[invStatus(i)] })))}>CSV</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Nomor</th><th>Tanggal</th><th>Pelanggan</th><th className="n">Total</th><th className="n">Dibayar</th><th className="n">Sisa</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id}><td><b>{i.nomor}</b></td><td>{tglD(i.tanggal)}</td><td>{i.pelanggan?.nama || 'Umum'}</td><td className="n">{rupiah(i.total)}</td><td className="n">{rupiah(i.dibayar)}</td><td className="n">{rupiah(n(i.total) - n(i.dibayar))}</td><td><InvBadge i={i} /></td></tr>
          ))}
          {!rows.length && <EmptyRow cols={7} text="Tidak ada invoice pada periode ini." />}
        </tbody>
      </table></div>
    </>
  );
}

// ================= Penjualan per pelanggan =================
export function PenjualanPelanggan() {
  const { from, to, UI } = useRange();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    supabase.from('invoice').select('total, dibayar, pelanggan_id, pelanggan(nama)').gte('tanggal', from).lte('tanggal', to).then(({ data, error }) => {
      setErr(error?.message || '');
      const m = {};
      (data || []).forEach((i) => {
        const k = i.pelanggan_id ?? 0;
        m[k] = m[k] || { nama: i.pelanggan?.nama || 'Tanpa pelanggan', jumlah: 0, total: 0, bayar: 0 };
        m[k].jumlah += 1; m[k].total += n(i.total); m[k].bayar += n(i.dibayar);
      });
      setRows(Object.values(m).sort((a, b) => b.total - a.total));
    });
  }, [from, to]);
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <>
      <ErrorNote error={err} />
      {UI}
      <div className="filters"><span className="grow" /><button className="btn ghost" onClick={() => exportCSV('penjualan-per-pelanggan', rows.map((r) => ({ Pelanggan: r.nama, Invoice: r.jumlah, Total: r.total, Dibayar: r.bayar, Piutang: r.total - r.bayar })))}>CSV</button></div>
      <div className="tablewrap"><table>
        <thead><tr><th>Pelanggan</th><th className="n">Invoice</th><th>Kontribusi</th><th className="n">Total</th><th className="n">Dibayar</th><th className="n">Piutang</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.nama}><td><b>{r.nama}</b></td><td className="n">{r.jumlah}</td>
              <td style={{ minWidth: 140 }}><div className="track"><i style={{ width: (r.total / max) * 100 + '%' }} /></div></td>
              <td className="n">{rupiah(r.total)}</td><td className="n">{rupiah(r.bayar)}</td><td className="n neg">{rupiah(r.total - r.bayar)}</td></tr>
          ))}
          {!rows.length && <EmptyRow cols={6} text="Tidak ada penjualan pada periode ini." />}
        </tbody>
      </table></div>
    </>
  );
}

// ================= Mutasi per barang =================
export function MutasiBarang({ items }) {
  const { from, to, UI } = useRange();
  const [rows, setRows] = useState([]);
  const [it, setIt] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    let q = supabase.from('stok_mutasi').select('*').gte('created_at', isoStart(from)).lte('created_at', isoEnd(to)).order('id', { ascending: false }).limit(1000);
    if (it) q = q.eq('item_id', +it);
    q.then(({ data, error }) => { setErr(error?.message || ''); setRows(data || []); });
  }, [from, to, it]);
  const masuk = rows.filter((r) => r.qty > 0).reduce((a, r) => a + r.qty, 0);
  const keluar = rows.filter((r) => r.qty < 0).reduce((a, r) => a - r.qty, 0);
  const JENIS = { invoice: 'Penjualan', penerimaan: 'Penerimaan PO', opname: 'Opname' };

  return (
    <>
      <ErrorNote error={err} />
      {UI}
      <div className="filters">
        <select value={it} onChange={(e) => setIt(e.target.value)}><option value="">Semua produk</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        <span className="grow" />
        <button className="btn ghost" onClick={() => exportCSV('mutasi-barang', rows.map((r) => ({ Waktu: tgl(r.created_at), Produk: r.item_name, Jenis: JENIS[r.jenis] || r.jenis, Qty: r.qty, Saldo: r.saldo, Referensi: r.ref, Petugas: r.dibuat_oleh })))}>CSV</button>
      </div>
      <div className="stats"><Stat label="Total masuk" value={'+' + masuk} /><Stat label="Total keluar" value={'-' + keluar} tone="warn" /></div>
      <div className="tablewrap"><table>
        <thead><tr><th>Waktu</th><th>Produk</th><th>Jenis</th><th className="n">Masuk</th><th className="n">Keluar</th><th className="n">Saldo</th><th>Referensi</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}><td>{tgl(r.created_at)}</td><td><b>{r.item_name}</b></td><td><span className="chip">{JENIS[r.jenis] || r.jenis}</span></td>
              <td className="n pos">{r.qty > 0 ? '+' + r.qty : ''}</td><td className="n neg">{r.qty < 0 ? r.qty : ''}</td><td className="n">{r.saldo}</td><td className="muted">{r.ref || '-'}</td></tr>
          ))}
          {!rows.length && <EmptyRow cols={7} text="Belum ada mutasi pada periode ini." />}
        </tbody>
      </table></div>
    </>
  );
}

// ================= Laba rugi =================
export function LabaRugi() {
  const { from, to, UI } = useRange();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    (async () => {
      const a = await supabase.from('invoice').select('subtotal, diskon').gte('tanggal', from).lte('tanggal', to);
      const b = await supabase.from('invoice_item').select('qty, hpp, invoice!inner(tanggal)').gte('invoice.tanggal', from).lte('invoice.tanggal', to);
      const c = await supabase.from('pengeluaran').select('kategori, jumlah').gte('tanggal', from).lte('tanggal', to);
      setErr(a.error?.message || b.error?.message || c.error?.message || '');
      const pendapatan = (a.data || []).reduce((s, i) => s + n(i.subtotal) - n(i.diskon), 0);
      const hpp = (b.data || []).reduce((s, i) => s + n(i.qty) * n(i.hpp), 0);
      const kat = {};
      (c.data || []).forEach((x) => { const k = x.kategori || 'Lainnya'; kat[k] = (kat[k] || 0) + n(x.jumlah); });
      const biaya = Object.values(kat).reduce((s, v) => s + v, 0);
      setD({ pendapatan, hpp, kotor: pendapatan - hpp, kat: Object.entries(kat).sort((p, q) => q[1] - p[1]), biaya, bersih: pendapatan - hpp - biaya });
    })();
  }, [from, to]);

  return (
    <>
      <ErrorNote error={err} />
      {UI}
      {d && (
        <>
          <div className="stats">
            <Stat label="Pendapatan" value={rupiah(d.pendapatan)} />
            <Stat label="Laba kotor" value={rupiah(d.kotor)} />
            <Stat label="Total biaya" value={rupiah(d.biaya)} tone="warn" />
            <Stat label="Laba bersih" value={rupiah(d.bersih)} tone={d.bersih < 0 ? 'bad' : ''} />
          </div>
          <section className="card stmt">
            <div className="sumrow"><span>Pendapatan penjualan (setelah diskon, sebelum PPN)</span><b>{rupiah(d.pendapatan)}</b></div>
            <div className="sumrow"><span>Harga pokok penjualan (HPP)</span><b>− {rupiah(d.hpp)}</b></div>
            <div className="sumrow big"><span>Laba kotor</span><b>{rupiah(d.kotor)}</b></div>
            <h3 className="sub">Biaya operasional</h3>
            {d.kat.map(([k, v]) => <div className="sumrow" key={k}><span>{k}</span><span>− {rupiah(v)}</span></div>)}
            {!d.kat.length && <p className="muted">Tidak ada pengeluaran pada periode ini.</p>}
            <div className="sumrow big"><span>Laba bersih</span><b className={d.bersih < 0 ? 'neg' : 'pos'}>{rupiah(d.bersih)}</b></div>
            {d.pendapatan > 0 && <p className="muted small">Margin bersih {((d.bersih / d.pendapatan) * 100).toFixed(1)}%. HPP memakai harga beli terakhir produk saat invoice dibuat; isi lewat Penerimaan PO atau Harga supplier.</p>}
            <div className="row end"><button className="btn ghost" onClick={() => exportCSV('laba-rugi', [{ Pendapatan: d.pendapatan, HPP: d.hpp, 'Laba kotor': d.kotor, Biaya: d.biaya, 'Laba bersih': d.bersih }])}>CSV</button></div>
          </section>
        </>
      )}
    </>
  );
}

// ================= Ringkasan keuangan (dashboard) =================
export function FinanceSummary() {
  const [d, setD] = useState(null);
  useEffect(() => {
    (async () => {
      const r = await Promise.all([
        supabase.from('invoice').select('total, dibayar, status, jatuh_tempo, tanggal'),
        supabase.from('pengeluaran').select('jumlah, tanggal, akun_id'),
        supabase.from('pembayaran').select('jumlah, akun_id'),
        supabase.from('kas_mutasi').select('jenis, jumlah, akun_id'),
        supabase.from('akun_kas').select('id, saldo_awal'),
      ]);
      if (r.some((x) => x.error)) return;
      const [inv, exp, pay, mut, akun] = r.map((x) => x.data || []);
      const ms = monthStart();
      setD({
        jual: inv.filter((i) => i.tanggal >= ms).reduce((s, i) => s + n(i.total), 0),
        piutang: inv.reduce((s, i) => s + n(i.total) - n(i.dibayar), 0),
        telat: inv.filter((i) => invStatus(i) === 'terlambat').length,
        biaya: exp.filter((e) => e.tanggal >= ms).reduce((s, e) => s + n(e.jumlah), 0),
        kas: akun.reduce((s, a) => s + saldoAkun(a, pay, exp, mut), 0),
      });
    })();
  }, []);
  if (!d) return null;
  return (
    <div className="stats">
      <Stat label="Penjualan bulan ini" value={rupiah(d.jual)} />
      <Stat label="Pengeluaran bulan ini" value={rupiah(d.biaya)} />
      <Stat label="Piutang berjalan" value={rupiah(d.piutang)} tone={d.telat ? 'warn' : ''} />
      <Stat label="Saldo kas & bank" value={rupiah(d.kas)} />
    </div>
  );
}