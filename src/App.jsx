import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient';
import Scanner from './Scanner';

// ================= Helper =================
const parseHarga = (p) => Number(String(p ?? '').replace(/[^\d]/g, '')) || 0;
const rupiah = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n || 0);
const tgl = (d) => new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const status = (i) => (i.stock <= 0 ? 'habis' : i.stock <= (i.minStock ?? 5) ? 'menipis' : 'aman');
const STATUS_LABEL = { aman: 'Aman', menipis: 'Stok menipis', habis: 'Habis' };
const hue = (s) => [...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) * 37 % 360;

function exportCSV(nama, rows) {
  if (!rows.length) return;
  const h = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [h.join(','), ...rows.map((r) => h.map((k) => esc(r[k])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
  a.download = nama + '.csv';
  a.click();
}

let audioCtx;
function beep(ok = true) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.08;
    o.start();
    o.stop(audioCtx.currentTime + (ok ? 0.08 : 0.25));
  } catch {}
}

// Buat barcode internal 13 digit (awalan 2 = pemakaian internal toko)
function genEAN13() {
  const d = '2' + Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join('');
  const sum = [...d].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  return d + ((10 - (sum % 10)) % 10);
}

const emptyForm = { id: null, name: '', category: '', barcode: '', stock: '', minStock: '', price: '' };

// ================= Ikon & Logo =================
const ICONS = {
  grid: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  box: <><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3.3 7.5L12 12.5l8.7-5" /><path d="M12 22V12.5" /></>,
  clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><path d="M9 14l2 2 4-4" /></>,
  history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  download: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M17.9 17.9A10.9 10.9 0 0112 20C5 20 1 12 1 12a18 18 0 015.1-5.9M9.9 4.2A9.1 9.1 0 0112 4c7 0 11 8 11 8a18 18 0 01-2.2 3.2" /><path d="M1 1l22 22" /></>,
  alert: <><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  layers: <><path d="M12 2l10 5-10 5L2 7l10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></>,
  coins: <><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>,
  check: <path d="M20 6L9 17l-5-5" />,
  zap: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  barcode: <path d="M3 5v14M6 5v14M10 5v14M13 5v14M17 5v14M21 5v14" />,
  camera: <><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></>,
};
function Icon({ n, s = 18 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[n]}
    </svg>
  );
}

function Logo({ size = 34, text = true }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <polygon points="20,4 35,12 20,20 5,12" fill="#C7D2FE" />
        <polygon points="5,12 20,20 20,37 5,29" fill="#4F46E5" />
        <polygon points="35,12 20,20 20,37 35,29" fill="#3730A3" />
        <polygon points="26,7.2 29,8.8 14,16.8 11,15.2" fill="#FF7A59" />
        <polygon points="11,15.2 14,16.8 14,33.8 11,32.2" fill="#FF7A59" />
      </svg>
      {text && <span className="logotext">VALL<b>Dev</b></span>}
    </span>
  );
}

const Badge = ({ s }) => <span className={'badge ' + s}>{STATUS_LABEL[s]}</span>;

function EmptyState({ icon = 'box', title, text, action }) {
  return (
    <div className="emptystate">
      <div className="eicon"><Icon n={icon} s={24} /></div>
      <b>{title}</b>
      {text && <span>{text}</span>}
      {action}
    </div>
  );
}

function Stepper({ value, onChange, placeholder }) {
  const n = value === '' || value === undefined ? null : parseInt(value);
  const base = n !== null ? n : parseInt(placeholder) || 0;
  return (
    <div className="stepper">
      <button type="button" aria-label="Kurangi" onClick={() => onChange(String(Math.max(0, base - 1)))}><Icon n="minus" s={14} /></button>
      <input type="number" min="0" value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <button type="button" aria-label="Tambah" onClick={() => onChange(String(base + 1))}><Icon n="plus" s={14} /></button>
    </div>
  );
}

// ================= Aplikasi =================
export default function App() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState('landing'); // landing | login | register | dashboard
  const [tab, setTab] = useState('ringkasan'); // ringkasan | barang | opname | riwayat
  const [theme, setTheme] = useState(() => localStorage.getItem('vall-theme') || 'light');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const [items, setItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [ready, setReady] = useState(false);

  const [toast, setToast] = useState(null);
  const [form, setForm] = useState(null);
  const [confirmBox, setConfirmBox] = useState(null);
  const [q, setQ] = useState('');
  const [fCat, setFCat] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [counts, setCounts] = useState({});
  const [onlyDiff, setOnlyDiff] = useState(false);

  // Scan barcode
  const [scanCode, setScanCode] = useState('');
  const [camera, setCamera] = useState(null); // null | 'opname' | 'form'
  const [lastScan, setLastScan] = useState(null);
  const scanRef = useRef(null);

  const notify = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('vall-theme', theme);
  }, [theme]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') { setForm(null); setConfirmBox(null); setCamera(null); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    if (lastScan) document.getElementById('row-' + lastScan.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [lastScan]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) setView('dashboard');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      if (session) setView('dashboard');
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) { fetchItems(); fetchLogs(); }
  }, [session]);

  const fetchItems = async () => {
    const { data, error } = await supabase.from('inventory').select('*').order('name');
    if (error) notify('Gagal ambil data: ' + error.message, 'err');
    else setItems(data || []);
    setReady(true);
  };
  const fetchLogs = async () => {
    const { data } = await supabase.from('opname_logs').select('*').order('created_at', { ascending: false }).limit(200);
    setLogs(data || []);
  };

  // ---------- Auth ----------
  const handleRegister = async (e) => {
    e.preventDefault();
    if (password.length < 6) return notify('Password minimal 6 karakter.', 'err');
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) return notify('Gagal daftar: ' + error.message, 'err');
    notify('Registrasi berhasil. Cek email atau langsung login.');
    setView('login');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return notify('Email atau password salah.', 'err');
    setView('dashboard');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null); setItems([]); setLogs([]); setCounts({}); setReady(false); setTab('ringkasan'); setLastScan(null);
    setView('landing');
  };

  // ---------- Barang ----------
  const handleSaveItem = async (e) => {
    e.preventDefault();
    const { id, name, category, barcode, stock, minStock, price } = form;
    if (!name || !category || stock === '' || !price) return notify('Semua field wajib diisi.', 'err');
    const payload = {
      name, category, stock: parseInt(stock), minStock: parseInt(minStock || 5), price,
      barcode: (barcode || '').trim() || null,
    };
    const { error } = id
      ? await supabase.from('inventory').update(payload).eq('id', id)
      : await supabase.from('inventory').insert([payload]);
    if (error) return notify(error.code === '23505' ? 'Barcode itu sudah dipakai barang lain.' : 'Gagal menyimpan: ' + error.message, 'err');
    notify(id ? 'Barang diperbarui.' : 'Barang ditambahkan.');
    setForm(null);
    fetchItems();
  };

  const handleDelete = (item) =>
    setConfirmBox({
      title: 'Hapus barang?',
      msg: `"${item.name}" akan dihapus permanen dan tidak bisa dikembalikan.`,
      okLabel: 'Hapus', danger: true,
      onOk: async () => {
        const { error } = await supabase.from('inventory').delete().eq('id', item.id);
        if (error) return notify('Gagal menghapus: ' + error.message, 'err');
        notify('Barang dihapus.');
        fetchItems();
      },
    });

  // ---------- Stock opname ----------
  const selisihOf = (i) => {
    const v = counts[i.id];
    return v === undefined || v === '' ? 0 : parseInt(v) - i.stock;
  };

  const doApplyOpname = async (changes) => {
    setLoading(true);
    let logFailed = false;
    for (const i of changes) {
      const fisik = parseInt(counts[i.id]);
      const { error } = await supabase.from('inventory').update({ stock: fisik }).eq('id', i.id);
      if (error) { setLoading(false); return notify(`Gagal update ${i.name}: ${error.message}`, 'err'); }
      const { error: le } = await supabase.from('opname_logs').insert({
        item_id: i.id, item_name: i.name, stok_sistem: i.stock, stok_fisik: fisik,
        selisih: fisik - i.stock, user_email: session?.user?.email,
      });
      if (le) logFailed = true;
    }
    setLoading(false);
    setCounts({}); setLastScan(null);
    notify(logFailed ? 'Stok diperbarui, tapi riwayat gagal dicatat.' : 'Opname diterapkan, stok diperbarui.', logFailed ? 'err' : 'ok');
    fetchItems(); fetchLogs();
  };

  const applyOpname = () => {
    const changes = items.filter((i) => counts[i.id] !== undefined && counts[i.id] !== '' && parseInt(counts[i.id]) !== i.stock);
    if (!changes.length) return notify('Tidak ada selisih untuk diterapkan.', 'err');
    setConfirmBox({
      title: 'Terapkan hasil opname?',
      msg: `${changes.length} barang berselisih. Stok sistem akan diganti dengan hitungan fisik dan dicatat di riwayat.`,
      okLabel: 'Terapkan',
      onOk: () => doApplyOpname(changes),
    });
  };

  // Scan barcode: stok fisik barang bertambah 1
  const handleScan = (raw) => {
    const code = String(raw || '').trim();
    if (!code) return;
    const item = items.find((i) => i.barcode && i.barcode === code);
    if (!item) { beep(false); return notify(`Barcode ${code} belum terdaftar di barang.`, 'err'); }
    beep(true);
    const next = (parseInt(counts[item.id]) || 0) + 1;
    setCounts((prev) => ({ ...prev, [item.id]: String((parseInt(prev[item.id]) || 0) + 1) }));
    setLastScan({ id: item.id, name: item.name, count: next });
    setQ(''); setOnlyDiff(false);
  };

  // ---------- Data turunan ----------
  const nama = (session?.user?.email || '').split('@')[0];
  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(), [items]);
  const nAman = items.filter((i) => status(i) === 'aman').length;
  const nMenipis = items.filter((i) => status(i) === 'menipis').length;
  const nHabis = items.filter((i) => status(i) === 'habis').length;
  const restock = items.filter((i) => status(i) !== 'aman').sort((a, b) => a.stock - b.stock);
  const totalUnit = items.reduce((a, i) => a + (i.stock || 0), 0);
  const nilai = items.reduce((a, i) => a + (i.stock || 0) * parseHarga(i.price), 0);

  const perKategori = useMemo(() => {
    const m = {};
    items.forEach((i) => { const k = i.category || 'Tanpa kategori'; m[k] = (m[k] || 0) + (i.stock || 0); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [items]);
  const maxKat = Math.max(1, ...perKategori.map(([, v]) => v));

  const total = items.length;
  const pA = total ? (nAman / total) * 100 : 0;
  const pM = total ? (nMenipis / total) * 100 : 0;
  const donutBg = total
    ? `conic-gradient(var(--ok) 0 ${pA}%, var(--warn) ${pA}% ${pA + pM}%, var(--bad) ${pA + pM}% 100%)`
    : 'var(--line)';

  const filtered = items.filter((i) => {
    const s = q.toLowerCase();
    if (s && !`${i.name} ${i.category} ${i.barcode ?? ''}`.toLowerCase().includes(s)) return false;
    if (fCat && i.category !== fCat) return false;
    if (fStatus && status(i) !== fStatus) return false;
    return true;
  });

  const opnameRows = items.filter((i) => {
    if (onlyDiff && selisihOf(i) === 0) return false;
    const s = q.toLowerCase();
    return !s || `${i.name} ${i.category} ${i.barcode ?? ''}`.toLowerCase().includes(s);
  });
  const diffCount = items.filter((i) => selisihOf(i) !== 0).length;
  const counted = items.filter((i) => counts[i.id] !== undefined && counts[i.id] !== '').length;

  // ---------- Potongan UI bersama ----------
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const ThemeBtn = (
    <button className="iconbtn" onClick={toggleTheme} aria-label="Ganti tema" title="Ganti tema">
      <Icon n={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
  const Toast = toast && (
    <div className={'toast ' + toast.type} role="status">
      <Icon n={toast.type === 'err' ? 'alert' : 'check'} s={16} /> {toast.msg}
    </div>
  );

  // ================= LANDING =================
  if (view === 'landing') {
    return (
      <div className="landing">
        <style>{CSS}</style>
        <header className="lnav">
          <Logo />
          <div className="row">
            {ThemeBtn}
            <button className="btn ghost" onClick={() => setView('login')}>Login</button>
            <button className="btn" onClick={() => setView('register')}>Daftar</button>
          </div>
        </header>

        <section className="lhero">
          <div className="lcopy">
            <h1>Stok gudang selalu cocok dengan isi rak</h1>
            <p>Catat barang, pantau stok yang menipis, dan lakukan stock opname tanpa spreadsheet. Semua tersimpan di cloud dan bisa dibuka dari HP.</p>
            <div className="row">
              <button className="btn big" onClick={() => setView('register')}>Daftar gratis</button>
              <button className="btn ghost big" onClick={() => setView('login')}>Saya sudah punya akun</button>
            </div>
          </div>

          <div className="lmock" aria-hidden="true">
            <div className="mockhead"><Logo size={22} /><span className="chip">Hari ini</span></div>
            <div className="mockstats">
              <div><b>128</b><span>Jenis barang</span></div>
              <div><b>1.940</b><span>Total unit</span></div>
              <div className="w"><b>6</b><span>Perlu restock</span></div>
            </div>
            {[['Kaos Polos', '48 pcs', 'aman'], ['Sepatu Lari', '4 pcs', 'menipis'], ['Topi Snapback', '21 pcs', 'aman'], ['Tas Ransel', '0 pcs', 'habis']].map(([n, s, st]) => (
              <div className="mockrow" key={n}>
                <span className="av" style={{ background: `hsl(${hue(n)} 70% 92%)`, color: `hsl(${hue(n)} 55% 32%)` }}>{n[0]}</span>
                <span className="mn">{n}</span><span className="ms">{s}</span><Badge s={st} />
              </div>
            ))}
            <div className="mocktoast"><Icon n="check" s={16} /> Opname selesai, 2 selisih diperbarui</div>
          </div>
        </section>

        <section className="lfeat">
          {[['zap', 'Stok real-time', 'Status aman, menipis, atau habis terlihat sekilas tanpa perlu hitung manual.'],
            ['clipboard', 'Stock opname', 'Bandingkan hitungan fisik dengan sistem. Selisih langsung terhitung dan tercatat.'],
            ['barcode', 'Scan barcode', 'Hitung stok cepat dengan alat scanner atau kamera, tanpa ketik satu per satu.'],
            ['download', 'Ekspor CSV', 'Unduh data barang dan riwayat opname kapan saja untuk laporan.']].map(([ic, t, d]) => (
            <div key={t} className="fcard"><div className="ficon"><Icon n={ic} s={20} /></div><b>{t}</b><span>{d}</span></div>
          ))}
        </section>

        <footer className="lfoot">&copy; CopyRight By VALL Devolopment</footer>
        {Toast}
      </div>
    );
  }

  // ================= LOGIN & REGISTER =================
  if (view === 'login' || view === 'register') {
    const isLogin = view === 'login';
    return (
      <div className="authwrap">
        <style>{CSS}</style>
        <aside className="authside">
          <Logo size={38} />
          <div>
            <h2>Gudang rapi, stok akurat, laporan siap.</h2>
            <ul>
              <li><Icon n="check" s={16} /> Pantau stok menipis otomatis</li>
              <li><Icon n="check" s={16} /> Stock opname dengan riwayat lengkap</li>
              <li><Icon n="check" s={16} /> Data aman di cloud, akses dari mana saja</li>
            </ul>
          </div>
          <small>&copy; 2026 VALL Devolopment</small>
        </aside>

        <main className="authmain">
          <div className="authtop">
            <button className="linkbtn" onClick={() => setView('landing')}>← Beranda</button>
            {ThemeBtn}
          </div>
          <form className="authform" onSubmit={isLogin ? handleLogin : handleRegister}>
            <span className="mlogo"><Logo size={30} /></span>
            <h1>{isLogin ? 'Selamat datang kembali' : 'Buat akun baru'}</h1>
            <p className="muted">{isLogin ? 'Masuk untuk mengelola stok gudang kamu.' : 'Cukup email dan password, langsung bisa dipakai.'}</p>
            <label className="field">Email
              <input type="email" autoComplete="email" placeholder="nama@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="field">Password
              <div className="pw">
                <input type={showPw ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder={isLogin ? 'Password kamu' : 'Minimal 6 karakter'} value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'} onClick={() => setShowPw(!showPw)}><Icon n={showPw ? 'eyeOff' : 'eye'} /></button>
              </div>
            </label>
            <button className="btn big full" disabled={loading}>{loading ? 'Memproses…' : isLogin ? 'Masuk' : 'Daftar sekarang'}</button>
            <p className="muted center">
              {isLogin ? 'Belum punya akun? ' : 'Sudah punya akun? '}
              <button type="button" className="linkbtn" onClick={() => setView(isLogin ? 'register' : 'login')}>{isLogin ? 'Daftar di sini' : 'Login di sini'}</button>
            </p>
          </form>
        </main>
        {Toast}
      </div>
    );
  }

  // ================= DASHBOARD =================
  const menu = [
    ['ringkasan', 'grid', 'Ringkasan'],
    ['barang', 'box', 'Barang'],
    ['opname', 'clipboard', 'Stock opname'],
    ['riwayat', 'history', 'Riwayat'],
  ];
  const titles = {
    ringkasan: ['Ringkasan', `Halo, ${nama}. Ini kondisi gudang hari ini.`],
    barang: ['Barang', `${items.length} barang terdaftar`],
    opname: ['Stock opname', 'Cocokkan stok fisik dengan stok sistem'],
    riwayat: ['Riwayat opname', 'Catatan semua opname yang sudah diterapkan'],
  };

  const skRows = (cols) => [1, 2, 3].map((n) => <tr key={n}><td colSpan={cols}><div className="sk" style={{ height: 20 }} /></td></tr>);

  return (
    <div className="shell">
      <style>{CSS}</style>

      <aside className="side">
        <Logo />
        <nav>
          {menu.map(([k, ic, label]) => (
            <button key={k} className={'nav' + (tab === k ? ' on' : '')} onClick={() => { setTab(k); setQ(''); }}>
              <Icon n={ic} /> <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="me">
          <div className="avatar">{(nama[0] || '?').toUpperCase()}</div>
          <div className="meinfo"><b>{nama}</b><small>{session?.user?.email}</small></div>
          <button className="iconbtn dark" onClick={handleLogout} aria-label="Logout" title="Logout"><Icon n="logout" /></button>
        </div>
      </aside>

      <main className="content">
        <div className="top">
          <div className="toptitle">
            <span className="mlogo"><Logo size={28} text={false} /></span>
            <div><h1>{titles[tab][0]}</h1><p className="muted">{titles[tab][1]}</p></div>
          </div>
          <div className="row">
            {ThemeBtn}
            <button className="iconbtn logoutm" onClick={handleLogout} aria-label="Logout"><Icon n="logout" /></button>
          </div>
        </div>

        {/* ===== RINGKASAN ===== */}
        {tab === 'ringkasan' && (
          <>
            <div className="actions">
              <button className="btn" onClick={() => { setTab('barang'); setForm(emptyForm); }}><Icon n="plus" /> Tambah barang</button>
              <button className="btn ghost" onClick={() => setTab('opname')}><Icon n="clipboard" /> Mulai opname</button>
            </div>

            <div className="stats">
              {!ready ? [1, 2, 3, 4].map((n) => <div key={n} className="sk" style={{ height: 96 }} />) : (
                <>
                  <div className="stat"><div className="sicon t1"><Icon n="box" /></div><b>{items.length}</b><span>Jenis barang</span></div>
                  <div className="stat"><div className="sicon t2"><Icon n="layers" /></div><b>{totalUnit}</b><span>Total unit di gudang</span></div>
                  <div className="stat"><div className="sicon t3"><Icon n="coins" /></div><b>{rupiah(nilai)}</b><span>Nilai persediaan</span></div>
                  <div className="stat"><div className="sicon t4"><Icon n="alert" /></div><b>{nMenipis + nHabis}</b><span>Perlu restock</span></div>
                </>
              )}
            </div>

            <div className="grid2">
              <section className="card">
                <h3>Kesehatan stok</h3>
                <div className="donutrow">
                  <div className="donut" style={{ background: donutBg }}>
                    <div className="hole"><b>{total}</b><small>barang</small></div>
                  </div>
                  <ul className="legend">
                    <li><i style={{ background: 'var(--ok)' }} />Aman <b>{nAman}</b></li>
                    <li><i style={{ background: 'var(--warn)' }} />Menipis <b>{nMenipis}</b></li>
                    <li><i style={{ background: 'var(--bad)' }} />Habis <b>{nHabis}</b></li>
                  </ul>
                </div>
              </section>

              <section className="card">
                <h3>Stok per kategori</h3>
                {perKategori.map(([k, v]) => (
                  <div key={k} className="bar">
                    <div className="barhead"><span>{k}</span><b>{v}</b></div>
                    <div className="track"><i style={{ width: (v / maxKat) * 100 + '%' }} /></div>
                  </div>
                ))}
                {ready && !perKategori.length && <p className="muted">Belum ada data barang.</p>}
              </section>

              <section className="card">
                <h3>Perlu restock</h3>
                {restock.slice(0, 6).map((i) => (
                  <div key={i.id} className="line"><span>{i.name}</span><span className="r"><b>{i.stock}</b> <small>min {i.minStock}</small> <Badge s={status(i)} /></span></div>
                ))}
                {ready && !restock.length && <p className="muted">Semua stok aman.</p>}
              </section>

              <section className="card">
                <h3>Opname terakhir</h3>
                {logs.slice(0, 5).map((l) => (
                  <div key={l.id} className="line"><span>{l.item_name}<small className="block">{tgl(l.created_at)}</small></span>
                    <b className={l.selisih < 0 ? 'neg' : 'pos'}>{l.selisih > 0 ? '+' : ''}{l.selisih}</b></div>
                ))}
                {!logs.length && <p className="muted">Belum ada opname yang diterapkan.</p>}
              </section>
            </div>
          </>
        )}

        {/* ===== BARANG ===== */}
        {tab === 'barang' && (
          <>
            <div className="filters">
              <div className="search"><Icon n="search" s={16} /><input placeholder="Cari nama, kategori, atau barcode" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <select value={fCat} onChange={(e) => setFCat(e.target.value)}>
                <option value="">Semua kategori</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                <option value="">Semua status</option>
                <option value="aman">Aman</option>
                <option value="menipis">Menipis</option>
                <option value="habis">Habis</option>
              </select>
              <button className="btn ghost" onClick={() => exportCSV('barang', filtered.map((i) => ({ Nama: i.name, Kategori: i.category, Barcode: i.barcode, Stok: i.stock, 'Stok minimum': i.minStock, Harga: i.price })))}><Icon n="download" /> CSV</button>
              <button className="btn" onClick={() => setForm(emptyForm)}><Icon n="plus" /> Tambah barang</button>
            </div>

            <div className="tablewrap">
              <table>
                <thead><tr><th>Barang</th><th>Kategori</th><th className="n">Stok</th><th className="n">Harga</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {!ready && skRows(6)}
                  {ready && filtered.map((i) => (
                    <tr key={i.id}>
                      <td><div className="prod"><span className="av" style={{ background: `hsl(${hue(i.name)} 70% 92%)`, color: `hsl(${hue(i.name)} 55% 32%)` }}>{i.name[0]?.toUpperCase()}</span><div><b>{i.name}</b>{i.barcode && <small className="block">{i.barcode}</small>}</div></div></td>
                      <td><span className="chip">{i.category}</span></td>
                      <td className="n"><b>{i.stock}</b> <small>pcs</small></td>
                      <td className="n">{rupiah(parseHarga(i.price))}</td>
                      <td><Badge s={status(i)} /></td>
                      <td className="act">
                        <button className="iconbtn sm" aria-label="Ubah" title="Ubah" onClick={() => setForm({ ...i, barcode: i.barcode ?? '', stock: String(i.stock), minStock: String(i.minStock ?? '') })}><Icon n="edit" s={15} /></button>
                        <button className="iconbtn sm bad" aria-label="Hapus" title="Hapus" onClick={() => handleDelete(i)}><Icon n="trash" s={15} /></button>
                      </td>
                    </tr>
                  ))}
                  {ready && !filtered.length && (
                    <tr><td colSpan="6">
                      {items.length ? <EmptyState icon="search" title="Tidak ada barang yang cocok" text="Coba ubah kata kunci atau filter." />
                        : <EmptyState title="Belum ada barang" text="Tambahkan barang pertama untuk mulai memantau stok." action={<button className="btn" onClick={() => setForm(emptyForm)}><Icon n="plus" /> Tambah barang</button>} />}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ===== STOCK OPNAME ===== */}
        {tab === 'opname' && (
          <>
            <section className="card opbar">
              <div className="opprog">
                <div className="barhead"><span>{counted} dari {items.length} barang sudah dihitung</span><b>{diffCount} selisih</b></div>
                <div className="track"><i style={{ width: (items.length ? (counted / items.length) * 100 : 0) + '%' }} /></div>
              </div>
              <div className="row">
                <button className="btn ghost" onClick={() => setCounts(Object.fromEntries(items.map((i) => [i.id, String(i.stock)])))}>Isi sesuai sistem</button>
                <button className="btn ghost" onClick={() => { setCounts({}); setLastScan(null); }} disabled={!counted}>Reset</button>
                <button className="btn ghost" onClick={() => exportCSV('opname', items.map((i) => ({ Nama: i.name, Kategori: i.category, Barcode: i.barcode, Sistem: i.stock, Fisik: counts[i.id] ?? '', Selisih: selisihOf(i) })))}><Icon n="download" /> CSV</button>
                <button className="btn" disabled={loading || !diffCount} onClick={applyOpname}>{loading ? 'Memproses…' : `Terapkan opname (${diffCount})`}</button>
              </div>
            </section>

            <section className="card scanbox">
              <form className="scanform" onSubmit={(e) => { e.preventDefault(); handleScan(scanCode); setScanCode(''); scanRef.current?.focus(); }}>
                <div className="search">
                  <Icon n="barcode" s={16} />
                  <input ref={scanRef} autoFocus placeholder="Scan barcode lalu Enter (alat scanner atau ketik manual)" value={scanCode} onChange={(e) => setScanCode(e.target.value)} />
                </div>
                <button type="button" className="btn ghost" onClick={() => setCamera('opname')}><Icon n="camera" /> Scan pakai kamera</button>
              </form>
              {lastScan
                ? <div className="lastscan"><Icon n="check" s={16} /> <b>{lastScan.name}</b> dihitung <b>{lastScan.count}</b></div>
                : <p className="muted">Setiap scan menambah 1 pada stok fisik. Alat scanner langsung bekerja selama kolom ini aktif.</p>}
            </section>

            <div className="filters">
              <div className="search"><Icon n="search" s={16} /><input placeholder="Cari barang" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <label className="chk"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Hanya yang berselisih</label>
            </div>

            <div className="tablewrap">
              <table>
                <thead><tr><th>Barang</th><th>Kategori</th><th className="n">Stok sistem</th><th className="n">Stok fisik</th><th className="n">Selisih</th></tr></thead>
                <tbody>
                  {!ready && skRows(5)}
                  {ready && opnameRows.map((i) => {
                    const s = selisihOf(i);
                    return (
                      <tr key={i.id} id={'row-' + i.id} className={(s !== 0 ? 'diff ' : '') + (lastScan?.id === i.id ? 'hl' : '')}>
                        <td><div className="prod"><span className="av" style={{ background: `hsl(${hue(i.name)} 70% 92%)`, color: `hsl(${hue(i.name)} 55% 32%)` }}>{i.name[0]?.toUpperCase()}</span><div><b>{i.name}</b>{i.barcode && <small className="block">{i.barcode}</small>}</div></div></td>
                        <td><span className="chip">{i.category}</span></td>
                        <td className="n">{i.stock}</td>
                        <td className="n"><div className="cell-r"><Stepper value={counts[i.id]} placeholder={String(i.stock)} onChange={(v) => setCounts({ ...counts, [i.id]: v })} /></div></td>
                        <td className={'n ' + (s < 0 ? 'neg' : s > 0 ? 'pos' : 'mut')}><b>{s > 0 ? '+' : ''}{s}</b></td>
                      </tr>
                    );
                  })}
                  {ready && !opnameRows.length && <tr><td colSpan="5"><EmptyState icon="clipboard" title="Tidak ada barang" text="Tambahkan barang dulu atau ubah filter." /></td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ===== RIWAYAT ===== */}
        {tab === 'riwayat' && (
          <>
            <div className="actions">
              <button className="btn ghost" disabled={!logs.length} onClick={() => exportCSV('riwayat-opname', logs.map((l) => ({ Waktu: tgl(l.created_at), Barang: l.item_name, Sistem: l.stok_sistem, Fisik: l.stok_fisik, Selisih: l.selisih, Petugas: l.user_email })))}><Icon n="download" /> Ekspor CSV</button>
            </div>
            <div className="tablewrap">
              <table>
                <thead><tr><th>Waktu</th><th>Barang</th><th className="n">Sistem</th><th className="n">Fisik</th><th className="n">Selisih</th><th>Petugas</th></tr></thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td>{tgl(l.created_at)}</td><td><b>{l.item_name}</b></td>
                      <td className="n">{l.stok_sistem}</td><td className="n">{l.stok_fisik}</td>
                      <td className={'n ' + (l.selisih < 0 ? 'neg' : 'pos')}><b>{l.selisih > 0 ? '+' : ''}{l.selisih}</b></td>
                      <td className="muted">{l.user_email}</td>
                    </tr>
                  ))}
                  {!logs.length && <tr><td colSpan="6"><EmptyState icon="history" title="Belum ada riwayat" text="Terapkan opname pertama kamu, hasilnya akan muncul di sini." action={<button className="btn" onClick={() => setTab('opname')}>Mulai opname</button>} /></td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* Modal tambah / ubah barang */}
      {form && (
        <div className="overlay" onMouseDown={() => setForm(null)}>
          <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={handleSaveItem}>
            <div className="mhead"><h3>{form.id ? 'Ubah barang' : 'Tambah barang'}</h3><button type="button" className="iconbtn sm" aria-label="Tutup" onClick={() => setForm(null)}>✕</button></div>
            <label className="field">Nama barang<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label className="field">Kategori
              <input list="kategori" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
              <datalist id="kategori">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="field">Barcode
              <div className="bcrow">
                <input value={form.barcode ?? ''} placeholder="Scan atau ketik" onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                <button type="button" className="iconbtn" title="Scan kamera" aria-label="Scan kamera" onClick={() => setCamera('form')}><Icon n="camera" /></button>
                <button type="button" className="iconbtn" title="Buat otomatis" aria-label="Buat barcode otomatis" onClick={() => setForm({ ...form, barcode: genEAN13() })}><Icon n="zap" /></button>
              </div>
            </label>
            <div className="two">
              <label className="field">Jumlah stok<input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required /></label>
              <label className="field">Stok minimum<input type="number" min="0" placeholder="5" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} /></label>
            </div>
            <label className="field">Harga<input placeholder="Cth: Rp 100.000" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></label>
            <div className="row end">
              <button type="button" className="btn ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn">Simpan</button>
            </div>
          </form>
        </div>
      )}

      {/* Dialog konfirmasi */}
      {confirmBox && (
        <div className="overlay" onMouseDown={() => setConfirmBox(null)}>
          <div className="modal sm" role="alertdialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className={'cicon' + (confirmBox.danger ? ' bad' : '')}><Icon n="alert" s={22} /></div>
            <h3>{confirmBox.title}</h3>
            <p className="muted">{confirmBox.msg}</p>
            <div className="row end">
              <button className="btn ghost" onClick={() => setConfirmBox(null)}>Batal</button>
              <button className={'btn' + (confirmBox.danger ? ' danger' : '')} onClick={async () => { const f = confirmBox.onOk; setConfirmBox(null); await f(); }}>{confirmBox.okLabel || 'Ya, lanjutkan'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Scanner kamera */}
      {camera && (
        <Scanner
          onClose={() => setCamera(null)}
          onDetect={(code) => {
            if (camera === 'form') { beep(true); setForm((f) => ({ ...f, barcode: code })); setCamera(null); }
            else handleScan(code);
          }}
        />
      )}
      {Toast}
    </div>
  );
}

// ================= CSS =================
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
:root{--bg:#F4F3FA;--surface:#fff;--surface2:#F8F8FC;--line:#E6E4F0;--ink:#1B1A3A;--mut:#6B6A8A;
--pri:#4F46E5;--pri-d:#3F38C4;--pri-soft:#EEEDFD;--acc:#FF7A59;
--ok:#12B886;--ok-soft:#DDF6EC;--ok-ink:#0A7A58;--warn:#F5A524;--warn-soft:#FDF0D5;--warn-ink:#8A5A00;--bad:#E5484D;--bad-soft:#FCE3E4;--bad-ink:#B3262B;
--side:#1B1A3A;--shadow:0 1px 2px rgba(27,26,58,.05),0 8px 24px rgba(27,26,58,.06)}
:root[data-theme="dark"]{--bg:#12122A;--surface:#1C1C3A;--surface2:#222246;--line:#2E2E57;--ink:#F0EFFC;--mut:#9B9ABF;
--pri:#6C6AF0;--pri-d:#8280F4;--pri-soft:#2A2A5A;--ok-soft:#0F3B31;--ok-ink:#5FE0B6;--warn-soft:#4A3510;--warn-ink:#FFD27A;--bad-soft:#4A1D22;--bad-ink:#FF9A9E;
--side:#0D0D20;--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.25)}

*{box-sizing:border-box}
html,body,#root{margin:0;padding:0;width:100%;max-width:none;min-height:100vh;display:block;text-align:left;place-items:initial}
body{background:var(--bg);color:var(--ink);font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5}
h1,h2,h3,p,ul{margin:0}ul{padding:0;list-style:none}
h1{font-size:1.6rem;font-weight:800;letter-spacing:-.02em;line-height:1.2}h3{font-size:1rem;font-weight:700;margin-bottom:14px}
button,input,select{font:inherit;color:inherit}
small{color:var(--mut)}.block{display:block}.muted,.mut{color:var(--mut)}.center{text-align:center}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.row.end{justify-content:flex-end;margin-top:4px}
:focus-visible{outline:2px solid var(--pri);outline-offset:2px}

/* Logo */
.logo{display:inline-flex;align-items:center;gap:10px}
.logotext{font-weight:800;letter-spacing:-.02em;font-size:1.15rem}.logotext b{font-weight:500;margin-left:3px;color:var(--pri)}

/* Tombol & input */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:600;padding:10px 16px;border-radius:10px;border:1px solid transparent;background:var(--pri);color:#fff;cursor:pointer;white-space:nowrap;transition:background .15s,transform .05s}
.btn:hover{background:var(--pri-d)}.btn:active{transform:translateY(1px)}.btn:disabled{opacity:.5;cursor:not-allowed}
.btn.ghost{background:transparent;color:var(--ink);border-color:var(--line)}.btn.ghost:hover{background:var(--surface2)}
.btn.danger{background:var(--bad)}.btn.danger:hover{background:#c93a3f}
.btn.big{padding:14px 24px;font-size:1rem;border-radius:12px}.btn.full{width:100%}
.iconbtn{width:38px;height:38px;border-radius:10px;border:1px solid var(--line);background:var(--surface);display:inline-grid;place-items:center;cursor:pointer;color:var(--mut);flex:none}
.iconbtn:hover{color:var(--ink);background:var(--surface2)}.iconbtn.sm{width:32px;height:32px;border-radius:8px}.iconbtn.bad:hover{color:var(--bad)}
.iconbtn.dark{background:transparent;border-color:rgba(255,255,255,.14);color:#C9C8E6}.iconbtn.dark:hover{background:rgba(255,255,255,.08);color:#fff}
.linkbtn{background:none;border:0;padding:0;color:var(--pri);font-weight:600;cursor:pointer}.linkbtn:hover{text-decoration:underline}
.field{display:flex;flex-direction:column;gap:6px;font-size:.85rem;font-weight:600;color:var(--mut)}
input,select{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface);min-width:0}
input:focus,select:focus{outline:none;border-color:var(--pri);box-shadow:0 0 0 3px rgba(79,70,229,.2)}
input::placeholder{color:var(--mut);opacity:.7}
.pw{position:relative}.pw input{padding-right:42px}.pw button{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:0;color:var(--mut);cursor:pointer;padding:6px;display:grid}

/* Badge, chip, avatar */
.badge{display:inline-block;padding:3px 10px;border-radius:99px;font-size:.76rem;font-weight:700;white-space:nowrap}
.badge.aman{background:var(--ok-soft);color:var(--ok-ink)}.badge.menipis{background:var(--warn-soft);color:var(--warn-ink)}.badge.habis{background:var(--bad-soft);color:var(--bad-ink)}
.chip{display:inline-block;padding:3px 10px;border-radius:8px;background:var(--pri-soft);color:var(--pri);font-size:.8rem;font-weight:600}
:root[data-theme="dark"] .chip{color:#B9B8FF}
.av{width:34px;height:34px;border-radius:10px;display:inline-grid;place-items:center;font-weight:800;flex:none}

/* Landing */
.landing{min-height:100vh}
.lnav{display:flex;justify-content:space-between;align-items:center;padding:18px 40px;max-width:1200px;margin:0 auto}
.lhero{max-width:1200px;margin:0 auto;padding:48px 40px 64px;display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center;
background:radial-gradient(700px 360px at 90% 0%,rgba(124,58,237,.14),transparent),radial-gradient(600px 300px at 0% 10%,rgba(79,70,229,.10),transparent)}
.lcopy h1{font-size:3rem;margin-bottom:18px;line-height:1.1}
.lcopy p{font-size:1.1rem;color:var(--mut);max-width:520px;margin-bottom:28px}
.lmock{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column;gap:12px}
.mockhead{display:flex;justify-content:space-between;align-items:center}
.mockstats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.mockstats div{background:var(--surface2);border-radius:12px;padding:12px;display:flex;flex-direction:column}
.mockstats b{font-size:1.25rem}.mockstats span{font-size:.75rem;color:var(--mut)}.mockstats .w{background:var(--warn-soft)}.mockstats .w b{color:var(--warn-ink)}
.mockrow{display:flex;align-items:center;gap:10px;padding:8px 4px;border-top:1px solid var(--line)}
.mockrow .mn{font-weight:600;flex:1}.mockrow .ms{color:var(--mut);font-size:.85rem}
.mocktoast{position:absolute;right:-12px;bottom:-18px;background:var(--ink);color:var(--bg);padding:10px 14px;border-radius:10px;display:flex;gap:8px;align-items:center;font-size:.85rem;font-weight:600;box-shadow:var(--shadow)}
.lfeat{max-width:1200px;margin:0 auto;padding:0 40px 56px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.fcard{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:8px}
.fcard span{color:var(--mut);font-size:.93rem}.ficon{width:40px;height:40px;border-radius:12px;background:var(--pri-soft);color:var(--pri);display:grid;place-items:center;margin-bottom:4px}
.lfoot{text-align:center;padding:24px;color:var(--mut);border-top:1px solid var(--line);font-size:.9rem}

/* Auth */
.authwrap{min-height:100vh;display:grid;grid-template-columns:1fr 1fr}
.authside{background:linear-gradient(155deg,#2F2D7A 0%,#1B1A3A 62%,#33205C 100%);color:#fff;padding:40px;display:flex;flex-direction:column;justify-content:space-between}
.authside .logotext b{color:#C7D2FE}.authside h2{font-size:2rem;font-weight:800;letter-spacing:-.02em;line-height:1.2;max-width:400px;margin-bottom:22px}
.authside li{display:flex;gap:10px;align-items:center;margin-bottom:12px;color:#D8D7F5}.authside li svg{color:var(--acc);flex:none}.authside small{color:#9B9ABF}
.authmain{display:flex;flex-direction:column;padding:24px 32px}
.authtop{display:flex;justify-content:space-between;align-items:center}
.authform{width:100%;max-width:400px;margin:auto;display:flex;flex-direction:column;gap:16px;padding:32px 0}
.mlogo{display:none}.authform .mlogo{display:inline-flex}

/* Dashboard */
.shell{display:grid;grid-template-columns:252px 1fr;min-height:100vh}
.side{background:var(--side);color:#fff;padding:22px 16px;display:flex;flex-direction:column;gap:26px;position:sticky;top:0;height:100vh}
.side .logo{padding:0 8px}.side .logotext b{color:#A5B4FC}
.side nav{display:flex;flex-direction:column;gap:4px;flex:1}
.nav{display:flex;align-items:center;gap:12px;background:transparent;border:0;color:#B4B3D6;padding:11px 12px;border-radius:10px;cursor:pointer;font-weight:600;text-align:left}
.nav:hover{background:rgba(255,255,255,.06);color:#fff}
.nav.on{background:rgba(124,122,255,.2);color:#fff;box-shadow:inset 3px 0 var(--acc)}
.me{display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;background:rgba(255,255,255,.05)}
.avatar{width:36px;height:36px;border-radius:50%;background:var(--acc);color:#1B1A3A;display:grid;place-items:center;font-weight:800;flex:none}
.meinfo{display:flex;flex-direction:column;min-width:0;flex:1}.meinfo b{font-size:.9rem;overflow:hidden;text-overflow:ellipsis}.meinfo small{color:#9B9ABF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.content{padding:28px 32px;min-width:0}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:22px}
.toptitle{display:flex;align-items:center;gap:12px}.toptitle .muted{font-size:.92rem;margin-top:2px}
.logoutm{display:none}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}

.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-bottom:18px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:2px;box-shadow:var(--shadow)}
.stat b{font-size:1.55rem;font-weight:800;letter-spacing:-.02em}.stat span{color:var(--mut);font-size:.88rem}
.sicon{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;margin-bottom:10px}
.t1{background:var(--pri-soft);color:var(--pri)}.t2{background:var(--ok-soft);color:var(--ok-ink)}.t3{background:#FFE9E1;color:#C2461F}.t4{background:var(--warn-soft);color:var(--warn-ink)}
:root[data-theme="dark"] .t3{background:#4A2418;color:#FFB59E}:root[data-theme="dark"] .t1{color:#B9B8FF}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;box-shadow:var(--shadow)}
.donutrow{display:flex;align-items:center;gap:24px;flex-wrap:wrap}
.donut{width:136px;height:136px;border-radius:50%;display:grid;place-items:center;flex:none}
.hole{width:96px;height:96px;border-radius:50%;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1}.hole b{font-size:1.5rem;font-weight:800}
.legend li{display:flex;align-items:center;gap:8px;margin-bottom:8px}.legend i{width:10px;height:10px;border-radius:3px;display:block}.legend b{margin-left:auto;padding-left:16px}
.bar{margin-bottom:14px}.barhead{display:flex;justify-content:space-between;font-size:.9rem;margin-bottom:6px;gap:10px}
.track{height:8px;background:var(--surface2);border-radius:99px;overflow:hidden}.track i{display:block;height:100%;background:linear-gradient(90deg,var(--pri),#8B5CF6);border-radius:99px;transition:width .3s}
.line{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}.line:last-child{border:0}.line .r{display:flex;align-items:center;gap:8px}

.filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.search{position:relative;flex:1 1 240px}.search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--mut)}.search input{padding-left:38px}
.filters select{width:auto;flex:0 1 170px}
.chk{display:flex;align-items:center;gap:8px;font-weight:600;white-space:nowrap;cursor:pointer}.chk input{width:18px;height:18px;accent-color:var(--pri)}
.tablewrap{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow-x:auto;box-shadow:var(--shadow)}
table{width:100%;border-collapse:collapse;text-align:left}
th{padding:13px 16px;color:var(--mut);font-weight:600;font-size:.82rem;background:var(--surface2);border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:12px 16px;border-bottom:1px solid var(--line);vertical-align:middle}tbody tr:last-child td{border-bottom:0}
tbody tr:hover td{background:var(--surface2)}tr.diff td{background:var(--pri-soft)}
.n{text-align:right}.act{white-space:nowrap;text-align:right}.act .iconbtn{margin-left:6px}
.prod{display:flex;align-items:center;gap:12px}
.pos{color:var(--ok-ink)}.neg{color:var(--bad-ink)}
.cell-r{display:flex;justify-content:flex-end}
.stepper{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface)}
.stepper button{width:32px;height:36px;border:0;background:var(--surface2);color:var(--mut);cursor:pointer;display:grid;place-items:center}.stepper button:hover{color:var(--pri)}
.stepper input{width:64px;border:0;border-radius:0;text-align:center;padding:8px 4px;font-weight:700;-moz-appearance:textfield}.stepper input:focus{box-shadow:none}
.stepper input::-webkit-outer-spin-button,.stepper input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.opbar{display:flex;gap:18px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-bottom:16px}.opprog{flex:1 1 260px}

.emptystate{display:flex;flex-direction:column;align-items:center;gap:6px;padding:36px 16px;text-align:center}
.emptystate span{color:var(--mut);max-width:340px;margin-bottom:8px}
.eicon{width:52px;height:52px;border-radius:16px;background:var(--pri-soft);color:var(--pri);display:grid;place-items:center;margin-bottom:6px}
.sk{background:linear-gradient(90deg,var(--surface2),var(--line),var(--surface2));background-size:200% 100%;animation:sh 1.3s infinite;border-radius:12px}
@keyframes sh{to{background-position:-200% 0}}

.overlay{position:fixed;inset:0;background:rgba(14,13,36,.6);display:grid;place-items:center;padding:16px;z-index:50}
.modal{background:var(--surface);border-radius:18px;padding:24px;width:100%;max-width:460px;display:flex;flex-direction:column;gap:14px;max-height:92vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.35)}
.modal h3{margin:0}.modal.sm{max-width:400px;align-items:flex-start}.mhead{display:flex;justify-content:space-between;align-items:center}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cicon{width:46px;height:46px;border-radius:14px;background:var(--pri-soft);color:var(--pri);display:grid;place-items:center}.cicon.bad{background:var(--bad-soft);color:var(--bad)}
.modal.sm .row.end{align-self:stretch}
.toast{position:fixed;right:20px;bottom:20px;background:var(--ink);color:var(--bg);padding:12px 16px;border-radius:12px;z-index:80;max-width:340px;display:flex;gap:10px;align-items:center;font-weight:600;font-size:.92rem;box-shadow:var(--shadow)}
.toast svg{color:var(--ok);flex:none}.toast.err{background:var(--bad);color:#fff}.toast.err svg{color:#fff}

/* Scan barcode */
.scanbox{margin-bottom:16px}
.scanform{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.scanform .search{flex:1 1 260px}
.scanbox .muted{margin-top:12px;font-size:.88rem}
.lastscan{display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--ok-soft);color:var(--ok-ink)}
tr.hl td{background:var(--warn-soft)!important}
.bcrow{display:flex;gap:8px}
.modal.scan{max-width:440px}
.reader{width:100%;min-height:220px;border-radius:12px;overflow:hidden;background:#000}
.reader video{width:100%!important;display:block}
.overlay.top{z-index:70}
.errtext{color:var(--bad-ink)}

@media(max-width:960px){
  .lhero{grid-template-columns:1fr;padding:32px 24px 56px}.lcopy h1{font-size:2.2rem}.lnav{padding:16px 24px}.lfeat{padding:0 24px 40px}.mocktoast{right:8px}
  .authwrap{grid-template-columns:1fr}.authside{display:none}.mlogo{display:inline-flex}.authform .mlogo{margin-bottom:6px}
}
@media(max-width:860px){
  .shell{grid-template-columns:1fr}
  .side{position:fixed;left:0;right:0;bottom:0;top:auto;height:auto;flex-direction:row;padding:6px 8px;gap:0;z-index:30;border-top:1px solid rgba(255,255,255,.08)}
  .side .logo,.side .me{display:none}.side nav{flex-direction:row;justify-content:space-around;gap:2px}
  .nav{flex-direction:column;gap:2px;font-size:.68rem;padding:7px 10px;align-items:center;flex:1}
  .nav.on{box-shadow:none}
  .content{padding:18px 16px 96px}.logoutm{display:inline-grid}
  .toast{bottom:84px;right:12px;left:12px;max-width:none}
  h1{font-size:1.35rem}
}
@media(prefers-reduced-motion:reduce){.sk{animation:none}.track i{transition:none}}
`;