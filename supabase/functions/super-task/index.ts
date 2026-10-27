// ============================================================
// Edge Function: super-task
// Membaca struk/nota dari Storage lalu meminta Gemini membaca
// dan mengekstrak data terstruktur ke tabel 'documents'.
//
// Deploy (WAJIB dengan verify_jwt, JANGAN --no-verify-jwt):
//   supabase secrets set GEMINI_API_KEY=xxx
//   supabase functions deploy super-task       // default verify_jwt = true
//
// Keamanan:
//   - Hanya dipanggil oleh user yang sudah login (JWT diverifikasi
//     oleh Supabase gateway) yang perannya STAF (owner/admin/kasir/
//     gudang). Pelanggan publik ditolak (403).
//   - Validasi server-side: hanya file gambar (jpeg/png/webp) & PDF,
//     maks 10 MB.
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const geminiKey = Deno.env.get('GEMINI_API_KEY')

const supabase = createClient(supabaseUrl, supabaseKey)

const MODEL = 'gemini-3.8-flash'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const STAFF_ROLES = new Set(['owner', 'admin', 'kasir', 'gudang'])

const PROMPT = `Kamu adalah mesin OCR untuk struk/nota belanja.
Baca gambar/PDF yang dilampirkan, lalu kembalikan HANYA satu objek JSON tanpa teks lain:
{
  "template_id": null,
  "confidence": 0.0,
  "data": { "store": "", "date": "YYYY-MM-DD", "subtotal": 0, "tax": 0, "total": 0, "payment_method": "" },
  "lines": [ { "name": "", "qty": 1, "unit_price": 0, "subtotal": 0 } ],
  "flags": [ { "level": "warn|error", "msg": "" } ]
}
Aturan:
- template_id selalu null (template default dipilih manual saat review).
- confidence = 0..1 seberapa yakin kamu membaca dengan benar.
- Jika ada barang/angka yang tidak terbaca, kosongkan nilainya.
- flags: beri level "error" jika ada field wajib yang kosong, "warn" jika ada kejanggalan (mis. tanggal di masa depan).`

interface Flag { level: 'warn' | 'error'; msg: string }
interface Result {
  template_id: string | null
  confidence: number
  data: Record<string, unknown>
  lines: Record<string, unknown>[]
  flags: Flag[]
}

function normalize(data: unknown): Result {
  const d = (data ?? {}) as Partial<Result>
  return {
    template_id: typeof d.template_id === 'string' ? d.template_id : null,
    confidence: typeof d.confidence === 'number' ? Math.min(1, Math.max(0, d.confidence)) : 0,
    data: d.data && typeof d.data === 'object' ? d.data : {},
    lines: Array.isArray(d.lines) ? d.lines : [],
    flags: Array.isArray(d.flags) ? (d.flags as Flag[]) : [],
  }
}

// Ekstrak user id dari JWT. Tanda tangan sudah diverifikasi oleh
// Supabase gateway saat verify_jwt = true; di sini cukup baca klaim 'sub'.
function tokenUserId(req: Request): string | null {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.toLowerCase().startsWith('bearer ')) return null
  const token = auth.slice(7).trim()
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(escape(atob(b64)))
    return (JSON.parse(json) as { sub?: string })?.sub ?? null
  } catch {
    return null
  }
}

async function isStaff(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return false
  return STAFF_ROLES.has(String(data.role).toLowerCase())
}

async function callGemini(base64: string, mime: string): Promise<Result> {
  if (!geminiKey) throw new Error('GEMINI_API_KEY belum diatur')
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  let lastErr = ''

  for (let attempt = 0; attempt < 4; attempt++) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationConfig: { responseMimeType: 'application/json' },
          contents: [{
            parts: [
              { text: PROMPT },
              { inlineData: { mimeType: mime, data: base64 } },
            ],
          }],
        }),
      },
    )

    if (resp.ok) {
      const json = await resp.json()
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
      let parsed: unknown
      try { parsed = JSON.parse(text) } catch { parsed = {} }
      return normalize(parsed)
    }

    const t = await resp.text()
    lastErr = `Gemini ${resp.status}: ${t.slice(0, 300)}`
    if (resp.status === 429 || resp.status === 503) {
      await sleep(2000 * (attempt + 1))
      continue
    }
    break
  }

  throw new Error(lastErr)
}

async function downloadObject(path: string): Promise<{ base64: string; mime: string }> {
  const { data, error } = await supabase.storage.from('receipts').download(path)
  if (error) throw new Error(`Gagal unduh file: ${error.message}`)

  const mime = data.type || 'application/pdf'
  if (!ALLOWED_MIME.has(mime)) throw new Error(`Tipe file tidak diizinkan: ${mime}`)
  if (data.size > MAX_BYTES) throw new Error(`File melebihi batas 10 MB: ${data.size} byte`)

  const buf = new Uint8Array(await data.arrayBuffer())
  let b64 = ''
  let bytes = 0
  const CHUNK = 0x8000
  while (bytes < buf.length) {
    b64 += String.fromCharCode(...buf.subarray(bytes, Math.min(bytes + CHUNK, buf.length)))
    bytes += CHUNK
  }
  return { base64: btoa(b64), mime }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors() })
  }

  try {
    // 1) Otentikasi: harus login & staf
    const userId = tokenUserId(req)
    if (!userId) throw new AuthError('Login diperlukan')
    if (!(await isStaff(userId))) throw new AuthError('Akses hanya untuk staf')

    // 2) Validasi body
    let body: { document_id?: string }
    try {
      body = await req.json()
    } catch {
      throw new Error('Body JSON tidak valid')
    }
    const { document_id } = body
    if (!document_id || typeof document_id !== 'string') throw new Error('document_id wajib diisi')

    // 3) Ambil dokumen, proses
    const { data: doc, error } = await supabase
      .from('documents')
      .select('id,file_path')
      .eq('id', document_id)
      .single()
    if (error || !doc) throw new Error('Dokumen tidak ditemukan')

    await supabase.from('documents').update({ status: 'processing', error: null }).eq('id', document_id)

    const { base64, mime } = await downloadObject(doc.file_path)
    const result = await callGemini(base64, mime)

    // status: kalau ada error flag atau confidence rendah, minta review manual
    const hasError = result.flags.some((f) => f.level === 'error')
    const status = hasError || result.confidence < 0.6 ? 'needs_review' : 'needs_review'

    const { error: upErr } = await supabase
      .from('documents')
      .update({
        status,
        confidence: Math.round(result.confidence * 100) / 100,
        template_id: null,
        data: result.data,
        lines: result.lines,
        flags: result.flags,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', document_id)

    if (upErr) throw upErr

    return json({ ok: true, status }, 200)
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, 403)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return json({ ok: false, error: msg }, 400)
  }
})

class AuthError extends Error {}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  })
}
