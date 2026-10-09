import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { EmptyRow, ErrorNote, Field, InvBadge, LineEditor, Modal, Stat, exportCSV, invStatus, logAct, parseHarga, rupiah, tglD, today, useTable, usePengaturan, INV_LABEL } from './ui';

const addDays = (d, n) => {
  const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n);
  return new Date(x - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// ================= Buat invoice =================
export function BuatInvoice({ items, reload, notify, user, onDone }) {
  const { rows: pel } = useTable('pelanggan', { order: 'nama', asc: true });
  const [cfg] = usePengaturan();
  const [f, setF] = useState({ pelanggan: '', tanggal: today(), tempo: '', diskon: 0, ppn: '', catatan: '' });
  const [lines, setLines] = useState([{ item_id: '', qty: 1, harga: '' }]);
  const [busy, setBusy] = useState(false);

  const ppn = f.ppn === '' ? +cfg.ppn_persen || 0 : +f.ppn || 0;
  const tempo = f.tempo || addDays(f.tanggal, cfg.jatuh_tempo_hari ?? 14);
  const sub = lines.reduce((a, l) => a + (+l.qty || 0) * (+l.harga || 0), 0);
  const diskon = +f.diskon || 0;
  const dpp = Math.max(sub - diskon, 0);
  const pajak = Math.round((dpp * ppn) / 100);
  const total = dpp + pajak;

  async function submit(e) {
    e.preventDefault();
    const valid = lines.filter((l) => l.item_id && +l.qty > 0);
    if (!valid.length) return notify('Tambahkan minimal satu produk.', 'err');
    for (const l of valid) {
      const it = items.find((x) => String(x.id) === String(l.item_id));
      if (it && +l.qty > it.stock) return notify(`Stok ${it.name} hanya ${it.stock}.`, 'err');
    }
    setBusy(true);
    const { error } = await supabase.rpc('buat_invoice', {
      p_pelanggan: f.pelanggan ? +f.pelanggan : null, p_tanggal: f.tanggal, p_tempo: tempo, p_diskon: diskon, p_ppn: ppn,
      p_catatan: f.catatan || null, p_user: user,
      p_items: valid.map((l) => ({ item_id: +l.item_id, qty: +l.qty, harga: +l.harga || 0 })),
    });
    setBusy(false);
    if (error) return notify(error.message, 'err');
    logAct(user, 'Buat invoice', `Total ${rupiah(total)}`);
    notify('Invoice dibuat. Stok berkurang otomatis.'); reload(); onDone();
  }

  return (
    <form className="invform" onSubmit={submit}>
      <section className="card">
        <div className="two3">
          <Field label="Pelanggan"><select value={f.pelanggan} onChange={(e) => setF({ ...f, pelanggan: e.target.value })}><option value="">Pelanggan umum</option>{pel.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}</select></Field>
          <Field label="Tanggal"><input type="date" value={f.tanggal} onChange={(e) => setF({ ...f, tanggal: e.target.value })} /></Field>
          <Field label="Jatuh tempo"><input type="date" value={tempo} onChange={(e) => setF({ ...f, tempo: e.target.value })} /></Field>
        </div>
        <h3 className="sub">Produk</h3>
        <LineEditor items={items} lines={lines} setLines={setLines} priceOf={(it) => parseHarga(it.price)} showStock />
        <Field label="Catatan"><input value={f.catatan} placeholder="Opsional" onChange={(e) => setF({ ...f, catatan: e.target.value })} /></Field>
      </section>

      <section className="card">
        <h3>Ringkasan</h3>
        <div className="sumrow"><span>Subtotal</span><b>{rupiah(sub)}</b></div>
        <Field label="Diskon (Rp)"><input type="number" min="0" value={f.diskon} onChange={(e) => setF({ ...f, diskon: e.target.value })} /></Field>
        <Field label={`PPN (%) — default ${cfg.ppn_persen || 0}`}><input type="number" min="0" step="0.5" value={f.ppn} placeholder={String(cfg.ppn_persen || 0)} onChange={(e) => setF({ ...f, ppn: e.target.value })} /></Field>
        <div className="sumrow"><span>PPN</span><b>{rupiah(pajak)}</b></div>
        <div className="sumrow big"><span>Total</span><b>{rupiah(total)}</b></div>
        <button className="btn big full" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan invoice'}</button>
        <p className="muted small">Menyimpan invoice langsung mengurangi stok produk.</p>
      </section>
    </form>
  );
}

// ================= Cetak =================
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function cetak(inv, lines, cfg) {
  const w = window.open('', '_blank');
  if (!w) return alert('Izinkan pop-up untuk mencetak.');
  const rows = lines.map((l) => `<tr><td>${esc(l.nama)}</td><td class="r">${l.qty}</td><td class="r">${rupiah(l.harga)}</td><td class="r">${rupiah(l.subtotal)}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.nomor)}</title>
<style>body{font-family:Arial,sans-serif;padding:32px;color:#111;max-width:760px;margin:auto}h1{margin:0}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}.t td{border:0;padding:4px 8px}</style></head><body>
<h1>${esc(cfg.nama_usaha)}</h1><div>${esc(cfg.alamat)} ${esc(cfg.telepon)}</div><hr>
<h2>INVOICE ${esc(inv.nomor)}</h2>
<div>Tanggal: ${tglD(inv.tanggal)} &middot; Jatuh tempo: ${tglD(inv.jatuh_tempo)}</div>
<div>Kepada: <b>${esc(inv.pelanggan?.nama || 'Pelanggan umum')}</b></div>
<table><tr><th>Produk</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Jumlah</th></tr>${rows}</table>
<table class="t"><tr><td class="r">Subtotal</td><td class="r">${rupiah(inv.subtotal)}</td></tr>
<tr><td class="r">Diskon</td><td class="r">${rupiah(inv.diskon)}</td></tr>
<tr><td class="r">PPN ${inv.ppn_persen}%</td><td class="r">${rupiah(inv.ppn)}</td></tr>
<tr><td class="r"><b>Total</b></td><td class="r"><b>${rupiah(inv.total)}</b></td></tr>
<tr><td class="r">Dibayar</td><td class="r">${rupiah(inv.dibayar)}</td></tr>
<tr><td class="r"><b>Sisa</b></td><td class="r"><b>${rupiah(inv.total - inv.dibayar)}</b></td></tr></table>
${inv.catatan ? `<p>Catatan: ${esc(inv.catatan)}</p>` : ''}</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

// ================= Modal bayar =================
export function PayModal({ inv, onClose, onDone, notify, user }) {
  const { rows: akun } = useTable('akun_kas', { order: 'nama', asc: true });
  const sisa = inv.total - inv.dibayar;
  const [f, setF] = useState({ jumlah: sisa, akun: '', metode: 'transfer', tanggal: today(), catatan: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!f.akun && akun[0]) setF((p) => ({ ...p, akun: String(akun[0].id) })); }, [akun]);

  async function submit(e) {
    e.preventDefault();
    if (!f.akun) return notify('Pilih akun kas. Buat dulu di menu Kas & bank.', 'err');
    setBusy(true);
    const { error } = await supabase.rpc('catat_pembayaran', { p_invoice: inv.id, p_jumlah: +f.jumlah, p_akun: +f.akun, p_metode: f.metode, p_tanggal: f.tanggal, p_catatan: f.catatan || null, p_user: user });
    setBusy(false);
    if (error) return notify(error.message, 'err');
    logAct(user, 'Catat pembayaran', `${inv.nomor} ${rupiah(f.jumlah)}`);
    notify('Pembayaran dicatat.'); onDone();
  }
  return (
    <Modal title={`Pembayaran ${inv.nomor}`} onClose={onClose}>
      <form className="mform" onSubmit={submit}>
        <div className="sumrow"><span>Sisa tagihan</span><b>{rupiah(sisa)}</b></div>
        <div className="two">
          <Field label="Jumlah (Rp)"><input type="number" min="1" max={sisa} required value={f.jumlah} onChange={(e) => setF({ ...f, jumlah: e.target.value })} /></Field>
          <Field label="Tanggal"><input type="date" value={f.tanggal} onChange={(e) => setF({ ...f, tanggal: e.target.value })} /></Field>
        </div>
        <div className="two">
          <Field label="Masuk ke akun"><select required value={f.akun} onChange={(e) => setF({ ...f, akun: e.target.value })}><option value="">Pilih akun</option>{akun.map((a) => <option key={a.id} value={a.id}>{a.nama}</option>)}</select></Field>
          <Field label="Metode"><select value={f.metode} onChange={(e) => setF({ ...f, metode: e.target.value })}><option value="tunai">Tunai</option><option value="transfer">Transfer</option><option value="qris">QRIS</option><option value="lainnya">Lainnya</option></select></Field>
        </div>
        <Field label="Catatan"><input value={f.catatan} onChange={(e) => setF({ ...f, catatan: e.target.value })} /></Field>
        {!akun.length && <div className="notice">Belum ada akun kas. Buat dulu di menu Kas &amp; bank.</div>}
        <div className="row end"><button type="button" className="btn ghost" onClick={onClose}>Batal</button><button className="btn" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pembayaran'}</button></div>
      </form>
    </Modal>
  );
}

// ================= Detail =================
function InvoiceDetail({ inv, cfg, onClose, onPay }) {
  const [lines, setLines] = useState([]);
  const [pays, setPays] = useState([]);
  useEffect(() => {
    supabase.from('invoice_item').select('*').eq('invoice_id', inv.id).order('id').then(({ data }) => setLines(data || []));
    supabase.from('pembayaran').select('*, akun_kas(nama)').eq('invoice_id', inv.id).order('id').then(({ data }) => setPays(data || []));
  }, [inv.id]);
  const sisa = inv.total - inv.dibayar;
  return (
    <Modal title={inv.nomor} onClose={onClose} wide>
      <div className="meta">
        <span>Pelanggan: <b>{inv.pelanggan?.nama || 'Pelanggan umum'}</b></span>
        <span>Tanggal: <b>{tglD(inv.tanggal)}</b></span>
        <span>Jatuh tempo: <b>{tglD(inv.jatuh_tempo)}</b></span>
        <InvBadge i={inv} />
      </div>
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
        <div className="sumrow"><span>Sisa</span><b>{rupiah(sisa)}</b></div>
      </div>
      {pays.length > 0 && (<>
        <h3 className="sub">Riwayat pembayaran</h3>
        {pays.map((p) => <div className="sumrow" key={p.id}><span>{tglD(p.tanggal)} · {p.metode} · {p.akun_kas?.nama || '-'}</span><b>{rupiah(p.jumlah)}</b></div>)}
      </>)}
      <div className="row end">
        <button className="btn ghost" onClick={() => cetak(inv, lines, cfg)}>Cetak</button>
        {sisa > 0 && <button className="btn" onClick={onPay}>Catat pembayaran</button>}
      </div>
    </Modal>
  );
}

// ================= Daftar invoice =================
export function DaftarInvoice({ notify, user }) {
  const { rows, load, loading, error } = useTable('invoice', { select: '*, pelanggan(nama,telepon,alamat)' });
  const [cfg] = usePengaturan();
  const [q, setQ] = useState('');
  const [fs, setFs] = useState('');
  const [det, setDet] = useState(null);
  const [pay, setPay] = useState(null);

  const view = rows.filter((i) => {
    const s = q.toLowerCase();
    if (s && !`${i.nomor} ${i.pelanggan?.nama ?? ''}`.toLowerCase().includes(s)) return false;
    return !fs || invStatus(i) === fs;
  });
  const tot = rows.reduce((a, i) => a + +i.total, 0);
  const bayar = rows.reduce((a, i) => a + +i.dibayar, 0);

  return (
    <>
      <ErrorNote error={error} />
      <div className="stats">
        <Stat label="Total tagihan" value={rupiah(tot)} />
        <Stat label="Sudah dibayar" value={rupiah(bayar)} />
        <Stat label="Belum dibayar" value={rupiah(tot - bayar)} tone="warn" />
        <Stat label="Jatuh tempo" value={rows.filter((i) => invStatus(i) === 'terlambat').length} tone="bad" />
      </div>
      <div className="filters">
        <input placeholder="Cari nomor atau pelanggan" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={fs} onChange={(e) => setFs(e.target.value)}>
          <option value="">Semua status</option>
          {Object.entries(INV_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn ghost" onClick={() => exportCSV('invoice', view.map((i) => ({ Nomor: i.nomor, Tanggal: i.tanggal, Pelanggan: i.pelanggan?.nama, Total: i.total, Dibayar: i.dibayar, Sisa: i.total - i.dibayar, Status: INV_LABEL[invStatus(i)] })))}>CSV</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Nomor</th><th>Pelanggan</th><th>Tanggal</th><th>Jatuh tempo</th><th className="n">Total</th><th className="n">Sisa</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {view.map((i) => (
            <tr key={i.id}>
              <td><b>{i.nomor}</b></td><td>{i.pelanggan?.nama || 'Umum'}</td><td>{tglD(i.tanggal)}</td><td>{tglD(i.jatuh_tempo)}</td>
              <td className="n">{rupiah(i.total)}</td><td className="n">{rupiah(i.total - i.dibayar)}</td><td><InvBadge i={i} /></td>
              <td className="act">
                <button className="btn ghost sm" onClick={() => setDet(i)}>Detail</button>
                {i.status !== 'lunas' && <button className="btn sm" onClick={() => setPay(i)}>Bayar</button>}
              </td>
            </tr>
          ))}
          {!view.length && <EmptyRow cols={8} loading={loading} text="Belum ada invoice." />}
        </tbody>
      </table></div>

      {det && <InvoiceDetail inv={det} cfg={cfg} onClose={() => setDet(null)} onPay={() => { setPay(det); setDet(null); }} />}
      {pay && <PayModal inv={pay} notify={notify} user={user} onClose={() => setPay(null)} onDone={() => { setPay(null); load(); }} />}
    </>
  );
}