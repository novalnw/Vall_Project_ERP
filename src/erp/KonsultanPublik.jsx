import { useEffect, useRef, useState } from 'react';

const KB = [
  { tags: ['apa itu', 'vall dev', 'sistem ini', 'pengenalan', 'kenalan', 'apa saja', 'describe'], a: 'VALL Dev adalah sistem (ERP ringan) untuk usaha kecil: mencatat stok barang masuk/keluar, membuat invoice, menerima pembayaran, memantau kas, sampai melihat laba rugi. Pelanggan juga punya portal sendiri untuk memesan dan membayar lewat HP.' },
  { tags: ['kelebihan', 'keunggulan', 'plus', 'kekuatan', 'bagusnya', 'unggul', 'untungnya'], a: 'Kelebihan utamanya: (1) semuanya satu tempat — stok, invoice, pembayaran, kas, dan laporan; (2) otomatis, stok berkurang begitu invoice dibuat; (3) ada portal pelanggan sehingga pelanggan bisa pesan dan bayar sendiri dari HP; (4) peran & akses jelas (pemilik/admin/kasir/gudang) plus jejak Log aktivitas untuk audit; (5) data tersimpan aman di cloud, bisa diakses dari mana saja; (6) dibuat ramah untuk usaha kecil, tidak serumit ERP skala besar.' },
  { tags: ['kekurangan', 'kelemahan', 'minus', 'jeleknya', 'kurangnya', 'kekurangannya', 'lemah'], a: 'Beberapa hal yang perlu diperhatikan: (1) butuh koneksi internet karena data di cloud; (2) bergantung pada layanan pihak ketiga (Supabase/Firebase); (3) ada kurva belajar untuk staf yang belum terbiasa aplikasi; (4) modul lebih ke operasional penjualan & stok — akuntansi/perpajakan lanjutan masih terbatas; (5) tampilan dan alur mengikuti paket standar, jadi penyesuaian sangat khusus perlu pengembangan tambahan.' },
  { tags: ['perbandingan', 'bandingkan', 'beda dengan', 'vs', 'dibanding', 'kompetitor', 'aplikasi lain'], a: 'Dibanding Excel atau catatan manual, VALL Dev lebih rapi: stok otomatis, ada invoice bernomor, pembayaran tercatat, dan laporan tinggal dipilih. Dibanding ERP besar seperti SAP/Odoo, VALL Dev jauh lebih ringan, lebih murah, dan mudah dipakai usaha kecil — tapi tidak se-fleksibel untuk kebutuhan korporat yang kompleks.' },
  { tags: ['untuk siapa', 'target', 'usaha', 'toko', 'umkm', 'bisnis'], a: 'Sistem ini dibuat untuk pemilik usaha kecil/menengah: toko, warung, distributor, jasa, dan sejenisnya yang butuh catatan stok dan tagihan rapi tanpa kertas tercecer.' },
  { tags: ['fitur', 'bisa apa', 'menu', 'lengkap', 'kegunaan'], a: 'Fitur utamanya: manajemen stok + stock opname, invoice & piutang, pembelian (PO & penerimaan barang), kas & laba rugi, portal pelanggan, serta peran & akses (pemilik, admin, kasir, gudang, pelanggan).' },
  { tags: ['mulai', 'daftar', 'cara pakai', 'memulai', 'langkah awal', 'register'], a: 'Cukup daftar dengan email dan password. Akun baru otomatis jadi akun pelanggan; peran staf (admin/kasir/gudang) nanti diatur oleh pemilik usaha dari menu "Peran & akses".' },
  { tags: ['biaya', 'harga', 'bayar', 'gratis', 'mahal', 'tarif'], a: 'Saya tidak bisa menampilkan harga pasti karena itu keputusan pemilik usaha. Tanya langsung pada pemilik/pengelola VALL Dev untuk informasi paket dan biaya.' },
  { tags: ['aman', 'keamanan', 'data', 'privacy', 'rahasia'], a: 'Login memakai akun per orang, dan setiap peran punya batas menu yang bisa dibuka. Aktivitas penting tercatat di "Log aktivitas" sehingga bisa diaudit.' },
  { tags: ['stok', 'opname', 'barang', 'inventory'], a: 'Stok dicatat otomatis saat ada invoice (berkurang) dan penerimaan barang (bertambah). Stock opname memungkinkan mencocokkan stok fisik dengan sistem lewat scan barcode atau kamera.' },
  { tags: ['invoice', 'tagihan', 'piutang', 'nota'], a: 'Buat invoice saat penjualan: pilih pelanggan dan produk, lalu simpan. Tagihan bisa dilunasi penuh atau sebagian, dan ada penanda jatuh tempo.' },
  { tags: ['pembayaran', 'bayar', 'nota keluar', 'lunas'], a: 'Pembayaran pelanggan dikonfirmasi oleh admin, saldo kas bertambah, dan nota siap dicetak. Pelanggan bisa unggah bukti transfer/QRIS dari HP.' },
  { tags: ['laporan', 'laba rugi', 'kas', 'penjualan', 'laporan'], a: 'Ada laporan penjualan per periode, penjualan per pelanggan, mutasi barang, dan laba rugi — semua bisa diekspor jadi CSV.' },
  { tags: ['portal pelanggan', 'pelanggan', 'pesan'], a: 'Pelanggan punya portal sendiri: melihat katalog, memesan, memantau status pesanan, dan membayar tagihan — semua dari HP.' },
  { tags: ['peran', 'akses', 'pemilik', 'admin', 'kasir', 'gudang'], a: 'Ada 4 peran staf (pemilik, admin, kasir, gudang) plus pelanggan. Tiap peran hanya bisa membuka menu sesuai wewenangnya; diatur pemilik.' },
];

const FALLBACK = 'Hmm, saya belum paham pertanyaan itu. Coba tanya lebih spesifik, misalnya "apa itu VALL Dev?", "fitur apa saja yang ada?", atau "bagaimana cara memulai?".';
const COMPLAIN = 'Kalau kamu mengalami kendala saat melihat halaman ini, coba muat ulang (refresh). Kalau tetap bermasalah, hubungi pemilik/pengelola VALL Dev agar bisa ditindaklanjuti.';

const CHIPS = ['Apa itu VALL Dev?', 'Fitur apa saja yang ada?', 'Apa kelebihan & kekurangannya?', 'Bagaimana cara memulai?', 'Apakah sistem ini aman?'];

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
  if (/keluh|komplain|masalah|error|bug|rusak|gagal/.test(s)) return COMPLAIN;
  return FALLBACK;
}

export default function KonsultanPublik({ theme }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([
        { from: 'ai', text: 'Halo! Saya Konsultan AI untuk VALL Dev 👋 Ingin tahu sistem ini itu apa, untuk siapa, dan cara memulainya? Tanya saja di sini.' },
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
    <span className="pb-kroot" data-theme={theme}>
      <button className="pb-kfab" onClick={() => setOpen((o) => !o)} aria-label="Buka Konsultan AI" aria-expanded={open}>
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a9 9 0 019 9c0 4.4-3.2 8-7.4 8.8L12 22l-1.6-2.2C6.2 19 3 15.4 3 11a9 9 0 019-9z" /><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" /></svg>
        )}
      </button>

      {open && (
        <div className="pb-kpanel" role="dialog" aria-label="Konsultan AI">
          <div className="pb-khead">
            <div className="pb-khead-t">
              <span className="pb-kdot" />
              <div><b>Konsultan AI</b><small>Pengenalan VALL Dev</small></div>
            </div>
            <button type="button" className="pb-close" onClick={() => setOpen(false)} aria-label="Tutup">✕</button>
          </div>

          <div className="pb-kbody">
            {msgs.map((m, i) => (
              <div key={i} className={'pb-kmsg ' + m.from}>{m.text}</div>
            ))}
            <div ref={endRef} />
          </div>

          {msgs.length === 1 && (
            <div className="pb-kchips">
              {CHIPS.map((c) => (
                <button key={c} type="button" className="pb-kchip" onClick={() => send(c)}>{c}</button>
              ))}
            </div>
          )}

          <form className="pb-kinput" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tanya tentang VALL Dev…" />
            <button className="pb-btn solid sm" type="submit" disabled={!text.trim()}>Kirim</button>
          </form>
        </div>
      )}
    </span>
  );
}
