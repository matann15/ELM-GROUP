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
