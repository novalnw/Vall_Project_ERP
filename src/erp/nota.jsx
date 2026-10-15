import { rupiah, tglD } from './ui';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// pay: baris pembayaran, inv: invoice (ada pelanggan?.nama, total, dibayar), cfg: pengaturan usaha
export function cetakNota(pay, inv, cfg) {
  const w = window.open('', '_blank');
  if (!w) return alert('Izinkan pop-up untuk mencetak.');
  const sisa = Math.max((+inv?.total || 0) - (+inv?.dibayar || 0), 0);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(pay.nomor_nota || 'Nota')}</title>
<style>body{font-family:Arial,sans-serif;padding:32px;color:#111;max-width:640px;margin:auto}h1{margin:0}h2{margin:18px 0 4px}
table{width:100%;border-collapse:collapse;margin:14px 0}td{padding:8px;border-bottom:1px solid #ddd}.r{text-align:right}
.big td{font-size:1.15rem;font-weight:bold;border-bottom:2px solid #111}.ok{display:inline-block;border:2px solid #0a7a58;color:#0a7a58;padding:2px 12px;font-weight:bold;transform:rotate(-4deg);margin-top:8px}</style></head><body>
<h1>${esc(cfg?.nama_usaha || 'Usaha')}</h1><div>${esc(cfg?.alamat)} ${esc(cfg?.telepon)}</div><hr>
<h2>NOTA PEMBAYARAN</h2>
<div>No. nota: <b>${esc(pay.nomor_nota || '-')}</b></div>
<div>Tanggal: ${tglD(pay.tanggal)}</div>
<div>Diterima dari: <b>${esc(inv?.pelanggan?.nama || 'Pelanggan umum')}</b></div>
<table>
<tr><td>Untuk pembayaran invoice</td><td class="r">${esc(inv?.nomor || '-')}</td></tr>
<tr><td>Metode</td><td class="r">${esc(pay.metode)}</td></tr>
<tr class="big"><td>Jumlah dibayar</td><td class="r">${rupiah(pay.jumlah)}</td></tr>
<tr><td>Total invoice</td><td class="r">${rupiah(inv?.total)}</td></tr>
<tr><td>Total sudah dibayar</td><td class="r">${rupiah(inv?.dibayar)}</td></tr>
<tr><td>Sisa tagihan saat ini</td><td class="r">${rupiah(sisa)}</td></tr>
</table>
${sisa <= 0 ? '<div class="ok">LUNAS</div>' : ''}
${pay.catatan ? `<p>Catatan: ${esc(pay.catatan)}</p>` : ''}
<p style="margin-top:36px;color:#666;font-size:.85rem">Terima kasih. Nota ini sah sebagai bukti pembayaran.</p>
</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}