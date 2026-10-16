import { useEffect, useState } from 'react';
import './public.css';

function Mark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <polygon points="20,4 35,12 20,20 5,12" fill="#0000" />
      <polygon points="5,12 20,20 20,37 5,29" fill="#2F6B4F" />
      <polygon points="35,12 20,20 20,37 35,29" fill="#1F4A36" />
      <polygon points="26,7.2 29,8.8 14,16.8 11,15.2" fill="#C2410C" />
      <polygon points="11,15.2 14,16.8 14,33.8 11,32.2" fill="#C2410C" />
    </svg>
  );
}

function Brand({ dark, size = 30 }) {
  return (
    <span className={'pb-brand' + (dark ? ' on-dark' : '')}>
      <Mark size={size} />
      <span>VALL<i>Dev</i></span>
    </span>
  );
}

const STEPS = [
  ['01', 'Pelanggan memesan', 'Pilih produk dan jumlah dari HP, lalu kirim pesanan.'],
  ['02', 'Admin menyetujui', 'Pesanan diperiksa. Setelah disetujui, invoice dibuat dan stok berkurang sendiri.'],
  ['03', 'Pelanggan membayar', 'Transfer atau QRIS, lalu unggah bukti pembayaran.'],
  ['04', 'Nota keluar', 'Admin mengonfirmasi, saldo kas bertambah, dan nota siap dicetak.'],
];

const ISI = [
  ['Stok dan opname', 'Hitung fisik dengan scanner atau kamera, selisih langsung tercatat.'],
  ['Invoice dan piutang', 'Tagihan, jatuh tempo, dan pembayaran sebagian.'],
  ['Pembelian', 'Purchase order, penerimaan barang, dan harga tiap supplier.'],
  ['Kas dan laba rugi', 'Saldo per akun, pengeluaran, dan laporan per periode.'],
  ['Portal pelanggan', 'Pelanggan melihat tunggakan, memesan, dan membayar sendiri.'],
  ['Peran dan akses', 'Pemilik, admin, kasir, gudang, dan pelanggan punya batas masing-masing.'],
];

const TICK = [
  'Stok masuk +24 pcs',
  'Invoice INV-2610-0012 lunas',
  'Pesanan baru menunggu persetujuan',
  'Opname selesai, 2 selisih diperbarui',
  'Nota NT-2610-0007 dicetak',
  'Stok menipis: Tas Kecil',
  'Pembayaran dikonfirmasi',
];

function Landing({ go, theme, toggleTheme }) {
  return (
    <div className="pub" data-theme={theme}>
      <header className="pb-nav">
        <Brand />
        <nav>
          <button type="button" className="pb-theme-btn" onClick={toggleTheme} aria-label="Ganti tema" title="Ganti tema">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button type="button" className="pb-link" onClick={() => go('login')}>Masuk</button>
          <button type="button" className="pb-btn solid sm" onClick={() => go('register')}>Daftar</button>
        </nav>
      </header>

      <section className="pb-hero">
        <div>
          <p className="pb-kicker">Sistem stok, tagihan, dan kas</p>
          <h1>Buku stok dan tagihan, <em>tanpa kertas yang tercecer.</em></h1>
          <p className="pb-lead">
            VALLDev membantu usaha kecil mencatat barang masuk dan keluar, membuat invoice, menerima pembayaran,
            sampai melihat laba rugi. Pelanggan bisa memesan dan membayar sendiri lewat HP.
          </p>
          <div className="pb-cta">
            <button type="button" className="pb-btn solid" onClick={() => go('register')}>Buat akun</button>
            <button type="button" className="pb-btn line" onClick={() => go('login')}>Saya sudah punya akun</button>
          </div>
          <p className="pb-note">Akun baru otomatis menjadi akun pelanggan. Peran staf diatur oleh pemilik usaha.</p>
        </div>

        <figure className="pb-nota-wrap" aria-hidden="true">
          <div className="pb-nota">
            <div className="pb-nota-head"><b>Toko Contoh</b><span>NT-2610-0001</span></div>
            <div className="pb-nota-meta">13 Okt 2026 · Transfer</div>
            <ul>
              <li style={{ '--d': 0 }}><span>Kaos Polos x2</span><span>96.000</span></li>
              <li style={{ '--d': 1 }}><span>Topi Snapback x1</span><span>55.000</span></li>
              <li style={{ '--d': 2 }}><span>Tas Kecil x1</span><span>23.000</span></li>
            </ul>
            <div className="pb-nota-total" style={{ '--d': 3 }}><span>Total</span><span>Rp 174.000</span></div>
            <div className="pb-stamp">LUNAS</div>
          </div>
          <figcaption>Contoh tampilan nota</figcaption>
        </figure>
      </section>

      <div className="pb-ticker" aria-hidden="true">
        <div className="pb-track">
          {[...TICK, ...TICK, ...TICK, ...TICK].map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </div>

      <section className="pb-sec">
        <p className="pb-label">Alur</p>
        <h2>Dari pesanan sampai nota</h2>
        <ol className="pb-steps">
          {STEPS.map(([n, t, d], i) => (
            <li key={n} style={{ '--i': i }}><span>{n}</span><h3>{t}</h3><p>{d}</p></li>
          ))}
        </ol>
      </section>

      <section className="pb-sec">
        <p className="pb-label">Isi sistem</p>
        <h2>Yang sudah ada di dalamnya</h2>
        <ul className="pb-isi">
          {ISI.map(([t, d]) => (
            <li key={t}><b>{t}</b><span>{d}</span></li>
          ))}
        </ul>
      </section>

      <footer className="pb-foot">
        <span>&copy; 2026 VALL Development</span>
        <span>Sidoarjo</span>
      </footer>
    </div>
  );
}

const COPY = {
  login: {
    title: 'Masuk', sub: 'Pakai email dan password akunmu.', btn: 'Masuk', busy: 'Memproses…',
    side: 'Lanjutkan dari tempat terakhir.',
    points: ['Lihat stok, tagihan, dan pesanan terbaru', 'Bayar dan unggah bukti dari HP', 'Cetak nota kapan saja'],
  },
  register: {
    title: 'Buat akun', sub: 'Cukup email dan password.', btn: 'Daftar', busy: 'Memproses…',
    side: 'Mulai dengan satu akun.',
    points: ['Akun baru berperan sebagai pelanggan', 'Peran staf diberikan oleh pemilik usaha', 'Password dibuat sendiri dan tidak pernah dilihat siapa pun'],
  },
  forgot: {
    title: 'Lupa password?', sub: 'Masukkan email akunmu, nanti kami kirim tautan untuk membuat password baru.',
    btn: 'Kirim tautan', busy: 'Mengirim…',
    side: 'Atur ulang password.',
    points: ['Masukkan email akunmu', 'Kami kirim tautan untuk membuat password baru', 'Tautannya berlaku sebentar dan hanya sekali pakai'],
  },
  reset: {
    title: 'Password baru', sub: 'Buat password baru untuk akunmu.', btn: 'Simpan password', busy: 'Menyimpan…',
    side: 'Satu langkah lagi.',
    points: ['Pilih password baru minimal 6 karakter', 'Setelah disimpan, kamu langsung masuk', 'Data akunmu tidak berubah'],
  },
};

function Auth({ p, theme, toggleTheme }) {
  const { view, go } = p;
  const c = COPY[view];
  const isReset = view === 'reset';
  const showEmail = !isReset;
  const showPw = view === 'login' || view === 'register' || isReset;
  const submit = { login: p.onLogin, register: p.onRegister, forgot: p.onForgot, reset: p.onReset }[view];
  const pwValue = isReset ? p.newPw : p.password;
  const setPwValue = isReset ? p.setNewPw : p.setPassword;
  const back = isReset ? 'dashboard' : view === 'forgot' ? 'login' : 'landing';
  const backLabel = view === 'forgot' ? '← Kembali ke masuk' : isReset ? '← Kembali' : '← Beranda';

  return (
    <div className="pub pb-auth" data-theme={theme}>
      <aside className="pb-side">
        <Brand dark size={34} />
        <div>
          <h2>{c.side}</h2>
          <ol>
            {c.points.map((t, i) => (
              <li key={t}><span>{String(i + 1).padStart(2, '0')}</span>{t}</li>
            ))}
          </ol>
        </div>
        <small>&copy; 2026 VALL Development · Sidoarjo</small>
      </aside>

      <main className="pb-main">
        <div className="pb-topbar-auth">
          <button type="button" className="pb-back" onClick={() => go(back)}>{backLabel}</button>
          <button type="button" className="pb-theme-btn" onClick={toggleTheme} aria-label="Ganti tema" title="Ganti tema">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        <form className="pb-form" onSubmit={submit}>
          <div className="pb-m-brand"><Brand /></div>
          <div>
            <h1>{c.title}</h1>
            <p className="pb-sub">{c.sub}</p>
          </div>

          {showEmail && (
            <div className="pb-lab">
              <label htmlFor="pb-email">Email</label>
              <input id="pb-email" type="email" autoComplete="email" placeholder="nama@email.com"
                value={p.email} onChange={(e) => p.setEmail(e.target.value)} required />
            </div>
          )}

          {showPw && (
            <div className="pb-lab">
              <label htmlFor="pb-pw">{isReset ? 'Password baru' : 'Password'}</label>
              <div className="pb-pw">
                <input id="pb-pw" type={p.showPw ? 'text' : 'password'}
                  autoComplete={view === 'login' ? 'current-password' : 'new-password'}
                  placeholder={view === 'login' ? 'Password kamu' : 'Minimal 6 karakter'}
                  value={pwValue} onChange={(e) => setPwValue(e.target.value)} required />
                <button type="button" onClick={() => p.setShowPw(!p.showPw)}>{p.showPw ? 'Sembunyi' : 'Lihat'}</button>
              </div>
            </div>
          )}

          {view === 'login' && (
            <div className="pb-end">
              <button type="button" className="pb-link" onClick={() => go('forgot')}>Lupa password?</button>
            </div>
          )}

          <button className="pb-btn solid full" disabled={p.loading}>{p.loading ? c.busy : c.btn}</button>

          {view === 'login' && (
            <p className="pb-alt">Belum punya akun? <button type="button" className="pb-link" onClick={() => go('register')}>Daftar</button></p>
          )}
          {view === 'register' && (
            <p className="pb-alt">Sudah punya akun? <button type="button" className="pb-link" onClick={() => go('login')}>Masuk</button></p>
          )}
        </form>
      </main>
    </div>
  );
}

export default function PublicPages(p) {
  const [theme, setTheme] = useState(() => localStorage.getItem('vall-theme') || 'light');

  useEffect(() => {
    document.body.classList.add('pubbody');
    return () => document.body.classList.remove('pubbody');
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('vall-theme', next);
  };

  return (
    <>
      {p.view === 'landing' ? (
        <Landing go={p.go} theme={theme} toggleTheme={toggleTheme} />
      ) : (
        <Auth p={p} theme={theme} toggleTheme={toggleTheme} />
      )}
      {p.toast && <div className={'pb-toast ' + p.toast.type} role="status">{p.toast.msg}</div>}
    </>
  );
}