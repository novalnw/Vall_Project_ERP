import { useEffect, useRef, useState } from 'react';

const KB = [
  { tags: ['dashboard', 'ringkasan', 'beranda', 'home'], a: 'Dashboard berisi ringkasan kondisi bisnis: jumlah jenis barang, total unit, nilai persediaan, dan stok yang perlu restock. Ada juga grafik kesehatan stok, stok per kategori, daftar restock, dan opname terakhir.' },
  { tags: ['buat invoice', 'invoice baru', 'buat nota'], a: 'Menu "Buat invoice" dipakai mencatat penjualan: pilih pelanggan, tambah item produk, lalu simpan. Stok otomatis berkurang, dan statusnya bisa dipantau di "Daftar invoice".' },
  { tags: ['daftar invoice', 'tagihan', 'status invoice', 'invoice'], a: 'Di "Daftar invoice" kamu melihat semua tagihan beserta statusnya: belum dibayar, dibayar sebagian, lunas, atau jatuh tempo. Dari sini bisa dibuat pembayaran/nota.' },
  { tags: ['pembayaran', 'bayar', 'nota'], a: 'Menu Pembayaran mencatat pembayaran yang diterima dari pelanggan dan menghubungkannya dengan invoice/nota terkait.' },
  { tags: ['pesanan masuk', 'pesanan', 'order masuk'], a: '"Pesanan masuk" berisi permintaan pembelian dari pelanggan yang perlu disetujui sebelum dijadikan invoice.' },
  { tags: ['konfirmasi bayar', 'konfirmasi', 'menunggu'], a: 'Menu ini berisi pembayaran pelanggan yang menunggu konfirmasi, lalu dihubungkan ke nota/invoice.' },
  { tags: ['pengeluaran', 'biaya', 'operasional'], a: 'Catat biaya operasional toko (listrik, sewa, gaji, dll) di sini. Data ini ikut memengaruhi laporan laba rugi.' },
  { tags: ['kas', 'bank', 'saldo', 'akun'], a: '"Kas & bank" untuk mengelola saldo akun: mutasi masuk/keluar, pembayaran, dan pengeluaran diperhitungkan otomatis di saldo.' },
  { tags: ['peran', 'akses', 'roles', 'izin', 'hak'], a: 'Atur peran (Pemilik, Admin, Kasir, Gudang, Pelanggan) dan menu apa saja yang boleh dibuka tiap peran. Hanya Pemilik yang bisa mengubah pengaturan ini.' },
  { tags: ['log aktivitas', 'log', 'jejak', 'riwayat aktivitas'], a: '"Log aktivitas" mencatat jejak aktivitas pengguna (tambah/ubah/hapus produk, terapkan opname, dll) untuk keperluan audit.' },
  { tags: ['pelanggan', 'customer'], a: 'Kelola data pelanggan. Pelanggan punya portal sendiri untuk memesan, melihat tagihan, dan membayar.' },
  { tags: ['produk', 'barang', 'inventory', 'stok barang'], a: 'Produk menampilkan seluruh inventory: nama, kategori, barcode, stok, harga, dan status (aman/menipis/habis). Bisa cari, filter, tambah/ubah/hapus, serta ekspor CSV.' },
  { tags: ['supplier', 'pemasok'], a: 'Menu supplier berisi data pemasok barang toko kamu.' },
  { tags: ['purchase order', 'po', 'pemesanan pembelian', 'beli ke supplier'], a: '"Purchase order" adalah pesanan pembelian ke supplier. Saat barang datang, gunakan "Penerimaan barang" untuk menambah stok.' },
  { tags: ['penerimaan barang', 'terima barang', 'terima'], a: '"Penerimaan barang" dipakai saat barang dari PO tiba; stok bertambah otomatis.' },
  { tags: ['harga supplier', 'harga beli', 'bandingkan'], a: '"Harga supplier" untuk membandingkan harga beli antar supplier sehingga bisa memilih yang termurah.' },
  { tags: ['opname', 'stock opname', 'stok fisik', 'hitung fisik'], a: 'Stock opname mencocokkan stok fisik (lewat scan barcode, kamera, atau manual) dengan stok sistem, lalu menerapkan selisihnya. Hasilnya tercatat di "Riwayat opname".' },
  { tags: ['laporan penjualan', 'lap jual', 'rekap penjualan'], a: 'Laporan penjualan merekap penjualan per periode dan bisa diekspor ke CSV.' },
  { tags: ['penjualan per pelanggan', 'lap pelanggan', 'kontribusi'], a: 'Penjualan per pelanggan memperlihatkan pelanggan dengan kontribusi penjualan terbesar.' },
  { tags: ['mutasi', 'keluar masuk', 'riwayat barang'], a: 'Mutasi per barang menampilkan riwayat keluar-masuk stok untuk tiap barang.' },
  { tags: ['laba rugi', 'laba', 'rugi', 'keuntungan'], a: 'Laporan laba rugi menghitung pendapatan dikurangi HPP dan biaya, sehingga menghasilkan laba atau rugi bersih.' },
  { tags: ['riwayat opname', 'riwayat', 'opname terakhir'], a: '"Riwayat opname" menyimpan catatan semua opname yang sudah diterapkan, termasuk selisih dan petugasnya.' },
  { tags: ['pengaturan', 'pengaturan usaha', 'profil usaha', 'ppn', 'jatuh tempo'], a: 'Pengaturan berisi profil usaha (nama, alamat, telepon), format/awalan nomor invoice, persentase PPN, dan jatuh tempo default pembayaran.' },
  { tags: ['portal pelanggan', 'katalog', 'pesan sekarang', 'status pesanan', 'profil saya'], a: 'Portal pelanggan memberi akses khusus: Beranda, Pesan sekarang, Pesanan saya, Tagihan & bayar, dan Profil saya — semuanya milik pelanggan itu sendiri.' },
  { tags: ['login', 'masuk', 'daftar', 'register', 'lupa password', 'reset password', 'akun'], a: 'Masuk memakai email dan password. Kalau lupa password, gunakan tautan "Lupa password" dan ikuti email reset. Password minimal 6 karakter.' },
  { tags: ['akses', 'tidak bisa buka', 'denied', 'ditolak', 'tidak punya'], a: 'Kalau sebuah menu tidak bisa dibuka, kemungkinan peran kamu tidak punya izin untuk menu itu. Hubungi Pemilik untuk menyesuaikan peran & akses.' },
];

const FALLBACK = 'Hmm, saya belum paham pertanyaan itu. Coba lebih spesifik, misalnya sebutkan menu terkait — contoh: "cara buat invoice" atau "bagaimana cara opname". Kalau ini keluhan atau error, jelaskan langkah yang kamu lakukan biar bisa kami bantu.';
const COMPLAIN = 'Kalau kamu mengalami kendala atau keluhan, tolong jelaskan detailnya: di menu mana, langkah apa yang dilakukan, dan pesan error yang muncul. Tim bisa menelusuri lewat "Log aktivitas" dan memperbaikinya segera.';

const CHIPS = ['Cara buat invoice', 'Bagaimana cara opname', 'Saya tidak punya akses', 'Ada error / bug'];

function answer(q) {
  const s = q.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const entry of KB) {
    let score = 0;
    for (const t of entry.tags) {
      if (s.includes(t)) score += t.length;
    }
    if (score > bestScore) { bestScore = score; best = entry.a; }
  }
  if (best) return best;
  if (/keluh|komplain|khawatir|kecewa|tidak puas|masalah|error|bug|rusak/.test(s)) return COMPLAIN;
  return FALLBACK;
}

export default function Konsultan() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([
        { from: 'ai', text: 'Halo! Saya Konsultan AI untuk sistem VALLDev. Tanyakan cara pakai menu, laporan, atau sampaikan keluhanmu di sini.' },
      ]);
    }
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs]);

  const send = (raw) => {
    const q = (raw ?? text).trim();
    if (!q) return;
    setMsgs((m) => [...m, { from: 'user', text: q }]);
    setText('');
    setTimeout(() => {
      setMsgs((m) => [...m, { from: 'ai', text: answer(q) }]);
    }, 350);
  };

  return (
    <>
      <button className="kfab" onClick={() => setOpen((o) => !o)} aria-label="Buka Konsultan AI" aria-expanded={open}>
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a9 9 0 019 9c0 4.4-3.2 8-7.4 8.8L12 22l-1.6-2.2C6.2 19 3 15.4 3 11a9 9 0 019-9z" /><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" /></svg>
        )}
      </button>

      {open && (
        <div className="kpanel" role="dialog" aria-label="Konsultan AI">
          <div className="khead">
            <div className="khead-t">
              <span className="kdot" />
              <div><b>Konsultan AI</b><small>Pembantu karyawan · online</small></div>
            </div>
            <button className="iconbtn sm" onClick={() => setOpen(false)} aria-label="Tutup">✕</button>
          </div>

          <div className="kbody">
            {msgs.map((m, i) => (
              <div key={i} className={'kmsg ' + m.from}>{m.text}</div>
            ))}
            <div ref={endRef} />
          </div>

          {msgs.length === 1 && (
            <div className="kchips">
              {CHIPS.map((c) => (
                <button key={c} className="kchip" onClick={() => send(c)}>{c}</button>
              ))}
            </div>
          )}

          <form className="kinput" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis pertanyaan / keluhan…" />
            <button className="btn" type="submit" disabled={!text.trim()} aria-label="Kirim">Kirim</button>
          </form>
        </div>
      )}
    </>
  );
}
