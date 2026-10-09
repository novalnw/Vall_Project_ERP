import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { EmptyRow, ErrorNote, Field, LineEditor, Modal, exportCSV, logAct, rupiah, tglD, today, useTable } from './ui';

const PO_LABEL = { dipesan: 'Dipesan', sebagian: 'Diterima sebagian', diterima: 'Diterima', dibatalkan: 'Dibatalkan' };
const PoBadge = ({ s }) => <span className={'badge po-' + s}>{PO_LABEL[s] || s}</span>;

// ================= Purchase order =================
export function PurchaseOrder({ items, notify, ask, user }) {
  const { rows, load, loading, error } = useTable('purchase_order', { select: '*, supplier(nama)' });
  const { rows: sup } = useTable('supplier', { order: 'nama', asc: true });
  const { rows: hs } = useTable('harga_supplier', { order: 'berlaku_sejak' });
  const [form, setForm] = useState(null);
  const [lines, setLines] = useState([{ item_id: '', qty: 1, harga: '' }]);
  const [det, setDet] = useState(null);
  const [detLines, setDetLines] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!det) return;
    supabase.from('po_item').select('*').eq('po_id', det.id).order('id').then(({ data }) => setDetLines(data || []));
  }, [det]);

  const priceOf = (it) => {
    const h = hs.find((x) => String(x.supplier_id) === String(form?.supplier_id) && x.item_id === it.id); // terbaru (urut desc)
    return h ? h.harga : it.harga_beli || '';
  };
  const total = lines.reduce((a, l) => a + (+l.qty || 0) * (+l.harga || 0), 0);

  async function save(e) {
    e.preventDefault();
    const valid = lines.filter((l) => l.item_id && +l.qty > 0);
    if (!valid.length) return notify('Tambahkan minimal satu produk.', 'err');
    setBusy(true);
    const { error } = await supabase.rpc('buat_po', {
      p_supplier: +form.supplier_id, p_tanggal: form.tanggal, p_catatan: form.catatan || null, p_user: user,
      p_items: valid.map((l) => ({ item_id: +l.item_id, qty: +l.qty, harga: +l.harga || 0 })),
    });
    setBusy(false);
    if (error) return notify(error.message, 'err');
    logAct(user, 'Buat purchase order', rupiah(total));
    notify('Purchase order dibuat.'); setForm(null); load();
  }
  const batal = (po) => ask({
    title: 'Batalkan PO?', msg: `${po.nomor} akan ditandai dibatalkan.`, okLabel: 'Batalkan PO', danger: true,
    onOk: async () => { await supabase.from('purchase_order').update({ status: 'dibatalkan' }).eq('id', po.id); logAct(user, 'Batalkan PO', po.nomor); load(); },
  });

  return (
    <>
      <ErrorNote error={error} />
      <div className="filters">
        <span className="grow" />
        <button className="btn ghost" onClick={() => exportCSV('purchase-order', rows.map((r) => ({ Nomor: r.nomor, Supplier: r.supplier?.nama, Tanggal: r.tanggal, Total: r.total, Status: PO_LABEL[r.status] })))}>CSV</button>
        <button className="btn" onClick={() => { setLines([{ item_id: '', qty: 1, harga: '' }]); setForm({ supplier_id: '', tanggal: today(), catatan: '' }); }}>+ Buat PO</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Nomor</th><th>Supplier</th><th>Tanggal</th><th className="n">Total</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><b>{r.nomor}</b></td><td>{r.supplier?.nama || '-'}</td><td>{tglD(r.tanggal)}</td><td className="n">{rupiah(r.total)}</td><td><PoBadge s={r.status} /></td>
              <td className="act">
                <button className="btn ghost sm" onClick={() => setDet(r)}>Detail</button>
                {r.status === 'dipesan' && <button className="btn ghost sm danger-t" onClick={() => batal(r)}>Batalkan</button>}
              </td>
            </tr>
          ))}
          {!rows.length && <EmptyRow cols={6} loading={loading} text="Belum ada purchase order." />}
        </tbody>
      </table></div>

      {form && (
        <Modal title="Buat purchase order" onClose={() => setForm(null)} wide>
          <form className="mform" onSubmit={save}>
            <div className="two">
              <Field label="Supplier"><select required value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}><option value="">Pilih supplier</option>{sup.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}</select></Field>
              <Field label="Tanggal"><input type="date" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} /></Field>
            </div>
            <LineEditor items={items} lines={lines} setLines={setLines} priceOf={priceOf} />
            <Field label="Catatan"><input value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} /></Field>
            <div className="sumrow big"><span>Total</span><b>{rupiah(total)}</b></div>
            <div className="row end"><button type="button" className="btn ghost" onClick={() => setForm(null)}>Batal</button><button className="btn" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan PO'}</button></div>
          </form>
        </Modal>
      )}
      {det && (
        <Modal title={det.nomor} onClose={() => { setDet(null); setDetLines([]); }} wide>
          <div className="meta"><span>Supplier: <b>{det.supplier?.nama}</b></span><span>Tanggal: <b>{tglD(det.tanggal)}</b></span><PoBadge s={det.status} /></div>
          <div className="tablewrap"><table>
            <thead><tr><th>Produk</th><th className="n">Dipesan</th><th className="n">Diterima</th><th className="n">Harga</th><th className="n">Jumlah</th></tr></thead>
            <tbody>{detLines.map((l) => <tr key={l.id}><td>{l.nama}</td><td className="n">{l.qty}</td><td className="n">{l.qty_diterima}</td><td className="n">{rupiah(l.harga)}</td><td className="n">{rupiah(l.qty * l.harga)}</td></tr>)}</tbody>
          </table></div>
          <div className="sumrow big"><span>Total</span><b>{rupiah(det.total)}</b></div>
        </Modal>
      )}
    </>
  );
}

// ================= Penerimaan barang =================
export function Penerimaan({ notify, user, reload }) {
  const po = useTable('purchase_order', { select: '*, supplier(nama)' });
  const hist = useTable('penerimaan', { select: '*, purchase_order(nomor, supplier(nama))' });
  const [sel, setSel] = useState('');
  const [lines, setLines] = useState([]);
  const [qty, setQty] = useState({});
  const [cat, setCat] = useState('');
  const [busy, setBusy] = useState(false);
  const open = po.rows.filter((p) => p.status === 'dipesan' || p.status === 'sebagian');

  useEffect(() => {
    setQty({});
    if (!sel) { setLines([]); return; }
    supabase.from('po_item').select('*').eq('po_id', sel).order('id').then(({ data }) => {
      const l = data || [];
      setLines(l);
      setQty(Object.fromEntries(l.map((x) => [x.id, String(x.qty - x.qty_diterima)])));
    });
  }, [sel]);

  async function submit(e) {
    e.preventDefault();
    const items = lines.map((l) => ({ po_item_id: l.id, qty: +qty[l.id] || 0 })).filter((x) => x.qty > 0);
    if (!items.length) return notify('Isi jumlah yang diterima.', 'err');
    setBusy(true);
    const { error } = await supabase.rpc('terima_barang', { p_po: +sel, p_items: items, p_catatan: cat || null, p_user: user });
    setBusy(false);
    if (error) return notify(error.message, 'err');
    logAct(user, 'Terima barang', open.find((p) => String(p.id) === sel)?.nomor);
    notify('Barang diterima. Stok bertambah otomatis.');
    setSel(''); setCat(''); po.load(); hist.load(); reload();
  }

  return (
    <>
      <ErrorNote error={po.error} />
      <section className="card">
        <Field label="Pilih purchase order yang akan diterima">
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">Pilih PO</option>
            {open.map((p) => <option key={p.id} value={p.id}>{p.nomor} · {p.supplier?.nama || '-'} · {PO_LABEL[p.status]}</option>)}
          </select>
        </Field>
        {sel && (
          <form onSubmit={submit}>
            <div className="tablewrap" style={{ margin: '14px 0' }}><table>
              <thead><tr><th>Produk</th><th className="n">Dipesan</th><th className="n">Sudah diterima</th><th className="n">Terima sekarang</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}><td><b>{l.nama}</b></td><td className="n">{l.qty}</td><td className="n">{l.qty_diterima}</td>
                    <td className="n"><input className="mini" type="number" min="0" max={l.qty - l.qty_diterima} value={qty[l.id] ?? ''} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} /></td></tr>
                ))}
              </tbody>
            </table></div>
            <Field label="Catatan"><input value={cat} placeholder="Nomor surat jalan, kondisi barang, dll" onChange={(e) => setCat(e.target.value)} /></Field>
            <div className="row end"><button className="btn" disabled={busy}>{busy ? 'Menyimpan…' : 'Konfirmasi penerimaan'}</button></div>
          </form>
        )}
        {!sel && !open.length && !po.loading && <p className="muted" style={{ marginTop: 10 }}>Tidak ada PO yang menunggu penerimaan.</p>}
      </section>

      <h3 style={{ marginTop: 20 }}>Riwayat penerimaan</h3>
      <div className="tablewrap"><table>
        <thead><tr><th>Tanggal</th><th>PO</th><th>Supplier</th><th>Produk</th><th className="n">Qty</th><th>Catatan</th></tr></thead>
        <tbody>
          {hist.rows.map((h) => (
            <tr key={h.id}><td>{tglD(h.tanggal)}</td><td><b>{h.purchase_order?.nomor}</b></td><td>{h.purchase_order?.supplier?.nama || '-'}</td><td>{h.nama}</td><td className="n pos"><b>+{h.qty}</b></td><td className="muted">{h.catatan || '-'}</td></tr>
          ))}
          {!hist.rows.length && <EmptyRow cols={6} loading={hist.loading} text="Belum ada penerimaan." />}
        </tbody>
      </table></div>
    </>
  );
}