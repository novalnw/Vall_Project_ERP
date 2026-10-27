// ============================================================
// Edge Function: super-task
// Membaca struk/nota dari Storage lalu meminta Gemini membaca
// dan mengekstrak data terstruktur ke tabel 'documents'.
//
// Deploy:
//   supabase secrets set GEMINI_API_KEY=xxx
//   supabase functions deploy super-task --no-verify-jwt
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const geminiKey = Deno.env.get('GEMINI_API_KEY')

const supabase = createClient(supabaseUrl, supabaseKey)

const MODEL = 'gemini-3.8-flash'

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
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors() })
  }

  try {
    const { document_id } = await req.json()
    if (!document_id) throw new Error('document_id wajib diisi')

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
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return json({ ok: false, error: msg }, 400)
  }
})

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
