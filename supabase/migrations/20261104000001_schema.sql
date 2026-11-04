-- ELM GROUP Sales — core schema
-- All timestamps are timestamptz (UTC in storage). The app renders and plans in Asia/Jerusalem.

create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- ───────────────────────── enums ─────────────────────────
create type public.user_role as enum ('admin', 'sales');
create type public.company_status as enum ('existing', 'past', 'prospect', 'irrelevant');
create type public.company_classification as enum ('machining', 'sheet_metal', 'supplier', 'service', 'plastic', 'other', 'unclassified');
create type public.contact_status as enum ('not_contacted', 'attempted', 'reached', 'meeting_set', 'do_not_contact');
create type public.verification_status as enum ('unverified', 'partial', 'verified', 'conflict');
create type public.priority_level as enum ('high', 'medium', 'low');
create type public.activity_type as enum ('call', 'visit', 'task');
create type public.activity_status as enum ('proposed', 'scheduled', 'done', 'no_answer', 'cancelled', 'postponed');
create type public.opportunity_stage as enum ('new_lead', 'contacted', 'visit_set', 'technical', 'quote', 'negotiation', 'won', 'lost');
create type public.issue_status as enum ('open', 'resolved', 'ignored');
create type public.duplicate_status as enum ('open', 'merged', 'sites_of_same_company', 'not_duplicate');
create type public.source_type as enum ('company_site', 'business_directory', 'original_list', 'field', 'unverified');

-- ───────────────────────── users ─────────────────────────
create table public.invitations (
  email text primary key,
  role public.user_role not null default 'sales',
  full_name text,
  invited_by uuid,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.user_role not null default 'sales',
  active boolean not null default false,
  phone text,
  home_base text not null default 'קריית ביאליק',
  home_base_region text not null default 'haifa_krayot',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── companies ─────────────────────────
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_normalized text not null default '',
  status public.company_status not null default 'prospect',
  classification public.company_classification not null default 'unclassified',
  classification_suggested public.company_classification,
  classification_confirmed boolean not null default false,
  specialization text,
  activity_fields text,           -- תחומי פעילות (רק אם ידוע)
  equipment_known text,           -- ציוד קיים (רק אם ידוע)
  owner_id uuid references public.profiles (id) on delete set null,
  priority public.priority_level not null default 'medium',
  contact_status public.contact_status not null default 'not_contacted',
  verification_status public.verification_status not null default 'unverified',
  last_verified_at timestamptz,
  last_contact_at timestamptz,
  phone_main text,                -- תמיד מחרוזת
  fax text,
  email_main text,
  website text,
  source_type public.source_type not null default 'original_list',
  source_note text,
  source_url text,
  -- אפיון טכני
  materials text,
  part_size text,
  part_weight text,
  axes text,
  precision_req text,
  batch_size text,
  bottleneck text,
  budget text,
  investment_timing text,
  decision_maker text,
  fit_akira text,                 -- התאמה אפשרית ל-AKIRA SEIKI, על בסיס אפיון בלבד
  fit_zps text,                   -- התאמה אפשרית ל-TAJMAC-ZPS, על בסיס אפיון בלבד
  notes text,
  raw jsonb,                      -- השורה המקורית מהייבוא, ללא שינוי
  import_key text,
  merged_into uuid references public.companies (id),
  search_text text not null default '',
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index companies_import_key_uq on public.companies (import_key) where import_key is not null;
create index companies_owner_idx on public.companies (owner_id);
create index companies_search_trgm on public.companies using gin (search_text gin_trgm_ops);

create table public.company_sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  label text,
  address_raw text,
  street text,
  city text,
  zip text,
  is_po_box boolean not null default false,
  navigable boolean not null default false,
  region_code text,
  region_certain boolean not null default false,
  is_primary boolean not null default false,
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index company_sites_company_idx on public.company_sites (company_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  site_id uuid references public.company_sites (id) on delete set null,
  name text not null default '',
  role text,
  phone text,
  mobile text,
  email text,
  is_primary boolean not null default false,
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_company_idx on public.contacts (company_id);

-- ───────────────────────── opportunities ─────────────────────────
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  title text not null,
  stage public.opportunity_stage not null default 'new_lead',
  brand text check (brand in ('AKIRA SEIKI', 'TAJMAC-ZPS')),
  model text,                     -- רק כשנקבע על בסיס אפיון
  amount numeric(14, 2),          -- ריק כשלא ידוע
  currency text check (currency in ('ILS', 'USD', 'EUR')),
  next_step text,
  next_step_date date,
  loss_reason text,
  hold_reason text,
  closed_at timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint amount_needs_currency check (amount is null or currency is not null)
);
create index opportunities_company_idx on public.opportunities (company_id);
create index opportunities_owner_idx on public.opportunities (owner_id);

-- ───────────────────────── planning ─────────────────────────
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  home_base text not null,
  settings jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,   -- טיפול בשבועות חלקיים, חוסרים, אזהרות
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  type public.activity_type not null,
  status public.activity_status not null default 'scheduled',
  owner_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  site_id uuid references public.company_sites (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  opportunity_id uuid references public.opportunities (id) on delete set null,
  plan_id uuid references public.plans (id) on delete set null,
  related_visit_id uuid references public.activities (id) on delete set null, -- שיחת תיאום → הביקור
  title text,
  purpose text,
  starts_at timestamptz,          -- null = משימה ללא שעה
  ends_at timestamptz,
  due_date date,                  -- למשימות
  customer_confirmed boolean not null default false,
  outcome text,
  next_step text,
  follow_up_date date,
  completed_at timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create index activities_owner_start_idx on public.activities (owner_id, starts_at);
create index activities_owner_due_idx on public.activities (owner_id, due_date);
create index activities_company_idx on public.activities (company_id);

create table public.blocked_days (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  kind text not null default 'blocked' check (kind in ('vacation', 'blocked', 'holiday', 'office')),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (owner_id, day)
);

create table public.recurring_meetings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = ראשון
  start_time time not null,
  end_time time not null,
  title text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

-- ───────────────────────── data quality / import ─────────────────────────
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  status text not null default 'preview' check (status in ('preview', 'committed', 'cancelled')),
  headers jsonb not null default '[]'::jsonb,
  rows jsonb not null default '[]'::jsonb,
  mapping jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create table public.import_rows (
  id bigserial primary key,
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  row_number int not null,
  raw jsonb not null,
  company_id uuid references public.companies (id) on delete set null,
  action text not null check (action in ('created', 'matched', 'matched_changed', 'skipped_empty'))
);

create table public.data_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null,             -- missing_phone, missing_address, po_box, region_uncertain, classification, conflict, missing_contact, phone_invalid, notes_in_wrong_column
  detail text,
  status public.issue_status not null default 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index data_issues_open_uq on public.data_issues (company_id, kind) where status = 'open';

create table public.duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  company_a uuid not null references public.companies (id) on delete cascade,
  company_b uuid not null references public.companies (id) on delete cascade,
  reasons text[] not null,
  score int not null default 0,
  status public.duplicate_status not null default 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (company_a < company_b),
  unique (company_a, company_b)
);

create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete set null,
  proposed_name text not null,
  proposed_city text,
  proposed_phone text,
  proposed_specialization text,
  url text not null,
  source_type public.source_type not null,
  checked_at date not null default current_date,
  verified_fields text[] not null default '{}',
  notes text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigserial primary key,
  table_name text not null,
  record_id uuid,
  action text not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);
create index audit_log_record_idx on public.audit_log (record_id, changed_at desc);
