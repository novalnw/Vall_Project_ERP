import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { EmptyRow, ErrorNote, Field, Modal, Stat, logAct, rupiah, tgl, tglD, useTable, usePengaturan } from './ui';
import { cetakNota } from './nota';

export const ST_LABEL = { menunggu: 'Menunggu', disetujui: 'Disetujui', dikonfirmasi: 'Dikonfirmasi', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan' };
export const StBadge = ({ s }) => <span className={'badge st-' + s}>{ST_LABEL[s] || s}</span>;
const refresh = () => window.dispatchEvent(new Event('pending-refresh'));

// Jumlah pesanan & pembayaran yang menunggu (angka di sidebar)
export function usePending(role, tab) {
  const [n, setN] = useState({ pesanan: 0, bayar: 0 });
  const staff = ['owner', 'admin', 'kasir'].includes(role);
  useEffect(() => {
    if (!staff) return;
    let alive = true;
    const run = async () => {
      const a = await supabase.from('pesanan').select('id', { count: 'exact', head: true }).eq('status', 'menunggu');
      const b = await supabase.from('pembayaran_klaim').select('id', { count: 'exact', head: true }).eq('status', 'menunggu');
      if (alive) setN({ pesanan: a.count || 0, bayar: b.count || 0 });
    };
    run();
    const t = setInterval(run, 60000);
    window.addEventListener('pending-refresh', run);
    return () => { alive = false; clearInterval(t); window.removeEventListener('pending-refresh', run); };
  }, [staff, tab]);
  return n;
}

// ================= Pesanan masuk =================
export function PesananMasuk({ notify, user, reload }) {
  const { rows, load, loading, error } = useTable('pesanan', { select: '*, pelanggan(nama, telepon)' });
  const [fs, setFs] = useState('menunggu');
  const [det, setDet] = useState(null);
  const [lines, setLines] = useState([]);
  const [rej, setRej] = useState(false);
  const [alasan, setAlasan] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!det) { setLines([]); return; }
    supabase.from('pesanan_item').select('*').eq('pesanan_id', det.id).order('id').then(({ data }) => setLines(data || []));
  }, [det]);

  const view = rows.filter((r) => !fs || r.status === fs);
  const count = (s) => rows.filter((r) => r.status === s).length;
  const tutup = () => { setDet(null); setRej(false); setAlasan(''); };

  async function setujui() {
    setBusy(true);
    const { error } = await supabase.rpc('setujui_pesanan', { p_id: det.id, p_user: user });
    setBusy(false);
    if (error) return notify(error.message, 'err');
    logAct(user, 'Setujui pesanan', det.nomor);
    notify('Pesanan disetujui. Invoice dibuat dan stok berkurang.');
    tutup(); load(); reload(); refresh();
  }
  async function tolak(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc('tolak_pesanan', { p_id: det.id, p_alasan: alasan || null, p_user: user });
    setBusy(false);
    if (error) return notify(error.message, 'err');
    logAct(user, 'Tolak pesanan', det.nomor);
    notify('Pesanan ditolak.'); tutup(); load(); refresh();
  }

  return (
    <>
      <ErrorNote error={error} />
      <div className="stats">
        <Stat label="Menunggu persetujuan" value={count('menunggu')} tone={count('menunggu') ? 'warn' : ''} />
        <Stat label="Disetujui" value={count('disetujui')} />
        <Stat label="Ditolak" value={count('ditolak')} />
      </div>
      <div className="filters">
        <select value={fs} onChange={(e) => setFs(e.target.value)}>
          <option value="">Semua status</option>
          {Object.entries(ST_LABEL).filter(([k]) => ['menunggu', 'disetujui', 'ditolak', 'dibatalkan'].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Nomor</th><th>Pelanggan</th><th>Dikirim</th><th className="n">Total</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {view.map((r) => (
            <tr key={r.id}>
              <td><b>{r.nomor}</b></td><td>{r.pelanggan?.nama || '-'}</td><td>{tgl(r.created_at)}</td>
              <td className="n">{rupiah(r.total)}</td><td><StBadge s={r.status} /></td>
              <td className="act"><button className={'btn sm' + (r.status === 'menunggu' ? '' : ' ghost')} onClick={() => setDet(r)}>{r.status === 'menunggu' ? 'Tinjau' : 'Detail'}</button></td>
            </tr>
          ))}
          {!view.length && <EmptyRow cols={6} loading={loading} text="Tidak ada pesanan." />}
        </tbody>
      </table></div>

      {det && (
        <Modal title={det.nomor} onClose={tutup} wide>
          <div className="meta">
            <span>Pelanggan: <b>{det.pelanggan?.nama || '-'}</b></span>
            <span>Dikirim: <b>{tgl(det.created_at)}</b></span>
            <StBadge s={det.status} />
          </div>
          <div className="tablewrap"><table>
            <thead><tr><th>Produk</th><th className="n">Qty</th><th className="n">Harga</th><th className="n">Jumlah</th></tr></thead>
            <tbody>{lines.map((l) => <tr key={l.id}><td>{l.nama}</td><td className="n">{l.qty}</td><td className="n">{rupiah(l.harga)}</td><td className="n">{rupiah(l.qty * l.harga)}</td></tr>)}</tbody>
          </table></div>
          <div className="sumrow big"><span>Total</span><b>{rupiah(det.total)}</b></div>
          {det.catatan && <p className="muted">Catatan pelanggan: {det.catatan}</p>}
          {det.catatan_admin && <p className="muted">Alasan penolakan: {det.catatan_admin}</p>}

          {det.status === 'menunggu' && !rej && (
            <div className="row end">
              <button className="btn ghost danger-t" onClick={() => setRej(true)}>Tolak</button>
              <button className="btn" disabled={busy} onClick={setujui}>{busy ? 'Memproses…' : 'Setujui & buat invoice'}</button>
            </div>
          )}
          {det.status === 'menunggu' && rej && (
            <form className="mform" onSubmit={tolak}>
              <Field label="Alasan penolakan (dibaca pelanggan)"><textarea autoFocus rows="3" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. stok sedang kosong" /></Field>
              <div className="row end"><button type="button" className="btn ghost" onClick={() => setRej(false)}>Kembali</button><button className="btn danger" disabled={busy}>Tolak pesanan</button></div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

// ================= Konfirmasi bayar & nota =================
export function KonfirmasiBayar({ notify, user }) {
  const klaim = useTable('pembayaran_klaim', { select: '*, invoice(nomor, total, dibayar), pelanggan(nama)' });
  const hist = useTable('pembayaran', { select: '*, invoice(nomor, total, dibayar, pelanggan(nama))' });
  const akun = useTable('akun_kas', { order: 'nama', asc: true });
  const [cfg] = usePengaturan();
  const [tab, setTab] = useState('menunggu');
  const [q, setQ] = useState('');
  const [conf, setConf] = useState(null);
  const [akunId, setAkunId] = useState('');
  const [rej, setRej] = useState(false);
  const [alasan, setAlasan] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => { if (!akunId && akun.rows[0]) setAkunId(String(akun.rows[0].id)); }, [akun.rows]);

  const tunggu = klaim.rows.filter((k) => k.status === 'menunggu');
  const riwayat = hist.rows.filter((p) => `${p.nomor_nota ?? ''} ${p.invoice?.nomor ?? ''} ${p.invoice?.pelanggan?.nama ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const tutup = () => { setConf(null); setRej(false); setAlasan(''); };

  async function lihatBukti(path) {
    const w = window.open('', '_blank');
    const { data, error } = await supabase.storage.from('bukti').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { w?.close(); return notify('Bukti tidak bisa dibuka.', 'err'); }
    if (w) w.location = data.signedUrl; else window.location.href = data.signedUrl;
  }

  async function konfirmasi() {
    if (!akunId) return notify('Pilih akun kas tujuan. Buat dulu di menu Kas & bank.', 'err');
    setBusy(true);
    const { data: pid, error } = await supabase.rpc('konfirmasi_pembayaran', { p_klaim: conf.id, p_akun: +akunId, p_user: user });
    if (error) { setBusy(false); return notify(error.message, 'err'); }
    const { data: pay } = await supabase.from('pembayaran').select('*, invoice(nomor, total, dibayar, pelanggan(nama))').eq('id', pid).maybeSingle();
    setBusy(false);
    logAct(user, 'Konfirmasi pembayaran', `${conf.invoice?.nomor} ${rupiah(conf.jumlah)}`);
    tutup(); setDone(pay); klaim.load(); hist.load(); refresh();
  }
  async function tolak(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc('tolak_pembayaran', { p_klaim: conf.id, p_alasan: alasan || null, p_user: user });
    setBusy(false);
    if (error) return notify(error.message, 'err');
    logAct(user, 'Tolak pembayaran', conf.invoice?.nomor);
    notify('Pembayaran ditolak.'); tutup(); klaim.load(); refresh();
  }

  return (
    <>
      <ErrorNote error={klaim.error} />
      <div className="tabs">
        <button className={'btn ghost' + (tab === 'menunggu' ? ' on' : '')} onClick={() => setTab('menunggu')}>Menunggu konfirmasi ({tunggu.length})</button>
        <button className={'btn ghost' + (tab === 'riwayat' ? ' on' : '')} onClick={() => setTab('riwayat')}>Riwayat & nota</button>
      </div>

      {tab === 'menunggu' && (
        <div className="tablewrap"><table>
          <thead><tr><th>Dikirim</th><th>Pelanggan</th><th>Invoice</th><th className="n">Jumlah</th><th>Metode</th><th>Bukti</th><th></th></tr></thead>
          <tbody>
            {tunggu.map((k) => (
              <tr key={k.id}>
                <td>{tgl(k.created_at)}</td><td><b>{k.pelanggan?.nama || '-'}</b></td><td>{k.invoice?.nomor}</td>
                <td className="n"><b>{rupiah(k.jumlah)}</b></td><td>{k.metode}</td>
                <td>{k.bukti ? <button className="btn ghost sm" onClick={() => lihatBukti(k.bukti)}>Lihat</button> : <span className="muted">-</span>}</td>
                <td className="act"><button className="btn sm" onClick={() => setConf(k)}>Tinjau</button></td>
              </tr>
            ))}
            {!tunggu.length && <EmptyRow cols={7} loading={klaim.loading} text="Tidak ada pembayaran yang menunggu konfirmasi." />}
          </tbody>
        </table></div>
      )}

      {tab === 'riwayat' && (
        <>
          <div className="filters"><input placeholder="Cari nota, invoice, atau pelanggan" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="tablewrap"><table>
            <thead><tr><th>Tanggal</th><th>No. nota</th><th>Invoice</th><th>Pelanggan</th><th>Metode</th><th className="n">Jumlah</th><th></th></tr></thead>
            <tbody>
              {riwayat.map((p) => (
                <tr key={p.id}>
                  <td>{tglD(p.tanggal)}</td><td><b>{p.nomor_nota || '-'}</b></td><td>{p.invoice?.nomor}</td><td>{p.invoice?.pelanggan?.nama || 'Umum'}</td>
                  <td>{p.metode}</td><td className="n pos"><b>{rupiah(p.jumlah)}</b></td>
                  <td className="act"><button className="btn ghost sm" onClick={() => cetakNota(p, p.invoice, cfg)}>Cetak nota</button></td>
                </tr>
              ))}
              {!riwayat.length && <EmptyRow cols={7} loading={hist.loading} text="Belum ada pembayaran." />}
            </tbody>
          </table></div>
        </>
      )}

      {conf && (
        <Modal title={`Pembayaran ${conf.invoice?.nomor}`} onClose={tutup}>
          <div className="sumrow"><span>Pelanggan</span><b>{conf.pelanggan?.nama}</b></div>
          <div className="sumrow"><span>Jumlah dibayar</span><b>{rupiah(conf.jumlah)}</b></div>
          <div className="sumrow"><span>Tanggal bayar</span><span>{tglD(conf.tanggal)} · {conf.metode}</span></div>
          <div className="sumrow"><span>Sisa tagihan sebelum ini</span><span>{rupiah(conf.invoice?.total - conf.invoice?.dibayar)}</span></div>
          {conf.catatan && <p className="muted">Catatan: {conf.catatan}</p>}
          {conf.bukti
            ? <button className="btn ghost" onClick={() => lihatBukti(conf.bukti)}>Lihat bukti transfer</button>
            : <p className="muted">Pelanggan tidak melampirkan bukti.</p>}

          {!rej ? (
            <>
              <Field label="Uang masuk ke akun">
                <select value={akunId} onChange={(e) => setAkunId(e.target.value)}>
                  <option value="">Pilih akun</option>
                  {akun.rows.map((a) => <option key={a.id} value={a.id}>{a.nama}</option>)}
                </select>
              </Field>
              {!akun.rows.length && <div className="notice">Belum ada akun kas. Buat dulu di menu Kas &amp; bank.</div>}
              <div className="row end">
                <button className="btn ghost danger-t" onClick={() => setRej(true)}>Tolak</button>
                <button className="btn" disabled={busy} onClick={konfirmasi}>{busy ? 'Memproses…' : 'Konfirmasi & buat nota'}</button>
              </div>
            </>
          ) : (
            <form className="mform" onSubmit={tolak}>
              <Field label="Alasan penolakan (dibaca pelanggan)"><textarea autoFocus rows="3" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. dana belum masuk ke rekening" /></Field>
              <div className="row end"><button type="button" className="btn ghost" onClick={() => setRej(false)}>Kembali</button><button className="btn danger" disabled={busy}>Tolak pembayaran</button></div>
            </form>
          )}
        </Modal>
      )}

      {done && (
        <Modal title="Pembayaran dikonfirmasi" onClose={() => setDone(null)}>
          <div className="notice" style={{ background: 'var(--ok-soft)', color: 'var(--ok-ink)' }}>Nota <b>{done.nomor_nota}</b> sudah dibuat. Invoice {done.invoice?.nomor} sekarang {(+done.invoice?.total - +done.invoice?.dibayar) <= 0 ? 'lunas' : 'dibayar sebagian'}.</div>
          <div className="row end">
            <button className="btn ghost" onClick={() => setDone(null)}>Tutup</button>
            <button className="btn" onClick={() => cetakNota(done, done.invoice, cfg)}>Cetak nota</button>
          </div>
        </Modal>
      )}
    </>
  );
}