import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { EmptyRow, ErrorNote, Field, InvBadge, Modal, Stat, invStatus, parseHarga, rupiah, tgl, tglD, today, useTable, usePengaturan } from './ui';
import { cetak } from './Invoice';
import { cetakNota } from './nota';
import { StBadge } from './Permintaan';

const KET = { tersedia: ['aman', 'Tersedia'], terbatas: ['menipis', 'Stok terbatas'], habis: ['habis', 'Habis'] };
const hue = (s) => [...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) * 37 % 360;
const pendingOf = (kl, id) => kl.filter((k) => k.invoice_id === id && k.status === 'menunggu').reduce((a, k) => a + +k.jumlah, 0);

const NoLink = ({ cfg }) => (
  <div className="notice">Akunmu belum terhubung ke data pelanggan. Hubungi {cfg.nama_usaha || 'pemilik usaha'} untuk menghubungkannya.</div>
);

function Qty({ value, onChange }) {
  return (
    <div className="stepper">
      <button type="button" aria-label="Kurangi" onClick={() => onChange(value - 1)}>−</button>
      <input type="number" min="0" value={value} onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))} />
      <button type="button" aria-label="Tambah" onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

// ================= Modal bayar =================
function BayarModal({ inv, me, cfg, onClose, onDone, notify }) {
  const { rows: kl } = useTable('pembayaran_klaim', { limit: 200 });
  const sisa = Math.max(inv.total - inv.dibayar - pendingOf(kl, inv.id), 0);
  const [f, setF] = useState({ jumlah: '', metode: 'transfer', tanggal: today(), catatan: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const jml = f.jumlah === '' ? String(sisa) : f.jumlah;

  async function submit(e) {
    e.preventDefault();
    const jumlah = +jml;
    if (!(jumlah > 0)) return notify('Isi jumlah pembayaran.', 'err');
    if (jumlah > sisa) return notify('Jumlah melebihi sisa tagihan.', 'err');
    if (file && file.size > 3 * 1024 * 1024) return notify('Ukuran bukti maksimal 3 MB.', 'err');
    setBusy(true);
    let path = null;
    if (file) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      path = `${me.id}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from('bukti').upload(path, file, { contentType: file.type });
      if (up.error) { setBusy(false); return notify('Gagal mengunggah bukti: ' + up.error.message, 'err'); }
    }
    const { error } = await supabase.rpc('ajukan_pembayaran', {
      p_invoice: inv.id, p_jumlah: jumlah, p_metode: f.metode, p_tanggal: f.tanggal, p_catatan: f.catatan || null, p_bukti: path,
    });
    setBusy(false);
    if (error) return notify(error.message, 'err');
    notify('Pembayaran dikirim. Menunggu konfirmasi admin.');
    onDone();
  }

  return (
    <Modal title={`Bayar ${inv.nomor}`} onClose={onClose}>
      <form className="mform" onSubmit={submit}>
        <div className="sumrow"><span>Sisa yang bisa dibayar</span><b>{rupiah(sisa)}</b></div>
        <div className="paybox">
          <b>Transfer ke:</b>
          <div>{cfg.info_bayar || `Hubungi ${cfg.nama_usaha || 'penjual'} untuk info rekening.`}</div>
        </div>
        <div className="two">
          <Field label="Jumlah (Rp)"><input type="number" min="1" max={sisa} required value={jml} onChange={(e) => setF({ ...f, jumlah: e.target.value })} /></Field>
          <Field label="Tanggal bayar"><input type="date" value={f.tanggal} onChange={(e) => setF({ ...f, tanggal: e.target.value })} /></Field>
        </div>
        <Field label="Metode">
          <select value={f.metode} onChange={(e) => setF({ ...f, metode: e.target.value })}>
            <option value="transfer">Transfer bank</option><option value="qris">QRIS</option><option value="tunai">Tunai</option><option value="lainnya">Lainnya</option>
          </select>
        </Field>
        <Field label="Bukti transfer (foto atau PDF, maks 3 MB)"><input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
        <Field label="Catatan"><input value={f.catatan} placeholder="Opsional" onChange={(e) => setF({ ...f, catatan: e.target.value })} /></Field>
        <div className="row end"><button type="button" className="btn ghost" onClick={onClose}>Batal</button><button className="btn" disabled={busy || sisa <= 0}>{busy ? 'Mengirim…' : 'Kirim pembayaran'}</button></div>
        <p className="muted small">Pembayaran baru tercatat setelah dikonfirmasi admin. Kamu akan mendapat nota setelah itu.</p>
      </form>
    </Modal>
  );
}

// ================= Beranda =================
export function PortalBeranda({ me, go, notify }) {
  const inv = useTable('invoice', { limit: 200 });
  const pes = useTable('pesanan', { limit: 50 });
  const kl = useTable('pembayaran_klaim', { limit: 100 });
  const [cfg] = usePengaturan();
  const [pay, setPay] = useState(null);

  const open = inv.rows.filter((i) => i.status !== 'lunas');
  const tunggakan = open.reduce((a, i) => a + (+i.total - +i.dibayar), 0);
  const telat = open.filter((i) => invStatus(i) === 'terlambat').length;
  const menunggu = kl.rows.filter((k) => k.status === 'menunggu').length + pes.rows.filter((p) => p.status === 'menunggu').length;

  return (
    <>
      <ErrorNote error={inv.error} />
      {!me?.pelanggan_id && <NoLink cfg={cfg} />}
      <div className="actions">
        <button className="btn big" onClick={() => go('p_pesan')}>Pesan sekarang</button>
        <button className="btn ghost big" onClick={() => go('p_invoice')}>Lihat semua tagihan</button>
      </div>
      <div className="stats">
        <Stat label="Tunggakan" value={rupiah(tunggakan)} tone={tunggakan ? 'warn' : ''} />
        <Stat label="Lewat jatuh tempo" value={telat} tone={telat ? 'bad' : ''} />
        <Stat label="Menunggu konfirmasi admin" value={menunggu} />
      </div>
      <div className="grid2">
        <section className="card">
          <h3>Tagihan yang harus dibayar</h3>
          {open.slice(0, 5).map((i) => {
            const pend = pendingOf(kl.rows, i.id);
            const bisa = i.total - i.dibayar - pend > 0;
            return (
              <div className="line" key={i.id}>
                <span><b>{i.nomor}</b><small className="block">Jatuh tempo {tglD(i.jatuh_tempo)}</small></span>
                <span className="r">
                  <b>{rupiah(i.total - i.dibayar)}</b>
                  {pend > 0 && <span className="badge st-menunggu">Menunggu konfirmasi</span>}
                  {bisa && <button className="btn sm" onClick={() => setPay(i)}>Bayar</button>}
                </span>
              </div>
            );
          })}
          {!open.length && <p className="muted">{inv.loading ? 'Memuat…' : 'Tidak ada tunggakan. Terima kasih!'}</p>}
        </section>
        <section className="card">
          <h3>Pesanan terbaru</h3>
          {pes.rows.slice(0, 4).map((p) => (
            <div className="line" key={p.id}>
              <span><b>{p.nomor}</b><small className="block">{tgl(p.created_at)}</small></span>
              <span className="r"><b>{rupiah(p.total)}</b> <StBadge s={p.status} /></span>
            </div>
          ))}
          {!pes.rows.length && <p className="muted">Belum ada pesanan.</p>}
          <div className="row end"><button className="btn ghost" onClick={() => go('p_pesanan')}>Semua pesanan</button></div>
        </section>
        <section className="card">
          <h3>Info pembayaran</h3>
          <p><b>{cfg.nama_usaha}</b></p>
          <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{cfg.info_bayar || 'Hubungi penjual untuk info rekening.'}</p>
          {cfg.telepon && <p className="muted small">Telepon: {cfg.telepon}</p>}
        </section>
      </div>
      {pay && <BayarModal inv={pay} me={me} cfg={cfg} notify={notify} onClose={() => setPay(null)} onDone={() => { setPay(null); inv.load(); kl.load(); }} />}
    </>
  );
}

// ================= Pesan sekarang =================
export function PortalPesan({ go, notify }) {
  const { rows, loading, error } = useTable('katalog', { order: 'name', asc: true });
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [cart, setCart] = useState({});
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
  const view = rows.filter((r) => (!cat || r.category === cat) && `${r.name} ${r.category}`.toLowerCase().includes(q.toLowerCase()));
  const lines = rows.filter((r) => cart[r.id] > 0);
  const jumlah = lines.reduce((a, r) => a + cart[r.id], 0);
  const total = lines.reduce((a, r) => a + cart[r.id] * parseHarga(r.price), 0);
  const setQty = (id, v) => setCart((c) => { const n = { ...c }; if (v <= 0) delete n[id]; else n[id] = v; return n; });

  async function kirim() {
    setBusy(true);
    const { error } = await supabase.rpc('buat_pesanan', { p_items: lines.map((l) => ({ item_id: l.id, qty: cart[l.id] })), p_catatan: note || null });
    setBusy(false);
    if (error) return notify(error.message, 'err');
    notify('Pesanan terkirim. Menunggu persetujuan admin.');
    setCart({}); setNote(''); setOpen(false); go('p_pesanan');
  }

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

      <div className="pgrid">
        {view.map((r) => {
          const [cls, label] = KET[r.ketersediaan] || KET.tersedia;
          const qty = cart[r.id] || 0;
          return (
            <div key={r.id} className={'pcard' + (qty ? ' in' : '')}>
              <div className="ptop">
                <span className="av" style={{ background: `hsl(${hue(r.name)} 70% 92%)`, color: `hsl(${hue(r.name)} 55% 32%)` }}>{r.name[0]?.toUpperCase()}</span>
                <div><div className="pname">{r.name}</div><span className="chip">{r.category}</span></div>
              </div>
              <div className="pprice">{rupiah(parseHarga(r.price))}</div>
              <div className="pfoot">
                <span className={'badge ' + cls}>{label}</span>
                {r.ketersediaan === 'habis'
                  ? <span className="muted small">Tidak tersedia</span>
                  : qty ? <Qty value={qty} onChange={(v) => setQty(r.id, v)} />
                  : <button className="btn sm" onClick={() => setQty(r.id, 1)}>Tambah</button>}
              </div>
            </div>
          );
        })}
      </div>
      {!view.length && <div className="emptystate"><span>{loading ? 'Memuat…' : 'Tidak ada produk.'}</span></div>}

      {jumlah > 0 && (
        <div className="cartbar">
          <span><b>{jumlah}</b> barang · <b>{rupiah(total)}</b></span>
          <button className="btn" onClick={() => setOpen(true)}>Lihat keranjang</button>
        </div>
      )}

      {open && (
        <Modal title="Keranjang pesanan" onClose={() => setOpen(false)}>
          {lines.map((l) => (
            <div className="line" key={l.id}>
              <span><b>{l.name}</b><small className="block">{rupiah(parseHarga(l.price))}</small></span>
              <span className="r"><Qty value={cart[l.id]} onChange={(v) => setQty(l.id, v)} /></span>
            </div>
          ))}
          {!lines.length && <p className="muted">Keranjang kosong.</p>}
          <div className="sumrow big"><span>Perkiraan total</span><b>{rupiah(total)}</b></div>
          <Field label="Catatan untuk penjual"><input value={note} placeholder="Opsional" onChange={(e) => setNote(e.target.value)} /></Field>
          <p className="muted small">Pesanan akan diperiksa admin. Tagihan (invoice) dibuat setelah pesanan disetujui, lalu kamu bisa membayarnya dari menu Tagihan &amp; bayar.</p>
          <div className="row end">
            <button className="btn ghost" onClick={() => setOpen(false)}>Lanjut belanja</button>
            <button className="btn" disabled={busy || !lines.length} onClick={kirim}>{busy ? 'Mengirim…' : 'Kirim pesanan'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ================= Pesanan saya =================
export function PortalPesanan({ go, notify }) {
  const { rows, load, loading, error } = useTable('pesanan', { select: '*, invoice(nomor)', limit: 200 });
  const [det, setDet] = useState(null);
  const [lines, setLines] = useState([]);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSure(false);
    if (!det) { setLines([]); return; }
    supabase.from('pesanan_item').select('*').eq('pesanan_id', det.id).order('id').then(({ data }) => setLines(data || []));
  }, [det]);

  async function batal() {
    setBusy(true);
    const { error } = await supabase.rpc('batalkan_pesanan', { p_id: det.id });
    setBusy(false);
    if (error) return notify(error.message, 'err');
    notify('Pesanan dibatalkan.'); setDet(null); load();
  }

  return (
    <>
      <ErrorNote error={error} />
      <div className="actions"><button className="btn" onClick={() => go('p_pesan')}>+ Pesan lagi</button></div>
      <div className="tablewrap"><table>
        <thead><tr><th>Nomor</th><th>Dikirim</th><th className="n">Total</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><b>{r.nomor}</b></td><td>{tgl(r.created_at)}</td><td className="n">{rupiah(r.total)}</td>
              <td><StBadge s={r.status} />{r.invoice?.nomor && <small className="block">Invoice {r.invoice.nomor}</small>}</td>
              <td className="act"><button className="btn ghost sm" onClick={() => setDet(r)}>Detail</button></td>
            </tr>
          ))}
          {!rows.length && <EmptyRow cols={5} loading={loading} text="Belum ada pesanan." />}
        </tbody>
      </table></div>

      {det && (
        <Modal title={det.nomor} onClose={() => setDet(null)}>
          <div className="meta"><span>Dikirim: <b>{tgl(det.created_at)}</b></span><StBadge s={det.status} /></div>
          {lines.map((l) => (
            <div className="line" key={l.id}><span>{l.nama} <small>× {l.qty}</small></span><b>{rupiah(l.qty * l.harga)}</b></div>
          ))}
          <div className="sumrow big"><span>Total</span><b>{rupiah(det.total)}</b></div>
          {det.catatan && <p className="muted">Catatan kamu: {det.catatan}</p>}
          {det.status === 'ditolak' && <div className="notice">Pesanan ditolak{det.catatan_admin ? `: ${det.catatan_admin}` : '.'}</div>}
          {det.status === 'disetujui' && (
            <div className="row end"><button className="btn" onClick={() => go('p_invoice')}>Lihat tagihan &amp; bayar</button></div>
          )}
          {det.status === 'menunggu' && !sure && (
            <div className="row end"><button className="btn ghost danger-t" onClick={() => setSure(true)}>Batalkan pesanan</button></div>
          )}
          {det.status === 'menunggu' && sure && (
            <div className="row end">
              <span className="muted grow">Yakin batalkan pesanan ini?</span>
              <button className="btn ghost" onClick={() => setSure(false)}>Tidak</button>
              <button className="btn danger" disabled={busy} onClick={batal}>Ya, batalkan</button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

// ================= Tagihan & bayar =================
function TagihanDetail({ inv, kl, cfg, onClose, onPay }) {
  const [lines, setLines] = useState([]);
  const [pays, setPays] = useState([]);
  useEffect(() => {
    supabase.from('invoice_item').select('*').eq('invoice_id', inv.id).order('id').then(({ data }) => setLines(data || []));
    supabase.from('pembayaran').select('*').eq('invoice_id', inv.id).order('id').then(({ data }) => setPays(data || []));
  }, [inv.id]);
  const claims = kl.filter((k) => k.invoice_id === inv.id && k.status !== 'dikonfirmasi');
  const sisa = inv.total - inv.dibayar;
  const bisaBayar = sisa - pendingOf(kl, inv.id) > 0;

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
        {pays.map((p) => (
          <div className="line" key={p.id}>
            <span>{tglD(p.tanggal)} · {p.metode}<small className="block">Nota {p.nomor_nota || '-'}</small></span>
            <span className="r"><b>{rupiah(p.jumlah)}</b><button className="btn ghost sm" onClick={() => cetakNota(p, inv, cfg)}>Cetak nota</button></span>
          </div>
        ))}
      </>)}
      {claims.length > 0 && (<>
        <h3 className="sub">Pembayaran yang kamu kirim</h3>
        {claims.map((k) => (
          <div className="line" key={k.id}>
            <span>{tglD(k.tanggal)} · {rupiah(k.jumlah)}{k.status === 'ditolak' && k.catatan_admin && <small className="block">Alasan: {k.catatan_admin}</small>}</span>
            <StBadge s={k.status} />
          </div>
        ))}
      </>)}

      <div className="row end">
        <button className="btn ghost" onClick={() => cetak(inv, lines, cfg)}>Cetak invoice</button>
        {bisaBayar && <button className="btn" onClick={onPay}>Bayar</button>}
      </div>
    </Modal>
  );
}

export function PortalInvoice({ me, notify }) {
  const inv = useTable('invoice', { select: '*, pelanggan(nama)', limit: 500 });
  const kl = useTable('pembayaran_klaim', { limit: 300 });
  const [cfg] = usePengaturan();
  const [fs, setFs] = useState('belum');
  const [det, setDet] = useState(null);
  const [pay, setPay] = useState(null);

  const view = inv.rows.filter((i) => fs === 'semua' || i.status !== 'lunas');
  const tunggakan = inv.rows.filter((i) => i.status !== 'lunas').reduce((a, i) => a + (+i.total - +i.dibayar), 0);

  return (
    <>
      <ErrorNote error={inv.error} />
      {!me?.pelanggan_id && <NoLink cfg={cfg} />}
      <div className="stats"><Stat label="Total tunggakan" value={rupiah(tunggakan)} tone={tunggakan ? 'warn' : ''} /></div>
      <div className="tabs">
        <button className={'btn ghost' + (fs === 'belum' ? ' on' : '')} onClick={() => setFs('belum')}>Belum lunas</button>
        <button className={'btn ghost' + (fs === 'semua' ? ' on' : '')} onClick={() => setFs('semua')}>Semua</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Nomor</th><th>Tanggal</th><th>Jatuh tempo</th><th className="n">Total</th><th className="n">Sisa</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {view.map((i) => {
            const pend = pendingOf(kl.rows, i.id);
            const bisa = i.total - i.dibayar - pend > 0;
            return (
              <tr key={i.id}>
                <td><b>{i.nomor}</b></td><td>{tglD(i.tanggal)}</td><td>{tglD(i.jatuh_tempo)}</td>
                <td className="n">{rupiah(i.total)}</td><td className="n">{rupiah(i.total - i.dibayar)}</td>
                <td><InvBadge i={i} />{pend > 0 && <small className="block">Menunggu konfirmasi</small>}</td>
                <td className="act">
                  <button className="btn ghost sm" onClick={() => setDet(i)}>Detail</button>
                  {bisa && <button className="btn sm" onClick={() => setPay(i)}>Bayar</button>}
                </td>
              </tr>
            );
          })}
          {!view.length && <EmptyRow cols={7} loading={inv.loading} text={fs === 'belum' ? 'Tidak ada tunggakan.' : 'Belum ada invoice.'} />}
        </tbody>
      </table></div>

      {det && <TagihanDetail inv={det} kl={kl.rows} cfg={cfg} onClose={() => setDet(null)} onPay={() => { setPay(det); setDet(null); }} />}
      {pay && <BayarModal inv={pay} me={me} cfg={cfg} notify={notify} onClose={() => setPay(null)} onDone={() => { setPay(null); inv.load(); kl.load(); }} />}
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