import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { EmptyRow, ErrorNote, Field, Modal, exportCSV, logAct, rupiah, tglD, today, useTable } from './ui';

export function Crud({ table, label, notify, ask, user }) {
  const { rows, load, loading, error } = useTable(table, { order: 'nama', asc: true });
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const view = rows.filter((r) => JSON.stringify(Object.values(r)).toLowerCase().includes(q.toLowerCase()));

  async function save(e) {
    e.preventDefault();
    const { id, created_at, ...body } = form;
    const { error } = id ? await supabase.from(table).update(body).eq('id', id) : await supabase.from(table).insert(body);
    if (error) return notify(error.message, 'err');
    logAct(user, (id ? 'Ubah ' : 'Tambah ') + label.toLowerCase(), form.nama);
    notify(label + ' disimpan.'); setForm(null); load();
  }
  const del = (r) => ask({
    title: `Hapus ${label.toLowerCase()}?`, msg: `"${r.nama}" akan dihapus permanen.`, okLabel: 'Hapus', danger: true,
    onOk: async () => {
      const { error } = await supabase.from(table).delete().eq('id', r.id);
      if (error) return notify(error.message, 'err');
      logAct(user, 'Hapus ' + label.toLowerCase(), r.nama); load();
    },
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <ErrorNote error={error} />
      <div className="filters">
        <input placeholder={`Cari ${label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn ghost" onClick={() => exportCSV(table, view.map(({ id, created_at, ...r }) => r))}>CSV</button>
        <button className="btn" onClick={() => setForm({ nama: '', telepon: '', email: '', alamat: '' })}>+ Tambah {label.toLowerCase()}</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Nama</th><th>Telepon</th><th>Email</th><th>Alamat</th><th></th></tr></thead>
        <tbody>
          {view.map((r) => (
            <tr key={r.id}>
              <td><b>{r.nama}</b></td><td>{r.telepon || '-'}</td><td>{r.email || '-'}</td><td>{r.alamat || '-'}</td>
              <td className="act">
                <button className="btn ghost sm" onClick={() => setForm(r)}>Ubah</button>
                <button className="btn ghost sm danger-t" onClick={() => del(r)}>Hapus</button>
              </td>
            </tr>
          ))}
          {!view.length && <EmptyRow cols={5} loading={loading} text={`Belum ada ${label.toLowerCase()}.`} />}
        </tbody>
      </table></div>

      {form && (
        <Modal title={(form.id ? 'Ubah ' : 'Tambah ') + label.toLowerCase()} onClose={() => setForm(null)}>
          <form className="mform" onSubmit={save}>
            <Field label="Nama"><input autoFocus required value={form.nama} onChange={set('nama')} /></Field>
            <div className="two">
              <Field label="Telepon"><input value={form.telepon || ''} onChange={set('telepon')} /></Field>
              <Field label="Email"><input type="email" value={form.email || ''} onChange={set('email')} /></Field>
            </div>
            <Field label="Alamat"><input value={form.alamat || ''} onChange={set('alamat')} /></Field>
            <div className="row end"><button type="button" className="btn ghost" onClick={() => setForm(null)}>Batal</button><button className="btn">Simpan</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

export const Pelanggan = (p) => <Crud table="pelanggan" label="Pelanggan" {...p} />;
export const Supplier = (p) => <Crud table="supplier" label="Supplier" {...p} />;

export function HargaSupplier({ items, notify, ask, user, reload }) {
  const { rows, load, loading, error } = useTable('harga_supplier', { select: '*, supplier(nama)', order: 'berlaku_sejak' });
  const { rows: sup } = useTable('supplier', { order: 'nama', asc: true });
  const [form, setForm] = useState(null);
  const nm = (id) => items.find((i) => i.id === id)?.name || '-';

  const latest = {};
  rows.forEach((r) => { const k = r.item_id + '-' + r.supplier_id; if (!latest[k]) latest[k] = r; });
  const best = {};
  Object.values(latest).forEach((r) => { if (!best[r.item_id] || +r.harga < +best[r.item_id].harga) best[r.item_id] = r; });

  async function save(e) {
    e.preventDefault();
    const body = { supplier_id: +form.supplier_id, item_id: +form.item_id, harga: +form.harga, berlaku_sejak: form.berlaku_sejak, catatan: form.catatan || null };
    const { error } = await supabase.from('harga_supplier').insert(body);
    if (error) return notify(error.message, 'err');
    if (form.hpp) await supabase.from('inventory').update({ harga_beli: body.harga }).eq('id', body.item_id);
    logAct(user, 'Tambah harga supplier', `${nm(body.item_id)} ${rupiah(body.harga)}`);
    notify('Harga supplier disimpan.'); setForm(null); load(); reload();
  }
  const del = (r) => ask({
    title: 'Hapus harga?', msg: 'Catatan harga ini akan dihapus.', okLabel: 'Hapus', danger: true,
    onOk: async () => { await supabase.from('harga_supplier').delete().eq('id', r.id); load(); },
  });

  return (
    <>
      <ErrorNote error={error} />
      <div className="filters">
        <p className="muted grow">Catat harga tiap supplier untuk membandingkan. Harga terbaru per supplier yang paling murah diberi tanda.</p>
        <button className="btn" onClick={() => setForm({ supplier_id: '', item_id: '', harga: '', berlaku_sejak: today(), catatan: '', hpp: true })}>+ Tambah harga</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Produk</th><th>Supplier</th><th className="n">Harga</th><th>Berlaku sejak</th><th>Catatan</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><b>{nm(r.item_id)}</b></td><td>{r.supplier?.nama || '-'}</td>
              <td className="n">{rupiah(r.harga)} {best[r.item_id]?.id === r.id && <span className="badge aman">Termurah</span>}</td>
              <td>{tglD(r.berlaku_sejak)}</td><td className="muted">{r.catatan || '-'}</td>
              <td className="act"><button className="btn ghost sm danger-t" onClick={() => del(r)}>Hapus</button></td>
            </tr>
          ))}
          {!rows.length && <EmptyRow cols={6} loading={loading} text="Belum ada harga supplier." />}
        </tbody>
      </table></div>

      {form && (
        <Modal title="Tambah harga supplier" onClose={() => setForm(null)}>
          <form className="mform" onSubmit={save}>
            <Field label="Supplier"><select required value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}><option value="">Pilih supplier</option>{sup.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}</select></Field>
            <Field label="Produk"><select required value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}><option value="">Pilih produk</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
            <div className="two">
              <Field label="Harga beli"><input type="number" min="0" required value={form.harga} onChange={(e) => setForm({ ...form, harga: e.target.value })} /></Field>
              <Field label="Berlaku sejak"><input type="date" value={form.berlaku_sejak} onChange={(e) => setForm({ ...form, berlaku_sejak: e.target.value })} /></Field>
            </div>
            <Field label="Catatan"><input value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} /></Field>
            <label className="chk"><input type="checkbox" checked={form.hpp} onChange={(e) => setForm({ ...form, hpp: e.target.checked })} /> Jadikan harga beli produk (dipakai untuk HPP)</label>
            <div className="row end"><button type="button" className="btn ghost" onClick={() => setForm(null)}>Batal</button><button className="btn">Simpan</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}