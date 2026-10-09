import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { EmptyRow, ErrorNote, Field, INV_LABEL, InvBadge, Modal, Stat, invStatus, parseHarga, rupiah, tglD, useTable, usePengaturan } from './ui';
import { cetak } from './Invoice';

const KET = { tersedia: ['aman', 'Tersedia'], terbatas: ['menipis', 'Stok terbatas'], habis: ['habis', 'Habis'] };
const hue = (s) => [...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) * 37 % 360;

const NoLink = ({ cfg }) => (
  <div className="notice">Akunmu belum terhubung ke data pelanggan. Hubungi {cfg.nama_usaha || 'pemilik usaha'} untuk menghubungkannya.</div>
);

// ================= Beranda =================
export function PortalBeranda({ me, go }) {
  const { rows, loading, error } = useTable('invoice', { limit: 200 });
  const [cfg] = usePengaturan();
  const sisa = rows.reduce((a, i) => a + (+i.total - +i.dibayar), 0);
  const telat = rows.filter((i) => invStatus(i) === 'terlambat').length;

  return (
    <>
      <ErrorNote error={error} />
      {!me?.pelanggan_id && <NoLink cfg={cfg} />}
      <div className="stats">
        <Stat label="Total invoice" value={rows.length} />
        <Stat label="Belum dibayar" value={rupiah(sisa)} tone={sisa ? 'warn' : ''} />
        <Stat label="Lewat jatuh tempo" value={telat} tone={telat ? 'bad' : ''} />
      </div>
      <div className="grid2">
        <section className="card">
          <h3>Invoice terbaru</h3>
          {rows.slice(0, 5).map((i) => (
            <div className="line" key={i.id}>
              <span><b>{i.nomor}</b><small className="block">{tglD(i.tanggal)}</small></span>
              <span className="r"><b>{rupiah(i.total)}</b> <InvBadge i={i} /></span>
            </div>
          ))}
          {!rows.length && <p className="muted">{loading ? 'Memuat…' : 'Belum ada invoice.'}</p>}
          {rows.length > 0 && <div className="row end"><button className="btn ghost" onClick={() => go('p_invoice')}>Lihat semua</button></div>}
        </section>
        <section className="card">
          <h3>Hubungi kami</h3>
          <p><b>{cfg.nama_usaha}</b></p>
          {cfg.alamat && <p className="muted">{cfg.alamat}</p>}
          {cfg.telepon && <p className="muted">Telepon: {cfg.telepon}</p>}
          <p className="muted small" style={{ marginTop: 10 }}>Untuk pembayaran atau pertanyaan tagihan, silakan hubungi kontak di atas.</p>
        </section>
      </div>
    </>
  );
}

// ================= Katalog =================
export function PortalKatalog() {
  const { rows, loading, error } = useTable('katalog', { order: 'name', asc: true });
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
  const view = rows.filter((r) => (!cat || r.category === cat) && `${r.name} ${r.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <ErrorNote error={error} />
      <div className="filters">
        <input placeholder="Cari produk" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Semua kategori</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Produk</th><th>Kategori</th><th className="n">Harga</th><th>Ketersediaan</th></tr></thead>
        <tbody>
          {view.map((r) => {
            const [cls, label] = KET[r.ketersediaan] || KET.tersedia;
            return (
              <tr key={r.id}>
                <td><div className="prod"><span className="av" style={{ background: `hsl(${hue(r.name)} 70% 92%)`, color: `hsl(${hue(r.name)} 55% 32%)` }}>{r.name[0]?.toUpperCase()}</span><b>{r.name}</b></div></td>
                <td><span className="chip">{r.category}</span></td>
                <td className="n">{rupiah(parseHarga(r.price))}</td>
                <td><span className={'badge ' + cls}>{label}</span></td>
              </tr>
            );
          })}
          {!view.length && <EmptyRow cols={4} loading={loading} text="Tidak ada produk." />}
        </tbody>
      </table></div>
    </>
  );
}

// ================= Invoice saya =================
function Detail({ inv, onClose }) {
  const [lines, setLines] = useState([]);
  const [pays, setPays] = useState([]);
  const [cfg] = usePengaturan();
  useEffect(() => {
    supabase.from('invoice_item').select('*').eq('invoice_id', inv.id).order('id').then(({ data }) => setLines(data || []));
    supabase.from('pembayaran').select('*').eq('invoice_id', inv.id).order('id').then(({ data }) => setPays(data || []));
  }, [inv.id]);
  const sisa = inv.total - inv.dibayar;

  return (
    <Modal title={inv.nomor} onClose={onClose} wide>
      <div className="meta"><span>Tanggal: <b>{tglD(inv.tanggal)}</b></span><span>Jatuh tempo: <b>{tglD(inv.jatuh_tempo)}</b></span><InvBadge i={inv} /></div>
      <div className="tablewrap"><table>
        <thead><tr><th>Produk</th><th className="n">Qty</th><th className="n">Harga</th><th className="n">Jumlah</th></tr></thead>
        <tbody>{lines.map((l) => <tr key={l.id}><td>{l.nama}</td><td className="n">{l.qty}</td><td className="n">{rupiah(l.harga)}</td><td className="n">{rupiah(l.subtotal)}</td></tr>)}</tbody>
      </table></div>
      <div className="sumbox">
        <div className="sumrow"><span>Subtotal</span><span>{rupiah(inv.subtotal)}</span></div>
        <div className="sumrow"><span>Diskon</span><span>{rupiah(inv.diskon)}</span></div>
        <div className="sumrow"><span>PPN {inv.ppn_persen}%</span><span>{rupiah(inv.ppn)}</span></div>
        <div className="sumrow big"><span>Total</span><b>{rupiah(inv.total)}</b></div>
        <div className="sumrow"><span>Dibayar</span><span>{rupiah(inv.dibayar)}</span></div>
        <div className="sumrow"><span>Sisa tagihan</span><b>{rupiah(sisa)}</b></div>
      </div>
      {pays.length > 0 && (<>
        <h3 className="sub">Pembayaran diterima</h3>
        {pays.map((p) => <div className="sumrow" key={p.id}><span>{tglD(p.tanggal)} · {p.metode}</span><b>{rupiah(p.jumlah)}</b></div>)}
      </>)}
      <div className="row end"><button className="btn ghost" onClick={() => cetak(inv, lines, cfg)}>Cetak</button></div>
    </Modal>
  );
}

export function PortalInvoice({ me }) {
  const { rows, loading, error } = useTable('invoice', { select: '*, pelanggan(nama)', limit: 500 });
  const [cfg] = usePengaturan();
  const [fs, setFs] = useState('');
  const [det, setDet] = useState(null);
  const view = rows.filter((i) => !fs || invStatus(i) === fs);

  return (
    <>
      <ErrorNote error={error} />
      {!me?.pelanggan_id && <NoLink cfg={cfg} />}
      <div className="filters">
        <select value={fs} onChange={(e) => setFs(e.target.value)}>
          <option value="">Semua status</option>
          {Object.entries(INV_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Nomor</th><th>Tanggal</th><th>Jatuh tempo</th><th className="n">Total</th><th className="n">Sisa</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {view.map((i) => (
            <tr key={i.id}>
              <td><b>{i.nomor}</b></td><td>{tglD(i.tanggal)}</td><td>{tglD(i.jatuh_tempo)}</td>
              <td className="n">{rupiah(i.total)}</td><td className="n">{rupiah(i.total - i.dibayar)}</td><td><InvBadge i={i} /></td>
              <td className="act"><button className="btn ghost sm" onClick={() => setDet(i)}>Detail</button></td>
            </tr>
          ))}
          {!view.length && <EmptyRow cols={7} loading={loading} text="Belum ada invoice." />}
        </tbody>
      </table></div>
      {det && <Detail inv={det} onClose={() => setDet(null)} />}
    </>
  );
}

// ================= Profil saya =================
export function PortalProfil({ me, user, notify }) {
  const [f, setF] = useState(null);
  const [cfg] = usePengaturan();
  useEffect(() => {
    if (!me?.pelanggan_id) return;
    supabase.from('pelanggan').select('*').eq('id', me.pelanggan_id).maybeSingle().then(({ data }) => setF(data));
  }, [me?.pelanggan_id]);

  async function save(e) {
    e.preventDefault();
    const { error } = await supabase.from('pelanggan').update({ nama: f.nama, telepon: f.telepon, alamat: f.alamat }).eq('id', f.id);
    if (error) return notify(error.message, 'err');
    notify('Profil disimpan.');
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  if (!me?.pelanggan_id) return <NoLink cfg={cfg} />;
  if (!f) return <p className="muted">Memuat…</p>;
  return (
    <form className="card mform" style={{ maxWidth: 560 }} onSubmit={save}>
      <Field label="Email login"><input value={user || ''} disabled /></Field>
      <Field label="Nama"><input required value={f.nama || ''} onChange={set('nama')} /></Field>
      <Field label="Telepon"><input value={f.telepon || ''} onChange={set('telepon')} /></Field>
      <Field label="Alamat"><input value={f.alamat || ''} onChange={set('alamat')} /></Field>
      <div className="row end"><button className="btn">Simpan profil</button></div>
    </form>
  );
}