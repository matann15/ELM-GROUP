-- ELM GROUP Sales — כל ההגדרות בקובץ אחד. להדביק ב-SQL Editor ולהריץ פעם אחת (Run).

-- ===== migrations/20261104000001_schema.sql =====
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

-- ===== migrations/20261104000002_security.sql =====
-- ELM GROUP Sales — functions, triggers, audit, Row Level Security

-- ───────────────────────── helper functions ─────────────────────────
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role = 'admin');
$$;

create or replace function public.can_access_company(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.companies c
    where c.id = cid and c.owner_id = auth.uid() and public.is_active_user()
  );
$$;

-- ───────────────────────── invite-only users ─────────────────────────
-- פרופיל נוצר לכל משתמש auth, אבל הוא פעיל רק אם קיימת לו הזמנה.
-- כך גם אם הרשמה ציבורית הופעלה בטעות — אין גישה לנתונים.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare inv public.invitations;
begin
  select * into inv from public.invitations i where lower(i.email) = lower(new.email);
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(inv.full_name, ''),
    coalesce(inv.role, 'sales'),
    inv.email is not null
  )
  on conflict (id) do nothing;
  if inv.email is not null then
    update public.invitations set accepted_at = now() where email = inv.email;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- משתמש שאינו מנהל אינו יכול לשנות לעצמו תפקיד או סטטוס
create or replace function public.protect_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email then
      raise exception 'רק מנהל יכול לשנות תפקיד או הרשאה';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile();

-- ───────────────────────── created/updated tracking ─────────────────────────
create or replace function public.set_tracking()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
    new.updated_by := auth.uid();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    -- שינוי של שדה חיפוש פנימי בלבד אינו נחשב עדכון
    if (to_jsonb(new) - 'search_text' - 'updated_at' - 'updated_by')
       is distinct from (to_jsonb(old) - 'search_text' - 'updated_at' - 'updated_by') then
      new.updated_at := now();
      new.updated_by := auth.uid();
    else
      new.updated_at := old.updated_at;
      new.updated_by := old.updated_by;
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['companies','company_sites','contacts','opportunities','plans','activities'] loop
    execute format('create trigger %I_tracking before insert or update on public.%I for each row execute function public.set_tracking()', t, t);
  end loop;
end $$;

-- ───────────────────────── audit log ─────────────────────────
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and (o - 'search_text' - 'updated_at' - 'updated_by') = (n - 'search_text' - 'updated_at' - 'updated_by') then
    return new;
  end if;
  insert into public.audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  values (tg_table_name, coalesce((n->>'id')::uuid, (o->>'id')::uuid), lower(tg_op), auth.uid(),
          o - 'search_text' - 'raw', n - 'search_text' - 'raw');
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['companies','company_sites','contacts','opportunities','plans','activities','profiles','data_issues','duplicate_candidates','blocked_days','recurring_meetings','research_sources','invitations'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end $$;
-- invitations has no id column → record_id stays null; email is in the jsonb.

-- ───────────────────────── ownership guards ─────────────────────────
create or replace function public.guard_owner_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() and new.owner_id is distinct from old.owner_id then
    raise exception 'רק מנהל יכול להעביר רשומה לאיש מכירות אחר';
  end if;
  return new;
end $$;
create trigger companies_owner_guard before update on public.companies for each row execute function public.guard_owner_change();
create trigger activities_owner_guard before update on public.activities for each row execute function public.guard_owner_change();
create trigger opportunities_owner_guard before update on public.opportunities for each row execute function public.guard_owner_change();

-- ───────────────────────── search text ─────────────────────────
create or replace function public.compute_company_search(cid uuid, cname text, cphone text, cemail text)
returns text language sql stable security definer set search_path = '' as $$
  select lower(concat_ws(' ',
    cname, cphone, regexp_replace(coalesce(cphone,''), '\D', '', 'g'), cemail,
    (select string_agg(concat_ws(' ', s.city, s.address_raw), ' ') from public.company_sites s where s.company_id = cid),
    (select string_agg(concat_ws(' ', ct.name, ct.phone, ct.mobile,
        regexp_replace(coalesce(ct.phone,'') || ' ' || coalesce(ct.mobile,''), '\D', '', 'g'), ct.email), ' ')
       from public.contacts ct where ct.company_id = cid)
  ));
$$;

create or replace function public.companies_search_trg()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.search_text := public.compute_company_search(new.id, new.name, new.phone_main, new.email_main);
  return new;
end $$;
create trigger companies_search before insert or update on public.companies
  for each row execute function public.companies_search_trg();

create or replace function public.child_search_trg()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cid uuid := coalesce(new.company_id, old.company_id);
begin
  update public.companies c set search_text = public.compute_company_search(c.id, c.name, c.phone_main, c.email_main)
  where c.id = cid;
  if tg_op = 'UPDATE' and old.company_id is distinct from new.company_id then
    update public.companies c set search_text = public.compute_company_search(c.id, c.name, c.phone_main, c.email_main)
    where c.id = old.company_id;
  end if;
  return coalesce(new, old);
end $$;
create trigger sites_search after insert or update or delete on public.company_sites for each row execute function public.child_search_trg();
create trigger contacts_search after insert or update or delete on public.contacts for each row execute function public.child_search_trg();

-- ───────────────────────── manual merge (admin, explicit) ─────────────────────────
-- אין איחוד אוטומטי. המנהל בוחר: "אותה חברה" או "אתרים של אותה חברה".
-- הרשומה המאוחדת אינה נמחקת: היא מסומנת merged_into ולא רלוונטית, והנתונים המקוריים נשמרים.
create or replace function public.merge_companies(keep_id uuid, drop_id uuid, candidate_id uuid, as_sites boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'רק מנהל יכול לאחד רשומות'; end if;
  if keep_id = drop_id then raise exception 'לא ניתן לאחד רשומה עם עצמה'; end if;
  update public.company_sites set company_id = keep_id, is_primary = false,
    label = coalesce(label, case when as_sites then 'אתר נוסף' else 'כתובת מרשומה מאוחדת' end)
    where company_id = drop_id;
  update public.contacts set company_id = keep_id, is_primary = false where company_id = drop_id;
  update public.activities set company_id = keep_id where company_id = drop_id;
  update public.opportunities set company_id = keep_id where company_id = drop_id;
  update public.data_issues set company_id = keep_id where company_id = drop_id and status <> 'open';
  delete from public.data_issues where company_id = drop_id and status = 'open'
    and kind in (select kind from public.data_issues where company_id = keep_id and status = 'open');
  update public.data_issues set company_id = keep_id where company_id = drop_id;
  update public.companies set merged_into = keep_id, status = 'irrelevant',
    notes = concat_ws(E'\n', notes, 'אוחד לרשומה ' || keep_id::text || ' ב-' || to_char(now() at time zone 'Asia/Jerusalem', 'DD/MM/YYYY'))
    where id = drop_id;
  update public.duplicate_candidates
     set status = case when as_sites then 'sites_of_same_company'::public.duplicate_status else 'merged'::public.duplicate_status end,
         resolved_by = auth.uid(), resolved_at = now()
   where id = candidate_id;
end $$;

-- ───────────────────────── Row Level Security ─────────────────────────
alter table public.invitations enable row level security;
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_sites enable row level security;
alter table public.contacts enable row level security;
alter table public.opportunities enable row level security;
alter table public.plans enable row level security;
alter table public.activities enable row level security;
alter table public.blocked_days enable row level security;
alter table public.recurring_meetings enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.data_issues enable row level security;
alter table public.duplicate_candidates enable row level security;
alter table public.research_sources enable row level security;
alter table public.audit_log enable row level security;

-- invitations: admin only
create policy invitations_admin on public.invitations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles: active users see names of colleagues; self or admin may update (role/active guarded by trigger)
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active_user());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- companies
create policy companies_select on public.companies for select to authenticated
  using (public.is_admin() or (owner_id = auth.uid() and public.is_active_user()));
create policy companies_insert on public.companies for insert to authenticated
  with check (public.is_admin() or (owner_id = auth.uid() and public.is_active_user()));
create policy companies_update on public.companies for update to authenticated
  using (public.is_admin() or (owner_id = auth.uid() and public.is_active_user()))
  with check (public.is_admin() or owner_id = auth.uid());
create policy companies_delete on public.companies for delete to authenticated
  using (public.is_admin());

-- sites & contacts follow company access
create policy sites_all on public.company_sites for all to authenticated
  using (public.can_access_company(company_id)) with check (public.can_access_company(company_id));
create policy contacts_all on public.contacts for all to authenticated
  using (public.can_access_company(company_id)) with check (public.can_access_company(company_id));

-- opportunities
create policy opps_select on public.opportunities for select to authenticated
  using (public.can_access_company(company_id));
create policy opps_insert on public.opportunities for insert to authenticated
  with check (public.can_access_company(company_id) and (public.is_admin() or owner_id = auth.uid()));
create policy opps_update on public.opportunities for update to authenticated
  using (public.can_access_company(company_id))
  with check (public.can_access_company(company_id));
create policy opps_delete on public.opportunities for delete to authenticated
  using (public.is_admin());

-- activities
create policy acts_select on public.activities for select to authenticated
  using (public.is_admin() or (owner_id = auth.uid() and public.is_active_user()));
create policy acts_insert on public.activities for insert to authenticated
  with check (public.is_admin() or (owner_id = auth.uid() and public.is_active_user()
              and (company_id is null or public.can_access_company(company_id))));
create policy acts_update on public.activities for update to authenticated
  using (public.is_admin() or (owner_id = auth.uid() and public.is_active_user()))
  with check (public.is_admin() or (owner_id = auth.uid() and (company_id is null or public.can_access_company(company_id))));
create policy acts_delete on public.activities for delete to authenticated
  using (public.is_admin() or (owner_id = auth.uid() and status = 'proposed'));

-- plans, blocked days, recurring meetings: owner or admin
create policy plans_all on public.plans for all to authenticated
  using (public.is_admin() or (owner_id = auth.uid() and public.is_active_user()))
  with check (public.is_admin() or (owner_id = auth.uid() and public.is_active_user()));
create policy blocked_all on public.blocked_days for all to authenticated
  using (public.is_admin() or (owner_id = auth.uid() and public.is_active_user()))
  with check (public.is_admin() or (owner_id = auth.uid() and public.is_active_user()));
create policy recurring_all on public.recurring_meetings for all to authenticated
  using (public.is_admin() or (owner_id = auth.uid() and public.is_active_user()))
  with check (public.is_admin() or (owner_id = auth.uid() and public.is_active_user()));

-- import & duplicates: admin only
create policy import_batches_admin on public.import_batches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy import_rows_admin on public.import_rows for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy dups_admin on public.duplicate_candidates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- data issues follow company access
create policy issues_select on public.data_issues for select to authenticated
  using (public.can_access_company(company_id));
create policy issues_insert on public.data_issues for insert to authenticated
  with check (public.can_access_company(company_id));
create policy issues_update on public.data_issues for update to authenticated
  using (public.can_access_company(company_id)) with check (public.can_access_company(company_id));
create policy issues_delete on public.data_issues for delete to authenticated
  using (public.is_admin());

-- research: admin full; sales see/add their own suggestions
create policy research_select on public.research_sources for select to authenticated
  using (public.is_admin() or (created_by = auth.uid() and public.is_active_user()));
create policy research_insert on public.research_sources for insert to authenticated
  with check (public.is_active_user() and (public.is_admin() or created_by = auth.uid()));
create policy research_update on public.research_sources for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy research_delete on public.research_sources for delete to authenticated
  using (public.is_admin());

-- audit: admin read only; written by security-definer trigger
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_admin());

-- ───────────────────────── grants ─────────────────────────
-- anon (לא מחובר) אינו מקבל שום גישה לטבלאות.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke execute on function public.merge_companies(uuid, uuid, uuid, boolean) from public;
revoke execute on function public.handle_new_user() from public;
grant execute on function public.is_admin(), public.is_active_user(), public.can_access_company(uuid),
  public.merge_companies(uuid, uuid, uuid, boolean) to authenticated;
-- audit_log: only select for authenticated (RLS further limits to admin)
revoke insert, update, delete on public.audit_log from authenticated;

-- ===== migrations/20261104000003_notes.sql =====
-- הערות חופשיות בכרטיס לקוח (היסטוריה)
create table public.company_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  body text not null check (length(body) between 1 and 5000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index company_notes_company_idx on public.company_notes (company_id, created_at desc);
alter table public.company_notes enable row level security;
create policy notes_select on public.company_notes for select to authenticated using (public.can_access_company(company_id));
create policy notes_insert on public.company_notes for insert to authenticated
  with check (public.can_access_company(company_id) and created_by = auth.uid());
create policy notes_delete on public.company_notes for delete to authenticated using (public.is_admin() or created_by = auth.uid());
create trigger company_notes_audit after insert or update or delete on public.company_notes for each row execute function public.audit_row();
grant select, insert, delete on public.company_notes to authenticated;
revoke all on public.company_notes from anon;
