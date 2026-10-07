import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from 'html5-qrcode';

export default function Scanner({ onDetect, onClose }) {
  const hostRef = useRef(null);
  const cb = useRef(onDetect);
  cb.current = onDetect; // selalu pakai handler terbaru
  const [err, setErr] = useState('');
  const [last, setLast] = useState('');

  useEffect(() => {
    // elemen dibuat per-mount supaya aman di React StrictMode
    const node = document.createElement('div');
    node.id = 'rd-' + Math.random().toString(36).slice(2);
    hostRef.current.appendChild(node);

    const scanner = new Html5Qrcode(node.id, {
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.QR_CODE],
      verbose: false,
    });

    let seen = { code: '', t: 0 };
    const starting = scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 280, height: 160 } },
      (text) => {
        const now = Date.now();
        if (text === seen.code && now - seen.t < 1500) return; // cegah hitung ganda
        seen = { code: text, t: now };
        setLast(text);
        cb.current(text);
      },
      () => {}
    );
    starting.catch(() =>
      setErr('Kamera tidak bisa dibuka. Izinkan akses kamera di browser. Dari HP, halaman harus lewat HTTPS.')
    );

    return () => {
      starting
        .then(() => scanner.stop())
        .catch(() => {})
        .finally(() => { try { scanner.clear(); } catch {} node.remove(); });
    };
  }, []);

  return (
    <div className="overlay top" onMouseDown={onClose}>
      <div className="modal scan" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>Scan barcode</h3>
          <button type="button" className="iconbtn sm" aria-label="Tutup" onClick={onClose}>✕</button>
        </div>
        <div ref={hostRef} className="reader" />
        {err
          ? <p className="errtext">{err}</p>
          : <p className="muted">Arahkan barcode ke kotak kamera.{last && <> Terakhir: <b>{last}</b></>}</p>}
        <button type="button" className="btn ghost" onClick={onClose}>Selesai</button>
      </div>
    </div>
  );
}