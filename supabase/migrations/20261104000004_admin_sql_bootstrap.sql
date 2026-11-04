-- תיקון: הגנות התפקיד והבעלות חלות על משתמשים מחוברים (בקשות מהאתר).
-- SQL שמורץ מלוח הבקרה של Supabase (ללא משתמש מחובר, auth.uid() = null) אינו נחסם — נדרש להקמת המנהל הראשון.
-- משתמש אנונימי אינו יכול להגיע לכאן: אין לו הרשאות על הטבלאות.
create or replace function public.protect_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email then
      raise exception 'רק מנהל יכול לשנות תפקיד או הרשאה';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.guard_owner_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() and new.owner_id is distinct from old.owner_id then
    raise exception 'רק מנהל יכול להעביר רשומה לאיש מכירות אחר';
  end if;
  return new;
end $$;
