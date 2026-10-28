import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { ErrorNote, Stat, exportCSV, rupiah, tglD, useRange } from './ui';

const n = (x) => +x || 0;
const HARI_PREDIKSI = 90;

const minusDays = (d, days) => {
  const x = new Date(d + 'T00:00:00');
  x.setDate(x.getDate() - days);
  return x.toISOString().slice(0, 10);
};

const buatLabel = (d) => {
  const x = new Date(d + 'T00:00:00');
  return `${x.getDate()} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][x.getMonth()]}`;
};

function BarChart({ data, format = rupiah }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="chart">
      {data.map((d, i) => (
        <div className="cbar" key={i} title={`${d.label}: ${format(d.value)}`}>
          <div className="cbar-fill" style={{ height: Math.max(2, (d.value / max) * 100) + '%' }} />
        </div>
      ))}
    </div>
  );
}

function Point({ label, value, tone, bar }) {
  return (
    <div className="point">
      <div className="point-bar" style={{ height: (bar || 0) * 100 + '%' }} />
      <b className={tone || ''}>{value}</b>
      <small>{label}</small>
    </div>
  );
}

export default function Analitik({ items = [] }) {
  const { from, to, UI } = useRange();
  const [inv, setInv] = useState([]);
  const [detail, setDetail] = useState([]);
  const [penjualan, setPenjualan] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    const m = minusDays(to, HARI_PREDIKSI);
    Promise.all([
      supabase.from('invoice').select('tanggal, total, dibayar').gte('tanggal', from).lte('tanggal', to),
      supabase.from('invoice_item').select('qty, subtotal, hpp, invoice!inner(tanggal)').gte('invoice.tanggal', from).lte('invoice.tanggal', to),
      supabase.from('invoice_item').select('item_id, qty, invoice!inner(tanggal)').gte('invoice.tanggal', m).lte('invoice.tanggal', to),
    ]).then(([a, b, c]) => {
      if (!live) return;
      setErr(a.error?.message || b.error?.message || c.error?.message || '');
      setInv(a.data || []);
      setDetail(b.data || []);
      setPenjualan(c.data || []);
    });
    return () => { live = false; };
  }, [from, to]);

  const trend = useMemo(() => {
    const m = {};
    inv.forEach((i) => { m[i.tanggal] = (m[i.tanggal] || 0) + n(i.total); });
    return Object.entries(m).sort((p, q) => p[0] < q[0] ? -1 : 1).map(([d, v]) => ({ label: buatLabel(d), value: v }));
  }, [inv]);

  const omzet = inv.reduce((s, i) => s + n(i.total), 0);
  const hpp = detail.reduce((s, i) => s + n(i.qty) * n(i.hpp), 0);
  const kotor = omzet - hpp;
  const margin = omzet > 0 ? (kotor / omzet) * 100 : 0;
  const transaksi = inv.length;
  const avgTransaksi = transaksi ? omzet / transaksi : 0;
  const piutang = inv.reduce((s, i) => s + n(i.total) - n(i.dibayar), 0);

  const prediksi = useMemo(() => {
    const penjualanPerItem = {};
    penjualan.forEach((p) => {
      const k = p.item_id ?? p.nama ?? 'x';
      penjualanPerItem[k] = (penjualanPerItem[k] || 0) + n(p.qty);
    });
    return items.map((it) => {
      const qty = penjualanPerItem[it.id] || 0;
      const rata = qty / HARI_PREDIKSI;
      const stok = n(it.stock);
      const sisaHari = rata > 0 ? stok / rata : Infinity;
      const rekomendasi = Math.max(n(it.minStock) || 5, Math.ceil(rata * 14));
      const status = stok <= 0 ? 'habis' : sisaHari < 7 ? 'segera' : sisaHari < 14 ? 'perlu' : 'aman';
      const row = { nama: it.name, kategori: it.category || '-', qty, rata, stok, sisaHari, rekomendasi, status };
      return row;
    }).sort((a, b) => {
      const r = { habis: 0, segera: 1, perlu: 2, aman: 3 };
      return r[a.status] - r[b.status] || a.sisaHari - b.sisaHari;
    });
  }, [items, penjualan]);

  const STATUS_LABEL = { habis: 'Habis', segera: 'Segera restock', perlu: 'Perlu restock', aman: 'Aman' };
  const butuhRestock = prediksi.filter((p) => p.status !== 'aman');

  return (
    <>
      <ErrorNote error={err} />
      {UI}
      <div className="stats">
        <Stat label="Omzet periode" value={rupiah(omzet)} />
        <Stat label="Laba kotor" value={rupiah(kotor)} tone={kotor < 0 ? 'bad' : ''} />
        <Stat label="Margin" value={margin.toFixed(1) + '%'} />
        <Stat label="Rata² per transaksi" value={rupiah(avgTransaksi)} />
      </div>

      <div className="grid2">
        <section className="card">
          <h3>Tren penjualan <small className="muted">({tglD(from)} s.d {tglD(to)})</small></h3>
          {trend.length
            ? <BarChart data={trend} />
            : <p className="muted">Belum ada penjualan pada periode ini.</p>}
        </section>

        <section className="card">
          <h3>Prediksi stok <small className="muted">(dari {HARI_PREDIKSI} hari terakhir)</small></h3>
          {prediksi.length ? (
            <div className="points">
              <Point label="Perlu restock" value={butuhRestock.length} bar={butuhRestock.length / Math.max(1, prediksi.length)} tone="warn" />
              <Point label="Stok aman" value={prediksi.length - butuhRestock.length} bar={(prediksi.length - butuhRestock.length) / Math.max(1, prediksi.length)} />
              <Point label="Laba kotor" value={rupiah(kotor)} tone={kotor < 0 ? 'neg' : 'pos'} />
              <Point label="Piutang" value={rupiah(piutang)} tone="warn" />
            </div>
          ) : <p className="muted">Belum ada data produk.</p>}
        </section>
      </div>

      <div className="filters">
        <h3 className="grow">Rekomendasi pembelian</h3>
        <span className="grow" />
        <button className="btn ghost" onClick={() => exportCSV('prediksi-restock', prediksi.map((p) => ({
          Produk: p.nama, Kategori: p.kategori, 'Terjual 90hr': p.qty, 'Rata²/hari': p.rata.toFixed(2),
          'Stok saat ini': p.stok, 'Perkiraan habis (hari)': isFinite(p.sisaHari) ? Math.round(p.sisaHari) : '∞',
          Rekomendasi: p.rekomendasi, Status: STATUS_LABEL[p.status],
        })))}>CSV</button>
      </div>

      <div className="tablewrap"><table>
        <thead><tr>
          <th>Produk</th><th>Kategori</th>
          <th className="n">Terjual 90hr</th><th className="n">Rata²/hari</th>
          <th className="n">Stok</th><th className="n">Perkiraan habis</th><th className="n">Rekomendasi beli</th><th>Status</th>
        </tr></thead>
        <tbody>
          {prediksi.map((p) => (
            <tr key={p.nama}>
              <td><b>{p.nama}</b></td><td><span className="chip">{p.kategori}</span></td>
              <td className="n">{p.qty}</td>
              <td className="n">{p.rata.toFixed(2)}</td>
              <td className="n"><b>{p.stok}</b></td>
              <td className="n">{isFinite(p.sisaHari) ? Math.round(p.sisaHari) + ' hari' : '∞'}</td>
              <td className="n">{p.rekomendasi}</td>
              <td><span className={'badge st-' + p.status}>{STATUS_LABEL[p.status]}</span></td>
            </tr>
          ))}
          {!prediksi.length && <tr><td colSpan="8"><div className="emptystate"><span>Belum ada data produk.</span></div></td></tr>}
        </tbody>
      </table></div>
    </>
  );
}
