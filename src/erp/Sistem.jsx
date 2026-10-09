import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { EmptyRow, ErrorNote, Field, ROLES, ROLE_DESC, exportCSV, logAct, tgl, useTable, usePengaturan } from './ui';

// ================= Peran & akses =================
export function Roles({ notify, user, me }) {
  const { rows, load, loading, error } = useTable('profiles', { order: 'created_at', asc: true });
  const owner = me?.role === 'owner';

  async function ubah(r, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', r.id);
    if (error) return notify(error.message, 'err');
    logAct(user, 'Ubah peran', `${r.email} → ${ROLES[role]}`);
    notify('Peran diperbarui.'); load();
  }

  return (
    <>
      <ErrorNote error={error} />
      <p className="muted" style={{ marginBottom: 14 }}>Pengguna baru mendaftar sendiri lewat halaman Daftar, lalu pemilik usaha mengatur perannya di sini. Akun pertama otomatis menjadi pemilik.</p>
      <div className="tablewrap"><table>
        <thead><tr><th>Pengguna</th><th>Email</th><th>Peran</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><b>{r.nama || '-'}</b></td><td>{r.email}</td>
              <td>
                <select value={r.role} disabled={!owner || r.id === me?.id} onChange={(e) => ubah(r, e.target.value)} style={{ maxWidth: 200 }}>
                  {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </td>
            </tr>
          ))}
          {!rows.length && <EmptyRow cols={3} loading={loading} text="Belum ada pengguna." />}
        </tbody>
      </table></div>
      <h3 style={{ margin: '20px 0 10px' }}>Hak akses tiap peran</h3>
      <div className="cards">
        {Object.entries(ROLES).map(([k, v]) => <div className="stat" key={k}><b style={{ fontSize: '1.05rem' }}>{v}</b><span>{ROLE_DESC[k]}</span></div>)}
      </div>
    </>
  );
}

// ================= Log aktivitas =================
export function Log() {
  const { rows, loading, error } = useTable('log_aktivitas', { limit: 500 });
  const [q, setQ] = useState('');
  const view = rows.filter((r) => `${r.user_email} ${r.aksi} ${r.detail ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <ErrorNote error={error} />
      <div className="filters">
        <input placeholder="Cari pengguna atau aktivitas" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn ghost" onClick={() => exportCSV('log-aktivitas', view.map((r) => ({ Waktu: tgl(r.created_at), Pengguna: r.user_email, Aksi: r.aksi, Detail: r.detail })))}>CSV</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Waktu</th><th>Pengguna</th><th>Aktivitas</th><th>Detail</th></tr></thead>
        <tbody>
          {view.map((r) => <tr key={r.id}><td>{tgl(r.created_at)}</td><td className="muted">{r.user_email}</td><td><span className="chip">{r.aksi}</span></td><td>{r.detail || '-'}</td></tr>)}
          {!view.length && <EmptyRow cols={4} loading={loading} text="Belum ada aktivitas." />}
        </tbody>
      </table></div>
    </>
  );
}

// ================= Pengaturan =================
export function Pengaturan({ notify, user }) {
  const [cfg, reload] = usePengaturan();
  const [f, setF] = useState(cfg);
  useEffect(() => { setF(cfg); }, [cfg]);

  async function save(e) {
    e.preventDefault();
    const { error } = await supabase.from('pengaturan').upsert({
      id: 1, nama_usaha: f.nama_usaha, alamat: f.alamat, telepon: f.telepon,
      prefix_invoice: (f.prefix_invoice || 'INV').toUpperCase(), ppn_persen: +f.ppn_persen || 0, jatuh_tempo_hari: +f.jatuh_tempo_hari || 0,
    });
    if (error) return notify(error.message, 'err');
    logAct(user, 'Ubah pengaturan', f.nama_usaha); notify('Pengaturan disimpan.'); reload();
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <form className="card mform" style={{ maxWidth: 640 }} onSubmit={save}>
      <h3>Profil usaha</h3>
      <Field label="Nama usaha"><input required value={f.nama_usaha || ''} onChange={set('nama_usaha')} /></Field>
      <div className="two">
        <Field label="Telepon"><input value={f.telepon || ''} onChange={set('telepon')} /></Field>
        <Field label="Alamat"><input value={f.alamat || ''} onChange={set('alamat')} /></Field>
      </div>
      <h3>Invoice</h3>
      <div className="two3">
        <Field label="Awalan nomor"><input value={f.prefix_invoice || ''} onChange={set('prefix_invoice')} /></Field>
        <Field label="PPN default (%)"><input type="number" min="0" step="0.5" value={f.ppn_persen ?? 0} onChange={set('ppn_persen')} /></Field>
        <Field label="Jatuh tempo (hari)"><input type="number" min="0" value={f.jatuh_tempo_hari ?? 14} onChange={set('jatuh_tempo_hari')} /></Field>
      </div>
      <div className="row end"><button className="btn">Simpan pengaturan</button></div>
    </form>
  );
}