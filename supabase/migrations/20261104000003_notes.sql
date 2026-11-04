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
