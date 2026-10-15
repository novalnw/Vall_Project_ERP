import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { EmptyRow, ErrorNote, Field, Modal, Stat, exportCSV, logAct, monthStart, rupiah, saldoAkun, tglD, today, useTable } from './ui';
import { PayModal } from './Invoice';

// ================= Pembayaran =================
export function Pembayaran({ notify, user }) {
  const { rows, load, loading, error } = useTable('pembayaran', { select: '*, invoice(nomor, pelanggan(nama)), akun_kas(nama)' });
  const inv = useTable('invoice', { select: '*, pelanggan(nama)' });
  const [pick, setPick] = useState(false);
  const [sel, setSel] = useState('');
  const [pay, setPay] = useState(null);
  const open = inv.rows.filter((i) => i.status !== 'lunas');
  const bulanIni = rows.filter((r) => r.tanggal >= monthStart()).reduce((a, r) => a + +r.jumlah, 0);

  return (
    <>
      <ErrorNote error={error} />
      <div className="stats">
        <Stat label="Diterima bulan ini" value={rupiah(bulanIni)} />
        <Stat label="Total transaksi" value={rows.length} />
        <Stat label="Invoice belum lunas" value={open.length} tone="warn" />
      </div>
      <div className="filters">
        <span className="grow" />
        <button className="btn ghost" onClick={() => exportCSV('pembayaran', rows.map((r) => ({ Tanggal: r.tanggal, Invoice: r.invoice?.nomor, Pelanggan: r.invoice?.pelanggan?.nama, Akun: r.akun_kas?.nama, Metode: r.metode, Jumlah: r.jumlah })))}>CSV</button>
        <button className="btn" onClick={() => { setSel(''); setPick(true); }}>+ Catat pembayaran</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Tanggal</th><th>Invoice</th><th>Pelanggan</th><th>Akun</th><th>Metode</th><th className="n">Jumlah</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}><td>{tglD(r.tanggal)}</td><td><b>{r.invoice?.nomor}</b></td><td>{r.invoice?.pelanggan?.nama || 'Umum'}</td><td>{r.akun_kas?.nama || '-'}</td><td>{r.metode}</td><td className="n pos"><b>{rupiah(r.jumlah)}</b></td></tr>
          ))}
          {!rows.length && <EmptyRow cols={6} loading={loading} text="Belum ada pembayaran." />}
        </tbody>
      </table></div>

      {pick && (
        <Modal title="Pilih invoice" onClose={() => setPick(false)}>
          <Field label="Invoice yang belum lunas">
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">Pilih invoice</option>
              {open.map((i) => <option key={i.id} value={i.id}>{i.nomor} · {i.pelanggan?.nama || 'Umum'} · sisa {rupiah(i.total - i.dibayar)}</option>)}
            </select>
          </Field>
          <div className="row end"><button className="btn ghost" onClick={() => setPick(false)}>Batal</button>
            <button className="btn" disabled={!sel} onClick={() => { setPay(open.find((i) => String(i.id) === sel)); setPick(false); }}>Lanjut</button></div>
        </Modal>
      )}
      {pay && <PayModal inv={pay} notify={notify} user={user} onClose={() => setPay(null)} onDone={() => { setPay(null); load(); inv.load(); }} />}
    </>
  );
}

// ================= Pengeluaran =================
const KATEGORI = ['Bahan baku', 'Gaji', 'Sewa', 'Listrik & air', 'Transportasi', 'Pemasaran', 'Peralatan', 'Lainnya'];

export function Pengeluaran({ notify, ask, user }) {
  const { rows, load, loading, error } = useTable('pengeluaran', { select: '*, akun_kas(nama), supplier(nama)', order: 'tanggal' });
  const { rows: akun } = useTable('akun_kas', { order: 'nama', asc: true });
  const { rows: sup } = useTable('supplier', { order: 'nama', asc: true });
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const view = rows.filter((r) => `${r.kategori} ${r.deskripsi} ${r.supplier?.nama ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const bulan = rows.filter((r) => r.tanggal >= monthStart()).reduce((a, r) => a + +r.jumlah, 0);

  async function save(e) {
    e.preventDefault();
    const body = { tanggal: form.tanggal, kategori: form.kategori, deskripsi: form.deskripsi, jumlah: +form.jumlah, akun_id: form.akun_id ? +form.akun_id : null, supplier_id: form.supplier_id ? +form.supplier_id : null, dibuat_oleh: user };
    const { error } = await supabase.from('pengeluaran').insert(body);
    if (error) return notify(error.message, 'err');
    logAct(user, 'Catat pengeluaran', `${body.kategori} ${rupiah(body.jumlah)}`);
    notify('Pengeluaran dicatat.'); setForm(null); load();
  }
  const del = (r) => ask({
    title: 'Hapus pengeluaran?', msg: `${r.kategori}: ${rupiah(r.jumlah)} akan dihapus dan saldo kas dihitung ulang.`, okLabel: 'Hapus', danger: true,
    onOk: async () => { await supabase.from('pengeluaran').delete().eq('id', r.id); logAct(user, 'Hapus pengeluaran', `${r.kategori} ${rupiah(r.jumlah)}`); load(); },
  });

  return (
    <>
      <ErrorNote error={error} />
      <div className="stats"><Stat label="Pengeluaran bulan ini" value={rupiah(bulan)} tone="warn" /><Stat label="Jumlah catatan" value={rows.length} /></div>
      <div className="filters">
        <input placeholder="Cari kategori atau deskripsi" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn ghost" onClick={() => exportCSV('pengeluaran', view.map((r) => ({ Tanggal: r.tanggal, Kategori: r.kategori, Deskripsi: r.deskripsi, Akun: r.akun_kas?.nama, Supplier: r.supplier?.nama, Jumlah: r.jumlah })))}>CSV</button>
        <button className="btn" onClick={() => setForm({ tanggal: today(), kategori: 'Bahan baku', deskripsi: '', jumlah: '', akun_id: akun[0]?.id ?? '', supplier_id: '' })}>+ Tambah pengeluaran</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Tanggal</th><th>Kategori</th><th>Deskripsi</th><th>Akun</th><th className="n">Jumlah</th><th></th></tr></thead>
        <tbody>
          {view.map((r) => (
            <tr key={r.id}><td>{tglD(r.tanggal)}</td><td><span className="chip">{r.kategori}</span></td><td>{r.deskripsi}{r.supplier?.nama && <small className="block">{r.supplier.nama}</small>}</td><td>{r.akun_kas?.nama || '-'}</td>
              <td className="n neg"><b>{rupiah(r.jumlah)}</b></td><td className="act"><button className="btn ghost sm danger-t" onClick={() => del(r)}>Hapus</button></td></tr>
          ))}
          {!view.length && <EmptyRow cols={6} loading={loading} text="Belum ada pengeluaran." />}
        </tbody>
      </table></div>

      {form && (
        <Modal title="Tambah pengeluaran" onClose={() => setForm(null)}>
          <form className="mform" onSubmit={save}>
            <div className="two">
              <Field label="Tanggal"><input type="date" required value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} /></Field>
              <Field label="Kategori"><input list="kat" required value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })} /><datalist id="kat">{KATEGORI.map((k) => <option key={k} value={k} />)}</datalist></Field>
            </div>
            <Field label="Deskripsi"><input value={form.deskripsi} onChange={(e) => setForm({ ...form, deskripsi: e.target.value })} /></Field>
            <Field label="Jumlah (Rp)"><input type="number" min="1" required value={form.jumlah} onChange={(e) => setForm({ ...form, jumlah: e.target.value })} /></Field>
            <div className="two">
              <Field label="Dibayar dari"><select value={form.akun_id} onChange={(e) => setForm({ ...form, akun_id: e.target.value })}><option value="">Tanpa akun</option>{akun.map((a) => <option key={a.id} value={a.id}>{a.nama}</option>)}</select></Field>
              <Field label="Supplier (opsional)"><select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}><option value="">-</option>{sup.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}</select></Field>
            </div>
            <div className="row end"><button type="button" className="btn ghost" onClick={() => setForm(null)}>Batal</button><button className="btn">Simpan</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ================= Kas & bank =================
export function KasBank({ notify, user }) {
  const a = useTable('akun_kas', { order: 'id', asc: true });
  const p = useTable('pembayaran', { select: 'id, akun_id, jumlah, tanggal, invoice(nomor)' });
  const e = useTable('pengeluaran', { select: 'id, akun_id, jumlah, tanggal, kategori, deskripsi' });
  const m = useTable('kas_mutasi');
  const [fa, setFa] = useState(null);
  const [fm, setFm] = useState(null);
  const reloadAll = () => { a.load(); p.load(); e.load(); m.load(); };
  const nm = (id) => a.rows.find((x) => x.id === id)?.nama || '-';
  const total = a.rows.reduce((s, x) => s + saldoAkun(x, p.rows, e.rows, m.rows), 0);

  const mut = [
    ...p.rows.map((x) => ({ k: 'p' + x.id, tanggal: x.tanggal, akun: nm(x.akun_id), ket: 'Pembayaran ' + (x.invoice?.nomor || ''), masuk: +x.jumlah, keluar: 0 })),
    ...e.rows.map((x) => ({ k: 'e' + x.id, tanggal: x.tanggal, akun: nm(x.akun_id), ket: `${x.kategori || 'Pengeluaran'}: ${x.deskripsi || ''}`, masuk: 0, keluar: +x.jumlah })),
    ...m.rows.map((x) => ({ k: 'm' + x.id, tanggal: x.tanggal, akun: nm(x.akun_id), ket: x.keterangan || 'Mutasi manual', masuk: x.jenis === 'masuk' ? +x.jumlah : 0, keluar: x.jenis === 'keluar' ? +x.jumlah : 0 })),
  ].sort((x, y) => (x.tanggal < y.tanggal ? 1 : -1)).slice(0, 200);

  async function saveAkun(ev) {
    ev.preventDefault();
    const { error } = await supabase.from('akun_kas').insert({ nama: fa.nama, tipe: fa.tipe, saldo_awal: +fa.saldo_awal || 0 });
    if (error) return notify(error.message, 'err');
    logAct(user, 'Tambah akun kas', fa.nama); notify('Akun ditambahkan.'); setFa(null); reloadAll();
  }
  async function saveMutasi(ev) {
    ev.preventDefault();
    const { error } = await supabase.from('kas_mutasi').insert({ akun_id: +fm.akun_id, tanggal: fm.tanggal, jenis: fm.jenis, jumlah: +fm.jumlah, keterangan: fm.keterangan || null });
    if (error) return notify(error.message, 'err');
    logAct(user, 'Mutasi kas', `${fm.jenis} ${rupiah(fm.jumlah)}`); notify('Mutasi dicatat.'); setFm(null); reloadAll();
  }

  return (
    <>
      <ErrorNote error={a.error} />
      <div className="filters">
        <h3 className="grow">Total saldo: {rupiah(total)}</h3>
        <button className="btn ghost" onClick={() => setFm({ akun_id: a.rows[0]?.id ?? '', tanggal: today(), jenis: 'masuk', jumlah: '', keterangan: '' })} disabled={!a.rows.length}>Catat mutasi</button>
        <button className="btn" onClick={() => setFa({ nama: '', tipe: 'kas', saldo_awal: 0 })}>+ Tambah akun</button>
      </div>
      <div className="cards">
        {a.rows.map((x) => (
          <div key={x.id} className="stat"><span>{x.tipe === 'bank' ? 'Bank' : 'Kas'} · {x.nama}</span><b>{rupiah(saldoAkun(x, p.rows, e.rows, m.rows))}</b></div>
        ))}
        {!a.rows.length && !a.loading && <div className="notice">Belum ada akun. Tambahkan akun kas atau bank untuk mulai mencatat pembayaran.</div>}
      </div>
      <h3>Mutasi terakhir</h3>
      <div className="tablewrap"><table>
        <thead><tr><th>Tanggal</th><th>Akun</th><th>Keterangan</th><th className="n">Masuk</th><th className="n">Keluar</th></tr></thead>
        <tbody>
          {mut.map((x) => (
            <tr key={x.k}><td>{tglD(x.tanggal)}</td><td>{x.akun}</td><td>{x.ket}</td><td className="n pos">{x.masuk ? rupiah(x.masuk) : ''}</td><td className="n neg">{x.keluar ? rupiah(x.keluar) : ''}</td></tr>
          ))}
          {!mut.length && <EmptyRow cols={5} loading={a.loading} text="Belum ada mutasi." />}
        </tbody>
      </table></div>

      {fa && (
        <Modal title="Tambah akun" onClose={() => setFa(null)}>
          <form className="mform" onSubmit={saveAkun}>
            <Field label="Nama akun"><input autoFocus required placeholder="Kas toko / BCA" value={fa.nama} onChange={(e) => setFa({ ...fa, nama: e.target.value })} /></Field>
            <div className="two">
              <Field label="Tipe"><select value={fa.tipe} onChange={(e) => setFa({ ...fa, tipe: e.target.value })}><option value="kas">Kas</option><option value="bank">Bank</option></select></Field>
              <Field label="Saldo awal (Rp)"><input type="number" value={fa.saldo_awal} onChange={(e) => setFa({ ...fa, saldo_awal: e.target.value })} /></Field>
            </div>
            <div className="row end"><button type="button" className="btn ghost" onClick={() => setFa(null)}>Batal</button><button className="btn">Simpan</button></div>
          </form>
        </Modal>
      )}
      {fm && (
        <Modal title="Catat mutasi manual" onClose={() => setFm(null)}>
          <form className="mform" onSubmit={saveMutasi}>
            <div className="two">
              <Field label="Akun"><select required value={fm.akun_id} onChange={(e) => setFm({ ...fm, akun_id: e.target.value })}>{a.rows.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}</select></Field>
              <Field label="Jenis"><select value={fm.jenis} onChange={(e) => setFm({ ...fm, jenis: e.target.value })}><option value="masuk">Uang masuk</option><option value="keluar">Uang keluar</option></select></Field>
            </div>
            <div className="two">
              <Field label="Jumlah (Rp)"><input type="number" min="1" required value={fm.jumlah} onChange={(e) => setFm({ ...fm, jumlah: e.target.value })} /></Field>
              <Field label="Tanggal"><input type="date" value={fm.tanggal} onChange={(e) => setFm({ ...fm, tanggal: e.target.value })} /></Field>
            </div>
            <Field label="Keterangan"><input value={fm.keterangan} placeholder="Setoran modal, tarik tunai, dll" onChange={(e) => setFm({ ...fm, keterangan: e.target.value })} /></Field>
            <div className="row end"><button type="button" className="btn ghost" onClick={() => setFm(null)}>Batal</button><button className="btn">Simpan</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}