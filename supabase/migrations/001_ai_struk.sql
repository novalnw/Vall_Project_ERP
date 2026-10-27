-- ============================================================
-- AI Struk: tabel, storage, dan kebijakan akses
-- Jalankan di Supabase Dashboard -> SQL Editor untuk database ERP
-- ============================================================

-- ---------- Template dokumen ----------
create table if not exists public.doc_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fields jsonb not null default '[]'::jsonb,
  line_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Dokumen (struk/nota) ----------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  file_path text not null,
  file_name text,
  status text not null default 'uploaded'
    check (status in ('uploaded','processing','needs_review','verified','exported','failed')),
  confidence numeric,
  template_id uuid references public.doc_templates(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  lines jsonb not null default '[]'::jsonb,
  flags jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists documents_created_idx on public.documents(created_at desc);
create index if not exists documents_status_idx on public.documents(status);

-- ---------- RLS: hanya staf yang sudah login ----------
alter table public.doc_templates enable row level security;
alter table public.documents enable row level security;

drop policy if exists "documents all auth" on public.documents;
create policy "documents all auth" on public.documents
  for all to authenticated using (true) with check (true);

drop policy if exists "doc_templates read auth" on public.doc_templates;
create policy "doc_templates read auth" on public.doc_templates
  for select to authenticated using (true);

-- ---------- Storage bucket 'receipts' ----------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts all auth" on storage.objects;
create policy "receipts all auth" on storage.objects
  for all to authenticated using (bucket_id = 'receipts') with check (bucket_id = 'receipts');

-- ---------- Seed template default ----------
insert into public.doc_templates (name, fields, line_fields)
values (
  'Struk / Nota',
  '[
    {"key":"store","label":"Toko / Usaha","type":"text","required":true},
    {"key":"date","label":"Tanggal","type":"date","required":true},
    {"key":"subtotal","label":"Subtotal","type":"number","required":true},
    {"key":"tax","label":"Pajak","type":"number"},
    {"key":"total","label":"Total","type":"number","required":true},
    {"key":"payment_method","label":"Cara bayar","type":"text"}
  ]'::jsonb,
  '[
    {"key":"name","label":"Nama barang","type":"text","required":true},
    {"key":"qty","label":"Qty","type":"number","required":true},
    {"key":"unit_price","label":"Harga satuan","type":"number","required":true},
    {"key":"subtotal","label":"Subtotal","type":"number","required":true}
  ]'::jsonb
) on conflict do nothing;
