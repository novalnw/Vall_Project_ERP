import { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { logAct, today, usePengaturan, useTable } from './ui';

const KAT = [
  { key: 'rekap', label: 'Rekap Stock', desc: 'Tambah / perbarui produk (inventory) secara massal.' },
  { key: 'transaksi', label: 'Transaksi · Penjualan', desc: 'Import penjualan → otomatis jadi invoice & stok berkurang.' },
  { key: 'mutasi', label: 'Mutasi Stok', desc: 'Import log pergerakan stok (Masuk/Keluar/Retur/Penyesuaian) → catat ke mutasi & ubah stok.' },
  { key: 'catatan', label: 'Catatan · Pengeluaran', desc: 'Import biaya / pengeluaran ke kas.' },
];

const FIELDS = {
  rekap: [
    ['nama', 'Nama produk *', ['nama', 'produk', 'barang', 'item', 'product', 'namaproduk', 'namabarang']],
    ['kategori', 'Kategori', ['kategori', 'category', 'kat']],
    ['barcode', 'Barcode', ['barcode', 'kode', 'code', 'kodebarang']],
    ['stok', 'Stok', ['stok', 'stock', 'qty', 'jumlah', 'kuantitas']],
    ['min_stok', 'Stok minimum', ['min_stok', 'minstock', 'minimum', 'min', 'minstok', 'stokminimum']],
    ['harga_jual', 'Harga jual', ['harga_jual', 'harga', 'price', 'jual']],
    ['harga_beli', 'Harga beli', ['harga_beli', 'beli', 'hpp', 'modal', 'cost']],
  ],
  transaksi: [
    ['tanggal', 'Tanggal *', ['tanggal', 'date', 'tgl', 'waktu']],
    ['pelanggan', 'Pelanggan', ['pelanggan', 'customer', 'client']],
    ['produk', 'Produk / barang *', ['produk', 'nama', 'barang', 'item', 'product', 'nama_barang', 'namaproduk']],
    ['qty', 'Qty / jumlah *', ['qty', 'jumlah', 'kuantitas', 'stok', 'unit']],
    ['harga', 'Harga satuan', ['harga', 'price', 'harga_satuan', 'satuan']],
    ['nomor', 'No. invoice (pengelompokan)', ['nomor', 'no', 'no_invoice', 'invoice', 'faktur']],
    ['diskon', 'Diskon (Rp)', ['diskon', 'discount', 'disc']],
    ['catatan', 'Catatan', ['catatan', 'note', 'keterangan', 'ket']],
  ],
  catatan: [
    ['tanggal', 'Tanggal *', ['tanggal', 'date', 'tgl']],
    ['kategori', 'Kategori *', ['kategori', 'category', 'kat']],
    ['deskripsi', 'Deskripsi', ['deskripsi', 'keterangan', 'ket', 'catatan', 'note', 'uraian', 'isi']],
    ['jumlah', 'Jumlah (Rp) *', ['jumlah', 'nominal', 'nilai', 'biaya', 'total']],
    ['akun', 'Akun kas (opsional)', ['akun', 'akun_kas', 'kas', 'bank']],
  ],
  mutasi: [
    ['tanggal', 'Tanggal *', ['tanggal', 'date', 'tgl', 'waktu']],
    ['kode', 'Kode / barcode', ['kode', 'kodebarang', 'code']],
    ['produk', 'Nama produk', ['produk', 'nama', 'barang', 'item', 'product', 'namaproduk', 'namabarang']],
    ['jenis', 'Jenis mutasi *', ['jenis', 'tipe', 'type', 'arah']],
    ['jumlah', 'Jumlah (kg) *', ['jumlah', 'jumlahkg', 'qty', 'kuantitas', 'kg', 'unit']],
    ['nilai', 'Nilai (Rp)', ['nilai', 'nilairp', 'harga', 'rp', 'omzet']],
    ['keterangan', 'Keterangan', ['keterangan', 'ket', 'catatan', 'note', 'deskripsi', 'informasi']],
  ],
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (v) => { const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : 0; };
const str = (v) => String(v ?? '').trim();
const fmtTanggal = (v) => {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && v > 20000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) {
    const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }
  const s = str(v);
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
};
const addDays = (d, n) => {
  const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n);
  return new Date(x - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function ImportData({ user, notify }) {
  const [kat, setKat] = useState('rekap');
  const [raw, setRaw] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [file, setFile] = useState('');
  const [map, setMap] = useState({});
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [wb, setWb] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [sheet, setSheet] = useState('');

  const [cfg] = usePengaturan();
  const { rows: pel } = useTable('pelanggan', { order: 'nama', asc: true });
  const { rows: akun } = useTable('akun_kas');
  const { rows: inv, load: reloadInv } = useTable('inventory');

  const fields = FIELDS[kat];
  const byPelNama = {};
  pel.forEach((p) => { byPelNama[str(p.nama).toLowerCase()] = p.id; });

  const REQUIRED = {
    rekap: ['nama'],
    transaksi: ['tanggal', 'produk', 'qty'],
    mutasi: ['jenis', 'jumlah'],
    catatan: ['tanggal', 'kategori', 'jumlah'],
  };
  const mapKey = 'vall_import_map_' + kat;
  const applyMap = (next) => {
    setMap(next);
    try { localStorage.setItem(mapKey, JSON.stringify(next)); } catch {}
  };
  const forgetMap = () => applyMap({});
  const downloadTemplate = () => {
    const rows = [fields.map(([, label]) => label.replace(/ \*$/, ''))];
    rows.push(fields.map(([, label]) => (label.endsWith('*') ? 'contoh' : '')));
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    a.download = 'template_' + kat + '.csv';
    a.click();
  };
  const byAkunNama = {};
  akun.forEach((a) => { byAkunNama[str(a.nama).toLowerCase()] = a.id; });

  const parseSheet = (sheetName) => {
    const ws = wb && wb.Sheets[sheetName];
    if (!ws) { notify('Sheet tidak ditemukan.', 'err'); return; }
    // Baca sebagai matriks baris x kolom (bukan baris pertama = header).
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Cari baris header: baris yang paling banyak sel-nya cocok dengan
    // nama kolom yang dikenal (Kode, Nama Produk, Harga, dst).
    const allAliases = new Set();
    fields.forEach(([, , aliases]) => aliases.forEach((a) => allAliases.add(norm(a))));
    let hIdx = 0, bestScore = -1;
    rows.forEach((r, idx) => {
      let s = 0;
      r.forEach((c) => { if (c != null && allAliases.has(norm(c))) s++; });
      if (s > bestScore) { bestScore = s; hIdx = idx; }
    });
    if (bestScore < 2) hIdx = 0;

    const head = rows[hIdx] || [];
    const headers = head.map((h) => (h == null ? '' : str(h)));

    const dataRows = [];
    for (let i = hIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r.some((c) => c != null && str(c) !== '')) continue;
      const obj = {};
      headers.forEach((h, j) => { if (h && !(h in obj)) obj[h] = r[j] ?? null; });
      dataRows.push(obj);
    }

    if (!dataRows.length) { notify('Tidak ada baris data setelah header.', 'err'); return; }

    const h = Object.keys(dataRows[0]);
    setHeaders(h); setRaw(dataRows);
    const auto = {};
    fields.forEach(([fld, , aliases]) => {
      const score = (kn) => {
        let s = -1;
        for (const a of aliases) {
          const an = norm(a);
          if (!an) continue;
          if (an === kn) s = Math.max(s, 1000 + an.length);
          else if (an.length >= 5 && (kn.includes(an) || an.includes(kn))) s = Math.max(s, an.length);
        }
        return s;
      };
      let best = '', bestS = -1;
      h.forEach((k) => { const sc = score(norm(k)); if (sc > bestS) { bestS = sc; best = k; } });
      if (bestS >= 5) auto[fld] = best;
    });
    // Gabungkan pemetaan tersimpan (dipelajari dari file sebelumnya) di atas auto-detect.
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(mapKey) || '{}') || {}; } catch {}
    const merged = { ...auto };
    Object.entries(saved).forEach(([fld, hdr]) => { if (h.includes(hdr)) merged[fld] = hdr; });
    applyMap(merged);
    notify(`Termuat ${dataRows.length} baris dari sheet "${sheetName}".`);
  };

  function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setReport(null);
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls', 'tsv'].includes(ext)) { notify('File harus .csv atau .xlsx/.xls.', 'err'); return; }
    (async () => {
      const buf = await f.arrayBuffer();
      let book;
      try { book = XLSX.read(buf, { type: 'array' }); }
      catch { notify('Gagal membaca file. Pastikan format benar.', 'err'); return; }
      setWb(book); setSheets(book.SheetNames);
      const first = book.SheetNames[0];
      setSheet(first); setFile(f.name);
      parseSheet(first);
    })();
  }

  const preview = raw.slice(0, 6);

  async function prosesRekap() {
    const byBarcode = {}; const byNama = {};
    inv.forEach((i) => { if (i.barcode) byBarcode[str(i.barcode)] = i; byNama[str(i.name).toLowerCase()] = i; });
    const get = (r, f) => (map[f] ? r[map[f]] : null);
    let ok = 0; const errs = [];
    for (const r of raw) {
      const nama = str(get(r, 'nama'));
      if (!nama) { errs.push('baris dengan nama kosong'); continue; }
      const bc = str(get(r, 'barcode'));
      const existing = (bc && byBarcode[bc]) || byNama[nama.toLowerCase()];
      const payload = {
        name: nama,
        category: str(get(r, 'kategori')) || 'Umum',
        barcode: bc || null,
        stock: Math.max(0, num(get(r, 'stok'))),
        minStock: Math.max(0, num(get(r, 'min_stok')) || 5),
        price: get(r, 'harga_jual') != null ? String(get(r, 'harga_jual')) : '',
        harga_beli: get(r, 'harga_beli') != null ? String(get(r, 'harga_beli')) : null,
      };
      let res;
      try { res = existing ? await supabase.from('inventory').update(payload).eq('id', existing.id) : await supabase.from('inventory').insert([payload]); }
      catch (ex) { res = { error: { message: String(ex?.message || ex) } }; }
      if (res.error) errs.push(existing ? `update ${nama}: ${res.error.message}` : `insert ${nama}: ${res.error.message}`);
      else ok++;
    }
    return { ok, errs };
  }

  async function prosesTransaksi() {
    const byNama = {}; const byBarcode = {};
    inv.forEach((i) => { if (i.barcode) byBarcode[str(i.barcode)] = i; byNama[str(i.name).toLowerCase()] = i; });
    const get = (r, f) => (map[f] ? r[map[f]] : null);

    // Kalau tidak ada kolom "Nomor" yang dipetakan, tiap baris dianggap
    // satu invoice tersendiri (biar satu baris gagal tidak membatalkan
    // seluruh batch).
    const groups = {};
    raw.forEach((r, i) => {
      const no = map['nomor'] ? str(get(r, 'nomor')) : '';
      const key = no || ('row' + i);
      (groups[key] = groups[key] || []).push(r);
    });

    const entries = Object.entries(groups);
    let ok = 0; const errs = []; let idx = 0;

    const processGroup = async () => {
      while (idx < entries.length) {
        const [no, g] = entries[idx++];
        try {
          const tgl = fmtTanggal(get(g[0], 'tanggal')) || today();
          const tempo = addDays(tgl, cfg.jatuh_tempo_hari || 14);
          const pelNama = str(get(g[0], 'pelanggan'));
          const pelId = pelNama ? byPelNama[pelNama.toLowerCase()] : null;
          const diskon = num(get(g[0], 'diskon'));
          const cat = str(get(g[0], 'catatan')) || null;
          const items = []; let fail = null;
          for (const r of g) {
            const nm = str(get(r, 'produk'));
            if (!nm) { fail = 'ada kolom produk kosong'; break; }
            const it = byNama[nm.toLowerCase()] || byBarcode[nm];
            if (!it) { fail = `produk tidak ditemukan: ${nm}`; break; }
            const qty = num(get(r, 'qty')); const harga = num(get(r, 'harga'));
            if (qty <= 0) { fail = `qty <= 0 untuk ${nm}`; break; }
            items.push({ item_id: it.id, qty, harga });
          }
          if (fail) { errs.push(`${no}: ${fail}`); continue; }
          let rpc;
          try { rpc = await supabase.rpc('buat_invoice', { p_pelanggan: pelId, p_tanggal: tgl, p_tempo: tempo, p_diskon: diskon, p_ppn: +(cfg.ppn_persen || 0), p_catatan: cat, p_user: user, p_items: items }); }
          catch (ex) { rpc = { error: { message: String(ex?.message || ex) } }; }
          if (rpc.error) errs.push(`${no}: ${rpc.error.message}`); else ok++;
        } catch (ex) {
          errs.push(`${no}: ${String(ex?.message || ex)}`);
        }
      }
    };

    const workers = Math.min(6, Math.max(1, entries.length));
    await Promise.all(Array.from({ length: workers }, processGroup));
    return { ok, errs };
  }

  async function prosesMutasi() {
    const byBarcode = {}; const byNama = {};
    inv.forEach((i) => { if (i.barcode) byBarcode[str(i.barcode)] = i; byNama[str(i.name).toLowerCase()] = i; });
    const get = (r, f) => (map[f] ? r[map[f]] : null);
    const resolve = (r) => {
      const kode = str(get(r, 'kode')); const nm = str(get(r, 'produk'));
      return (kode && byBarcode[kode]) || (kode && byNama[kode.toLowerCase()])
        || (nm && byNama[nm.toLowerCase()]) || (nm && byBarcode[nm]) || null;
    };
    const balances = {}; const out = []; const errs = [];
    for (const r of raw) {
      const it = resolve(r);
      if (!it) { errs.push(`produk tidak ditemukan: ${str(get(r, 'produk')) || str(get(r, 'kode'))}`); continue; }
      const jenisRaw = str(get(r, 'jenis')).toLowerCase();
      const qtyRaw = num(get(r, 'jumlah'));
      let jenis, qtySigned;
      if (jenisRaw.includes('masuk')) { jenis = 'penerimaan'; qtySigned = Math.abs(qtyRaw); }
      else if (jenisRaw.includes('keluar')) { jenis = 'keluar'; qtySigned = -Math.abs(qtyRaw); }
      else if (jenisRaw.includes('retur')) { jenis = 'retur'; qtySigned = Math.abs(qtyRaw); }
      else if (jenisRaw.includes('penyesuaian')) { jenis = 'penyesuaian'; qtySigned = qtyRaw; }
      else { errs.push(`jenis mutasi tidak dikenali: ${str(get(r, 'jenis'))}`); continue; }
      if (qtySigned === 0) { errs.push(`jumlah 0 untuk ${it.name}`); continue; }
      const cur = balances[it.id] ?? it.stock;
      const baru = cur + qtySigned;
      if (baru < 0) { errs.push(`stok tidak bisa negatif untuk ${it.name} (sisa ${cur})`); continue; }
      balances[it.id] = baru;
      const ref = str(get(r, 'keterangan')) || (get(r, 'nilai') != null ? 'Nilai Rp ' + num(get(r, 'nilai')) : null);
      out.push({ item_id: it.id, item_name: it.name, jenis, qty: qtySigned, saldo: baru, ref: ref || null, dibuat_oleh: user });
    }

    // Perbarui stok produk sekali per produk (paralel).
    const updRes = await Promise.all(Object.entries(balances).map(([id, stock]) =>
      supabase.from('inventory').update({ stock }).eq('id', +id)
        .then(({ error }) => ({ id, error }))
        .catch((ex) => ({ id, error: { message: String(ex?.message || ex) } }))
    ));
    updRes.forEach(({ id, error }) => { if (error) errs.push(`update produk #${id}: ${error.message}`); });

    let ok = 0;
    if (out.length) {
      let ins;
      try { ins = await supabase.from('stok_mutasi').insert(out); }
      catch (ex) { ins = { error: { message: String(ex?.message || ex) } }; }
      if (ins.error) errs.push(`simpan mutasi: ${ins.error.message}`);
      else ok = out.length;
    }
    return { ok, errs };
  }

  async function prosesCatatan() {
    const get = (r, f) => (map[f] ? r[map[f]] : null);
    const out = []; const errs = [];
    for (const r of raw) {
      const jumlah = num(get(r, 'jumlah'));
      if (jumlah <= 0) { errs.push('baris jumlah <= 0'); continue; }
      const akunNama = str(get(r, 'akun'));
      out.push({
        tanggal: fmtTanggal(get(r, 'tanggal')) || today(),
        kategori: str(get(r, 'kategori')) || 'Lainnya',
        deskripsi: str(get(r, 'deskripsi')),
        jumlah,
        akun_id: akunNama ? (byAkunNama[akunNama.toLowerCase()] || null) : null,
        dibuat_oleh: user,
      });
    }
    let ok = 0;
    if (out.length) {
      let ins;
      try { ins = await supabase.from('pengeluaran').insert(out); }
      catch (ex) { ins = { error: { message: String(ex?.message || ex) } }; }
      if (ins.error) errs.push(`simpan pengeluaran: ${ins.error.message}`);
      else ok = out.length;
    }
    return { ok, errs };
  }

  async function exec() {
    if (!raw.length) { notify('Pilih file dulu.', 'err'); return; }
    const miss = REQUIRED[kat].filter((f) => !map[f]);
    if (kat === 'mutasi' && !map.kode && !map.produk) miss.push('kode/nama produk');
    if (miss.length) {
      notify('Kolom wajib belum dipetakan: ' + [...new Set(miss)].join(', ') + ' — periksa "Petakan kolom".', 'err');
      return;
    }
    setBusy(true); setReport(null);
    let res;
    try {
      if (kat === 'rekap') res = await prosesRekap();
      else if (kat === 'transaksi') res = await prosesTransaksi();
      else if (kat === 'mutasi') res = await prosesMutasi();
      else res = await prosesCatatan();
    } catch (ex) {
      res = { ok: 0, errs: [String(ex?.message || ex)] };
    } finally {
      setBusy(false);
    }
    if (res.ok) logAct(user, 'Import data', `${kat} ${res.ok} baris`);
    if (res.errs.length) notify(`Selesai: ${res.ok} sukses, ${res.errs.length} gagal.`, 'err');
    else notify(`Import selesai: ${res.ok} sukses.`);
    setReport({ ...res, label: KAT.find((k) => k.key === kat).label });
    reloadInv();
  }

  return (
    <>
      <div className="seg">
        {KAT.map((k) => (
          <button key={k.key} className={kat === k.key ? 'on' : ''} onClick={() => { setKat(k.key); setRaw([]); setHeaders([]); setFile(''); setReport(null); setMap({}); }}>
            {k.label}
          </button>
        ))}
      </div>
      <p className="muted">{KAT.find((k) => k.key === kat).desc}</p>

      <section className="card">
        <label className="updrop">
          <input type="file" accept=".csv,.xlsx,.xls,.tsv" onChange={onFile} />
          <b>{file || 'Klik / taruh file CSV atau Excel di sini'}</b>
          <span className="muted">Header terdeteksi otomatis. Kolom opsional boleh dikosongkan.</span>
        </label>
        {sheets.length > 1 && (
          <div className="mapgrid" style={{ marginTop: 14 }}>
            <label className="field">Pilih sheet
              <select value={sheet} onChange={(e) => { const v = e.target.value; setSheet(v); parseSheet(v); }}>
                {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
        )}
      </section>

      {headers.length > 0 && (
        <>
          <section className="card">
            <div className="actions">
              <h3 className="grow">Petakan kolom</h3>
              <button className="btn ghost" onClick={downloadTemplate}>Unduh template</button>
              <button className="btn ghost" onClick={forgetMap}>Lupakan pemetaan</button>
            </div>
            <div className="mapgrid">
              {fields.map(([fld, label]) => (
                <label key={fld} className="field">
                  {label}
                  <select value={map[fld] || ''} onChange={(e) => applyMap({ ...map, [fld]: e.target.value })}>
                    <option value="">— (kosong)</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="card">
            <h3>Pratinjau ({raw.length} baris)</h3>
            <div className="tablewrap"><table>
              <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>{headers.map((h) => <td key={h}>{r[h] == null ? '' : String(r[h])}</td>)}</tr>
                ))}
              </tbody>
            </table></div>
          </section>

          <div className="row end">
            <button className="btn" disabled={busy || !raw.length} onClick={exec}>{busy ? 'Memproses…' : 'Jalankan import'}</button>
          </div>
        </>
      )}

      {report && (
        <section className="card">
          <h3>Hasil import · {report.label}</h3>
          <div className="stats">
            <div className="stat"><b>{report.ok}</b><span>Sukses</span></div>
            <div className="stat"><b>{report.errs.length}</b><span>Gagal</span></div>
          </div>
          {report.errs.length > 0 && (
            <ul className="erlist">
              {report.errs.slice(0, 15).map((m, i) => <li key={i}>{m}</li>)}
              {report.errs.length > 15 && <li>… dan {report.errs.length - 15} lagi</li>}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
