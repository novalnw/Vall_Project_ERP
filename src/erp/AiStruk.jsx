import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';
import { getDocument as pdfGetDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs';
import { supabase } from '../supabaseClient';

const MAX_MB = 10;
const BUCKET = 'receipts';
const ACCEPT_RE = /^(image\/(jpeg|png|webp)|application\/pdf)$/;
const EXT = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' };

const STATUS_LABEL = {
  uploaded: 'Baru masuk',
  processing: 'Diproses',
  needs_review: 'Perlu review',
  verified: 'Terverifikasi',
  exported: 'Terkirim ke ERP',
  failed: 'Gagal',
};

const fmtDate = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const fmtVal = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const parseNum = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d,.-]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const toDraft = (src) =>
  Object.fromEntries(Object.entries(src || {}).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]));

const toValues = (fields, draft) => {
  const out = {};
  for (const f of fields || []) {
    const raw = (draft[f.key] ?? '').trim();
    if (f.type === 'number') out[f.key] = raw ? parseNum(raw) : null;
    else if (f.type === 'date') out[f.key] = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
    else out[f.key] = raw || null;
  }
  return out;
};

const validateDoc = (fields, data, lines) => {
  const flags = [];
  for (const f of fields || []) {
    if (f.required && (data[f.key] === null || data[f.key] === undefined)) {
      flags.push({ level: 'error', msg: `${f.label} masih kosong` });
    }
  }
  const date = data.date;
  if (typeof date === 'string' && date > new Date().toLocaleDateString('en-CA')) {
    flags.push({ level: 'warn', msg: `Tanggal ${date} ada di masa depan, cek lagi` });
  }
  const subs = (lines || []).map((l) => parseNum(l.subtotal)).filter((n) => n !== null);
  if (subs.length) {
    const sum = subs.reduce((a, b) => a + b, 0);
    const sub = parseNum(data.subtotal);
    const total = parseNum(data.total);
    const tax = parseNum(data.tax) ?? 0;
    const base = sub ?? (total !== null ? total - tax : null);
    if (base !== null && Math.abs(sum - base) > Math.max(1, base * 0.005)) {
      flags.push({ level: 'error', msg: `Jumlah barang (${sum.toLocaleString('id-ID')}) tidak cocok dengan ${sub !== null ? 'subtotal' : 'total dikurangi pajak'} (${base.toLocaleString('id-ID')})` });
    }
  }
  (lines || []).forEach((l, i) => {
    const q = parseNum(l.qty);
    const p = parseNum(l.unit_price);
    const s = parseNum(l.subtotal);
    if (q !== null && p !== null && s !== null && Math.abs(q * p - s) > Math.max(1, s * 0.01)) {
      flags.push({ level: 'warn', msg: `Baris ${i + 1}: qty × harga (${(q * p).toLocaleString('id-ID')}) beda dengan subtotal (${s.toLocaleString('id-ID')})` });
    }
  });
  return flags;
};

const errMsg = (e) => (e instanceof Error ? e.message : e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Terjadi kesalahan');
const isAccepted = (f) => ACCEPT_RE.test(f.type);

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.7;

const isQuota = (m) => /(429|quota|rate.limit|plan and billing)/i.test(m || '');

let ocrWorker = null;
async function getOcrWorker() {
  if (!ocrWorker) {
    ocrWorker = createWorker('eng', 1, { logger: () => {} });
  }
  return ocrWorker;
}

async function pdfToImageBlob(blob) {
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const buf = await blob.arrayBuffer();
  const doc = await pdfGetDocument({ data: buf }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  await doc.destroy();
  return out;
}

async function localOcrText(blob) {
  const worker = await getOcrWorker();
  let input = blob;
  if (blob.type === 'application/pdf' || (blob.name || '').toLowerCase().endsWith('.pdf')) {
    input = await pdfToImageBlob(blob);
  }
  const { data } = await worker.recognize(input);
  return data.text || '';
}

async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
    if (scale >= 1 && file.size <= 500 * 1024) return file;
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    bmp.close();
    if (!blob) return file;
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const meta = { type: 'image/jpeg', ext, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
    return new File([blob], meta.name, { type: meta.type });
  } catch {
    return file;
  }
}

function Thumb({ path }) {
  const [url, setUrl] = useState('');
  const isPdf = (path || '').endsWith('.pdf');
  useEffect(() => {
    let live = true;
    if (!isPdf) {
      supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data, error }) => {
        if (live && !error) setUrl(data.signedUrl);
      });
    }
    return () => { live = false; };
  }, [path]);
  if (isPdf) return <span className="pdfthumb">PDF</span>;
  return url ? <img src={url} alt="" className="docthumb" /> : <span className="docthumb empty" />;
}

function ResultPanel({ doc, tpl, busy, onReprocess }) {
  return (
    <div className="docresult">
      {doc.error && <p className="notice">{doc.error}</p>}
      {doc.status !== 'failed' && (
        <>
          <div className="docmeta">
            <span>Template: {tpl?.name || 'tidak dikenali'}</span>
            {doc.confidence !== null && <span>Keyakinan AI: {Math.round(doc.confidence * 100)}%</span>}
          </div>
          {doc.data?.text_raw && (
            <pre className="ocrtext" style={{ whiteSpace: 'pre-wrap', background: 'var(--surface2)', padding: '10px 12px', borderRadius: '10px', fontSize: '.85rem', marginBottom: '12px', maxHeight: 200, overflow: 'auto' }}>{doc.data.text_raw}</pre>
          )}
          {tpl && (
            <div className="docfields">
              {tpl.fields.map((f) => (
                <div key={f.key}><small>{f.label}</small><b>{fmtVal(doc.data?.[f.key])}</b></div>
              ))}
            </div>
          )}
          {tpl && doc.lines?.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead><tr>{tpl.line_fields.map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
                <tbody>
                  {doc.lines.map((l, i) => (
                    <tr key={i}>{tpl.line_fields.map((f) => <td key={f.key}>{fmtVal(l[f.key])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {doc.flags?.length > 0 && (
            <ul className="docflags">
              {doc.flags.map((f, i) => (
                <li key={i} className={f.level === 'error' ? 'err' : 'warn'}>{f.msg}</li>
              ))}
            </ul>
          )}
        </>
      )}
      <button className="btn ghost sm" onClick={onReprocess} disabled={busy}>Proses ulang</button>
    </div>
  );
}

function ReviewForm({ doc, templates, onClose, onSaved, notify }) {
  const [tplId, setTplId] = useState(doc.template_id || '');
  const [header, setHeader] = useState(() => toDraft(doc.data));
  const [lines, setLines] = useState(() => (doc.lines || []).map(toDraft));
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const tpl = templates.find((t) => t.id === tplId);
  const flags = useMemo(() => {
    if (!tpl) return [{ level: 'error', msg: 'Pilih template dokumen dulu' }];
    return validateDoc(tpl.fields, toValues(tpl.fields, header), lines.map((l) => toValues(tpl.line_fields, l)));
  }, [tpl, header, lines]);
  const errCount = flags.filter((f) => f.level === 'error').length;
  const setH = (k, v) => setHeader((h) => ({ ...h, [k]: v }));
  const setL = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const approve = async () => {
    if (!tpl || saving) return;
    if (errCount > 0 && !confirm(`Masih ada ${errCount} peringatan merah. Tetap setujui?`)) return;
    setSaving(true);
    setSaveErr('');
    const { error } = await supabase
      .from('documents')
      .update({
        template_id: tpl.id,
        data: toValues(tpl.fields, header),
        lines: lines.map((l) => toValues(tpl.line_fields, l)),
        flags,
        status: doc.status === 'exported' ? 'exported' : 'verified',
        reviewed_at: new Date().toISOString(),
        error: null,
      })
      .eq('id', doc.id);
    setSaving(false);
    if (error) return setSaveErr(error.message);
    notify('Dokumen disimpan & terverifikasi.');
    onSaved();
  };

  return (
    <div className="modal review" onMouseDown={(e) => e.stopPropagation()}>
      <div className="mhead">
        <h3>Review dokumen</h3>
        <button type="button" className="iconbtn sm" onClick={onClose}>✕</button>
      </div>
      <div className="reviewbody">
        <label className="field">Template
          <select value={tplId} onChange={(e) => setTplId(e.target.value)}>
            {!tpl && <option value="">— pilih template —</option>}
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        {doc.confidence !== null && <small className="muted">Keyakinan AI {Math.round(doc.confidence * 100)}%</small>}
        {!tpl && <p className="notice">AI tidak mengenali tipe dokumen ini. Pilih template lalu isi manual.</p>}
        {tpl && (
          <>
            <div className="reviewfields">
              {tpl.fields.map((f) => (
                <label className="field" key={f.key}>
                  {f.label}{f.required && <span className="req">*</span>}
                  <input
                    type={f.type === 'date' ? 'date' : 'text'}
                    value={header[f.key] ?? ''}
                    onChange={(e) => setH(f.key, e.target.value)}
                  />
                </label>
              ))}
            </div>
            {tpl.line_fields.length > 0 && (
              <div className="tablewrap">
                <table>
                  <thead><tr>{tpl.line_fields.map((f) => <th key={f.key}>{f.label}</th>)}<th></th></tr></thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i}>
                        {tpl.line_fields.map((f) => (
                          <td key={f.key}>
                            <input value={l[f.key] ?? ''} onChange={(e) => setL(i, f.key, e.target.value)} />
                          </td>
                        ))}
                        <td className="act">
                          <button type="button" className="iconbtn sm bad" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button" className="btn ghost sm" onClick={() => setLines((ls) => [...ls, {}])}>+ Tambah baris</button>
              </div>
            )}
          </>
        )}
        {flags.length > 0 && (
          <ul className="docflags">
            {flags.map((f, i) => <li key={i} className={f.level === 'error' ? 'err' : 'warn'}>{f.msg}</li>)}
          </ul>
        )}
        {flags.length === 0 && tpl && <p className="okline">Semua validasi lolos.</p>}
        {saveErr && <p className="notice">{saveErr}</p>}
        <div className="row end">
          <button className="btn ghost" onClick={onClose}>Batal</button>
          <button className="btn" onClick={approve} disabled={saving || !tpl}>
            {saving ? 'Menyimpan...' : doc.status === 'needs_review' ? 'Setujui & lanjut' : 'Simpan perubahan'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AiStruk({ notify, user }) {
  const inputRef = useRef(null);
  const [docs, setDocs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(new Set());
  const [errs, setErrs] = useState({});
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('all');
  const [drag, setDrag] = useState(false);
  const [reviewDoc, setReviewDoc] = useState(null);

  const load = async () => {
    const [{ data: d }, { data: t }] = await Promise.all([
      supabase.from('documents').select('id,file_path,file_name,status,confidence,template_id,created_at,data,lines,flags,error').order('created_at', { ascending: false }),
      supabase.from('doc_templates').select('id,name,fields,line_fields'),
    ]);
    setDocs(d || []);
    setTemplates(t || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const patch = (id, p) => setQueue((q) => q.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const uploadDocument = async (userId, file) => {
    if (file.size > MAX_MB * 1024 * 1024) throw new Error(`Ukuran melebihi ${MAX_MB} MB`);
    const path = `${userId}/${crypto.randomUUID()}.${EXT[file.type] || 'bin'}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) throw up.error;
    const ins = await supabase.from('documents').insert({ file_path: path, file_name: file.name });
    if (ins.error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw ins.error;
    }
  };

  const processDoc = async (id) => {
    const { error } = await supabase.functions.invoke('super-task', { body: { document_id: id } });
    if (error) {
      let msg = error.message;
      if (error && typeof error.context?.json === 'function') {
        const j = await error.context.json().catch(() => null);
        if (j?.error) msg = j.error;
      }
      throw new Error(msg);
    }
  };

  const runLocalOcr = async (d) => {
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(d.file_path);
    if (dlErr) throw dlErr;
    const text = await localOcrText(blob);
    const { error } = await supabase.from('documents').update({
      status: 'needs_review',
      confidence: 0.3,
      flags: [{ level: 'warn', msg: 'Diproses pakai OCR lokal (Tesseract). Periksa hasil.' }],
      data: { ...(d.data || {}), text_raw: text },
      error: null,
    }).eq('id', d.id);
    if (error) throw error;
  };

  const runProcess = async (d, forceLocal = false) => {
    setBusy((b) => new Set(b).add(d.id));
    setErrs((e) => { const { [d.id]: _x, ...rest } = e; return rest; });
    if (forceLocal) {
      try {
        notify('Memproses OCR lokal (Tesseract)...');
        await runLocalOcr(d);
        setOpen(d.id);
      } catch (e2) {
        setErrs((x) => ({ ...x, [d.id]: 'OCR lokal gagal: ' + errMsg(e2) }));
      } finally {
        setBusy((b) => { const n = new Set(b); n.delete(d.id); return n; });
        await load();
      }
      return;
    }
    try {
      await processDoc(d.id);
      setOpen(d.id);
      notify('Dokumen sedang diproses AI.');
    } catch (e) {
      const msg = errMsg(e);
      if (isQuota(msg)) {
        try {
          notify('Quota AI habis — pakai OCR lokal (Tesseract)...');
          await runLocalOcr(d);
          setOpen(d.id);
        } catch (e2) {
          setErrs((x) => ({ ...x, [d.id]: 'Quota AI habis dan OCR lokal gagal: ' + errMsg(e2) }));
        }
      } else {
        setErrs((x) => ({ ...x, [d.id]: msg }));
        notify(msg, 'err');
      }
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(d.id); return n; });
      await load();
    }
  };

  const handleFiles = async (list) => {
    if (!user) return;
    const jobs = [];
    const rejected = [];
    for (const raw of Array.from(list)) {
      const file = await compressImage(raw);
      const item = { id: crypto.randomUUID(), name: file.name, state: 'uploading' };
      if (!isAccepted(file)) rejected.push({ ...item, state: 'error', msg: 'Format harus JPG, PNG, WEBP, atau PDF' });
      else jobs.push({ item, file });
    }
    setQueue((q) => [...jobs.map((j) => j.item), ...rejected, ...q]);
    const pending = [...jobs];
    const worker = async () => {
      while (pending.length) {
        const job = pending.shift();
        try {
          await uploadDocument(user, job.file);
          patch(job.item.id, { state: 'done' });
        } catch (e) {
          patch(job.item.id, { state: 'error', msg: errMsg(e) });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    await load();
  };

  const onDrop = (e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); };

  const removeDoc = async (d) => {
    if (!confirm('Hapus dokumen ini?')) return;
    await supabase.storage.from(BUCKET).remove([d.file_path]);
    await supabase.from('documents').delete().eq('id', d.id);
    await load();
  };

  const count = (states) => docs.filter((d) => states.includes(d.status)).length;
  const toProcess = docs.filter((d) => d.status === 'uploaded' || d.status === 'failed');
  const uploading = queue.some((i) => i.state === 'uploading');
  const anyBusy = busy.size > 0;
  const toReview = count(['needs_review']);

  const FILTERS = [
    { key: 'all', label: 'Semua', n: docs.length },
    { key: 'review', label: 'Perlu review', n: toReview },
    { key: 'failed', label: 'Gagal', n: count(['failed']) },
    { key: 'done', label: 'Selesai', n: count(['verified', 'exported']) },
  ];
  const filteredDocs = docs.filter((d) => {
    if (filter === 'review') return d.status === 'needs_review';
    if (filter === 'failed') return d.status === 'failed';
    if (filter === 'done') return d.status === 'verified' || d.status === 'exported';
    return true;
  });

  return (
    <>
      <div className="stats">
        <div className="stat"><b>{toReview}</b><span>Perlu review</span></div>
        <div className="stat"><b>{docs.length}</b><span>Total dokumen</span></div>
        <div className="stat"><b>{count(['verified', 'exported'])}</b><span>Terverifikasi</span></div>
        <div className="stat warn"><b>{count(['uploaded', 'failed'])}</b><span>Menunggu proses</span></div>
      </div>

      <div
        className={'dropzone' + (drag ? ' drag' : '')}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="dzicon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V4m0 0 4 4m-4-4-4 4M4 20h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
        <b>{drag ? 'Lepas sekarang' : 'Seret file ke sini atau pilih dari perangkat'}</b>
        <span>Foto atau PDF struk. Bisa upload banyak sekaligus. Di HP bisa langsung foto.</span>
        <small>JPG · PNG · WEBP · PDF · maks {MAX_MB} MB per file</small>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {queue.length > 0 && (
        <div className="card upque">
          <div className="barhead"><span>{uploading ? 'Mengunggah...' : 'Upload selesai'}</span>{!uploading && <button className="linkbtn" onClick={() => setQueue([])}>Bersihkan</button>}</div>
          <ul>
            {queue.map((i) => (
              <li key={i.id} className="line">
                <span>{i.name}</span>
                <small className={i.state === 'error' ? 'neg' : i.state === 'done' ? 'pos' : 'mututed'}>
                  {i.state === 'uploading' && 'mengunggah...'}
                  {i.state === 'done' && '✓ masuk'}
                  {i.state === 'error' && `✕ ${i.msg}`}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="filters">
        <div className="tabs">
          {FILTERS.map((f) => (
            <button key={f.key} className={'btn ghost sm' + (filter === f.key ? ' on' : '')} onClick={() => setFilter(f.key)}>
              {f.label} <em className="cnt">{f.n}</em>
            </button>
          ))}
        </div>
        {toProcess.length > 0 && (
          <button className="btn sm" onClick={async () => { for (const d of toProcess) await runProcess(d); }} disabled={anyBusy}>
            {anyBusy ? 'Memproses...' : `Proses semua (${toProcess.length})`}
          </button>
        )}
      </div>

      {loading ? (
        <div className="center-load" style={{ minHeight: 120 }}>Memuat...</div>
      ) : docs.length === 0 ? (
        <div className="emptystate">
          <div className="eicon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3h7l5 5v13H7V3Z M14 3v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
          <b>Belum ada dokumen</b>
          <span>Upload struk pertama lewat kotak di atas.</span>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="emptystate"><b>Tidak ada dokumen di filter ini.</b></div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead><tr><th>Dokumen</th><th>Status</th><th>AI</th><th>Waktu</th><th></th></tr></thead>
            <tbody>
              {filteredDocs.map((d) => {
                const isBusy = busy.has(d.id);
                const status = isBusy ? 'processing' : d.status;
                const canProcess = d.status === 'uploaded' || d.status === 'failed';
                const rowErr = errs[d.id] || (d.status === 'failed' ? d.error : null);
                const redFlags = (d.flags || []).filter((f) => f.level === 'error').length;
                const conf = d.confidence !== null ? Math.round(d.confidence * 100) : null;
                return (
                  <React.Fragment key={d.id}>
                    <tr>
                      <td>
                        <div className="prod">
                          <Thumb path={d.file_path} />
                          <div>
                            <b>{d.file_name || 'tanpa nama'}</b>
                            {redFlags > 0 && <small className="block neg">{redFlags} ⚠ peringatan</small>}
                          </div>
                        </div>
                      </td>
                      <td><span className={'badge st-' + status}>{STATUS_LABEL[status]}</span></td>
                      <td>{conf !== null ? `${conf}%` : '—'}</td>
                      <td className="muted">{fmtDate.format(new Date(d.created_at))}</td>
                      <td className="act">
                        {isBusy ? (
                          <span className="muted">memproses...</span>
                        ) : canProcess ? (
                          <span className="actrow">
                            <button className="btn sm" onClick={() => runProcess(d)}>{d.status === 'failed' ? 'Coba lagi' : 'Proses'}</button>
                            <button className="btn ghost sm" title="OCR lokal tanpa Gemini" onClick={() => runProcess(d, true)}>Proses lokal</button>
                          </span>
                        ) : (
                          <>
                            <button className="btn ghost sm" onClick={() => setOpen(open === d.id ? null : d.id)}>{open === d.id ? 'Tutup' : 'Lihat hasil'}</button>
                            {d.status === 'needs_review' && <button className="btn sm" onClick={() => setReviewDoc(d)}>Review</button>}
                          </>
                        )}
                        <button className="iconbtn sm bad" title="Hapus" onClick={() => removeDoc(d)}>✕</button>
                      </td>
                    </tr>
                    {rowErr && <tr><td colSpan="5"><p className="notice">{rowErr}</p></td></tr>}
                    {open === d.id && d.status !== 'uploaded' && (
                      <tr><td colSpan="5"><ResultPanel doc={d} tpl={templates.find((t) => t.id === d.template_id)} busy={isBusy} onReprocess={() => runProcess(d)} /></td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {reviewDoc && (
        <div className="overlay" onMouseDown={() => setReviewDoc(null)}>
          <ReviewForm doc={reviewDoc} templates={templates} onClose={() => setReviewDoc(null)} onSaved={() => { setReviewDoc(null); load(); }} notify={notify} />
        </div>
      )}
    </>
  );
}
