import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { EmptyRow, ErrorNote, Field, Modal, exportCSV, logAct, useTable } from './ui';

const waLink = (tel, text) => {
  let n = String(tel || '').replace(/\D/g, '');
  if (!n) return '';
  if (n.startsWith('0')) n = '62' + n.slice(1);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
};

export default function Pelanggan({ notify, ask, user }) {
  const { rows, load, loading, error } = useTable('pelanggan', { order: 'nama', asc: true });
  const prof = useTable('profiles', { select: 'id, email, pelanggan_id', order: 'created_at', asc: true });
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [akses, setAkses] = useState(null);

  const linked = {};
  prof.rows.forEach((p) => { if (p.pelanggan_id) linked[p.pelanggan_id] = p; });
  const view = rows.filter((r) => JSON.stringify(Object.values(r)).toLowerCase().includes(q.toLowerCase()));
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    const { id, created_at, ...body } = form;
    const { error } = id ? await supabase.from('pelanggan').update(body).eq('id', id) : await supabase.from('pelanggan').insert(body);
    if (error) return notify(error.message, 'err');
    logAct(user, id ? 'Ubah pelanggan' : 'Tambah pelanggan', form.nama);
    notify('Pelanggan disimpan.'); setForm(null); load();
  }
  const del = (r) => ask({
    title: 'Hapus pelanggan?',
    msg: `"${r.nama}" akan dihapus permanen${linked[r.id] ? '. Akun loginnya tidak ikut terhapus tapi tidak lagi terhubung' : ''}.`,
    okLabel: 'Hapus', danger: true,
    onOk: async () => {
      const { error } = await supabase.from('pelanggan').delete().eq('id', r.id);
      if (error) return notify(error.message, 'err');
      logAct(user, 'Hapus pelanggan', r.nama); load(); prof.load();
    },
  });

  const url = window.location.origin;
  const pesan = akses
    ? `Halo ${akses.nama}, kamu sekarang bisa melihat tagihan, memesan produk, dan membayar secara online di ${url}\n\nCara masuk: klik Daftar, pakai email ${akses.email}, lalu buat password sendiri. Setelah itu kamu langsung bisa memesan dan membayar.`
    : '';
  const salin = () => navigator.clipboard.writeText(pesan).then(() => notify('Pesan disalin.')).catch(() => notify('Gagal menyalin.', 'err'));

  return (
    <>
      <ErrorNote error={error} />
      <div className="filters">
        <input placeholder="Cari pelanggan" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn ghost" onClick={() => exportCSV('pelanggan', view.map(({ id, created_at, ...r }) => r))}>CSV</button>
        <button className="btn" onClick={() => setForm({ nama: '', telepon: '', email: '', alamat: '' })}>+ Tambah pelanggan</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Nama</th><th>Telepon</th><th>Email</th><th>Alamat</th><th>Akses portal</th><th></th></tr></thead>
        <tbody>
          {view.map((r) => (
            <tr key={r.id}>
              <td><b>{r.nama}</b></td><td>{r.telepon || '-'}</td><td>{r.email || '-'}</td><td>{r.alamat || '-'}</td>
              <td>
                {linked[r.id] ? <span className="badge aman">Akses aktif</span>
                  : r.email ? <button className="btn ghost sm" onClick={() => setAkses(r)}>Beri akses</button>
                  : <span className="muted small">Isi email dulu</span>}
              </td>
              <td className="act">
                <button className="btn ghost sm" onClick={() => setForm(r)}>Ubah</button>
                <button className="btn ghost sm danger-t" onClick={() => del(r)}>Hapus</button>
              </td>
            </tr>
          ))}
          {!view.length && <EmptyRow cols={6} loading={loading} text="Belum ada pelanggan." />}
        </tbody>
      </table></div>

      {form && (
        <Modal title={form.id ? 'Ubah pelanggan' : 'Tambah pelanggan'} onClose={() => setForm(null)}>
          <form className="mform" onSubmit={save}>
            <Field label="Nama"><input autoFocus required value={form.nama} onChange={set('nama')} /></Field>
            <div className="two">
              <Field label="Telepon"><input value={form.telepon || ''} onChange={set('telepon')} /></Field>
              <Field label="Email (dipakai untuk akses portal)"><input type="email" value={form.email || ''} onChange={set('email')} /></Field>
            </div>
            <Field label="Alamat"><input value={form.alamat || ''} onChange={set('alamat')} /></Field>
            <div className="row end"><button type="button" className="btn ghost" onClick={() => setForm(null)}>Batal</button><button className="btn">Simpan</button></div>
          </form>
        </Modal>
      )}

      {akses && (
        <Modal title={`Beri akses portal: ${akses.nama}`} onClose={() => setAkses(null)}>
          <ol className="steps">
            <li>Pastikan email pelanggan benar: <b>{akses.email}</b></li>
            <li>Kirim pesan di bawah ini ke pelanggan.</li>
            <li>Pelanggan klik <b>Daftar</b> dengan email yang sama dan membuat password sendiri. Akunnya otomatis terhubung ke data ini.</li>
          </ol>
          <Field label="Pesan untuk pelanggan"><textarea readOnly rows="6" value={pesan} /></Field>
          <p className="muted small">Password dibuat pelanggan sendiri, jadi tidak ada yang perlu kamu simpan. Kalau &quot;Confirm email&quot; di Supabase aktif, pelanggan perlu klik link konfirmasi di emailnya dulu.</p>
          <div className="row end">
            <button className="btn ghost" onClick={salin}>Salin pesan</button>
            {akses.telepon && <a className="btn" href={waLink(akses.telepon, pesan)} target="_blank" rel="noreferrer">Kirim lewat WhatsApp</a>}
          </div>
        </Modal>
      )}
    </>
  );
}