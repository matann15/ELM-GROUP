"use client";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field, Input, Select } from "@/components/ui";
import { inviteUser, updateUser, updateMyProfile } from "@/app/actions/users";
import { CITIES } from "@/lib/geo";
import type { Profile } from "@/lib/types";

export function InviteForm() {
  return (
    <ActionForm action={inviteUser} closeOnSuccess={false} resetOnSuccess className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <Field label="אימייל"><Input name="email" type="email" dir="ltr" required /></Field>
      <Field label="שם מלא"><Input name="full_name" /></Field>
      <Field label="תפקיד"><Select name="role" defaultValue="sales"><option value="sales">איש מכירות</option><option value="admin">מנהל</option></Select></Field>
      <SubmitButton>שליחת הזמנה</SubmitButton>
    </ActionForm>
  );
}

export function UserRow({ p }: { p: Profile }) {
  return (
    <ActionForm action={updateUser} closeOnSuccess={false} className="grid gap-2 sm:grid-cols-[1fr_1fr_140px_100px_auto] sm:items-center">
      <input type="hidden" name="id" value={p.id} />
      <Input name="full_name" defaultValue={p.full_name} aria-label="שם" />
      <span className="ltr truncate text-sm text-ink-3">{p.email}</span>
      <Select name="role" defaultValue={p.role}><option value="sales">איש מכירות</option><option value="admin">מנהל</option></Select>
      <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} /> פעיל</label>
      <SubmitButton variant="secondary">שמירה</SubmitButton>
    </ActionForm>
  );
}

export function MyProfileForm({ p }: { p: Profile }) {
  return (
    <ActionForm action={updateMyProfile} closeOnSuccess={false} className="max-w-md space-y-3">
      <Field label="שם מלא"><Input name="full_name" defaultValue={p.full_name} /></Field>
      <Field label="טלפון"><Input name="phone" defaultValue={p.phone ?? ""} dir="ltr" /></Field>
      <Field label="נקודת יציאה קבועה" hint="משמשת לתכנון ולהערכת נסיעות">
        <Input name="home_base" list="cities-p" defaultValue={p.home_base} />
        <datalist id="cities-p">{CITIES.map((c) => <option key={c.name} value={c.name} />)}</datalist>
      </Field>
      <SubmitButton>שמירה</SubmitButton>
    </ActionForm>
  );
}
