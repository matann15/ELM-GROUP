"use client";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { addNote, createCompany, saveContact, saveSite, updateCompany, deleteContact, deleteSite, resolveIssue } from "@/app/actions/companies";
import { CLASSIFICATION, COMPANY_STATUS, CONTACT_STATUS, PRIORITY, SOURCE_TYPE, VERIFICATION } from "@/lib/labels";
import { REGIONS, REGION_CODES } from "@/lib/geo";
import type { Company, Contact, Site } from "@/lib/types";

function Opts({ map }: { map: Record<string, string> }) {
  return <>{Object.entries(map).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</>;
}

export function NewCompanyForm({ owners }: { owners?: { id: string; name: string }[] }) {
  return (
    <ActionForm action={createCompany} className="space-y-3" redirectTo={(id) => `/customers/${id}`}>
      <Field label="שם החברה"><Input name="name" required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="טלפון"><Input name="phone" dir="ltr" inputMode="tel" /></Field>
        <Field label="אימייל"><Input name="email" type="email" dir="ltr" /></Field>
      </div>
      <Field label="כתובת" hint="רחוב ומספר, יישוב. תיבת דואר אינה יעד ניווט."><Input name="address" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="מצב"><Select name="status" defaultValue="prospect"><Opts map={COMPANY_STATUS} /></Select></Field>
        <Field label="תחום"><Select name="classification" defaultValue="unclassified"><Opts map={CLASSIFICATION} /></Select></Field>
      </div>
      <Field label="התמחות"><Input name="specialization" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="איש קשר"><Input name="contact_name" /></Field>
        <Field label="נייד איש קשר"><Input name="contact_phone" dir="ltr" inputMode="tel" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="מקור המידע"><Select name="source_type" defaultValue="field"><Opts map={SOURCE_TYPE} /></Select></Field>
        <Field label="קישור למקור"><Input name="source_url" dir="ltr" /></Field>
      </div>
      {owners && (
        <Field label="שיוך לאיש מכירות">
          <Select name="owner_id"><option value="">ללא שיוך</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" name="force" /> ליצור בכל זאת, גם אם קיימת חברה דומה</label>
      <div className="flex justify-end"><SubmitButton>יצירת לקוח</SubmitButton></div>
    </ActionForm>
  );
}

export function EditCompanyForm({ c, owners }: { c: Company; owners?: { id: string; name: string }[] }) {
  return (
    <ActionForm action={updateCompany} className="space-y-3">
      <input type="hidden" name="id" value={c.id} />
      <Field label="שם החברה"><Input name="name" defaultValue={c.name} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="מצב"><Select name="status" defaultValue={c.status}><Opts map={COMPANY_STATUS} /></Select></Field>
        <Field label="תחום פעילות (סיווג)"><Select name="classification" defaultValue={c.classification}><Opts map={CLASSIFICATION} /></Select></Field>
        <Field label="עדיפות"><Select name="priority" defaultValue={c.priority}><Opts map={PRIORITY} /></Select></Field>
        <Field label="מצב קשר"><Select name="contact_status" defaultValue={c.contact_status}><Opts map={CONTACT_STATUS} /></Select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="טלפון ראשי"><Input name="phone_main" defaultValue={c.phone_main ?? ""} dir="ltr" /></Field>
        <Field label="פקס"><Input name="fax" defaultValue={c.fax ?? ""} dir="ltr" /></Field>
        <Field label="אימייל"><Input name="email_main" defaultValue={c.email_main ?? ""} dir="ltr" /></Field>
        <Field label="אתר אינטרנט"><Input name="website" defaultValue={c.website ?? ""} dir="ltr" /></Field>
      </div>
      <Field label="התמחות (מהמקור)"><Input name="specialization" defaultValue={c.specialization ?? ""} /></Field>
      <Field label="תחומי פעילות" hint="רק אם ידוע"><Input name="activity_fields" defaultValue={c.activity_fields ?? ""} /></Field>
      <Field label="ציוד קיים" hint="רק אם ידוע — מכונות, יצרנים, גילאים"><Textarea name="equipment_known" defaultValue={c.equipment_known ?? ""} /></Field>
      <Field label="הערות"><Textarea name="notes" defaultValue={c.notes ?? ""} /></Field>
      {owners && (
        <Field label="איש מכירות אחראי">
          <Select name="owner_id" defaultValue={c.owner_id ?? ""}><option value="">ללא שיוך</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
        </Field>
      )}
      <div className="flex justify-end"><SubmitButton>שמירה</SubmitButton></div>
    </ActionForm>
  );
}

export function SourceForm({ c }: { c: Company }) {
  return (
    <ActionForm action={updateCompany} className="space-y-3">
      <input type="hidden" name="id" value={c.id} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="סוג המקור"><Select name="source_type" defaultValue={c.source_type}><Opts map={SOURCE_TYPE} /></Select></Field>
        <Field label="מצב אימות"><Select name="verification_status" defaultValue={c.verification_status}><Opts map={VERIFICATION} /></Select></Field>
      </div>
      <Field label="קישור למקור"><Input name="source_url" defaultValue={c.source_url ?? ""} dir="ltr" /></Field>
      <Field label="מה אומת ואיך" hint="למשל: טלפון אומת בשיחה 4/11; כתובת מאתר החברה"><Textarea name="source_note" defaultValue={c.source_note ?? ""} /></Field>
      <p className="text-xs text-ink-3">סימון "מאומת" או "מאומת חלקית" מעדכן את תאריך הבדיקה להיום.</p>
      <div className="flex justify-end"><SubmitButton>שמירה</SubmitButton></div>
    </ActionForm>
  );
}

const PROFILE_FIELDS: [keyof Company, string, string?][] = [
  ["materials", "חומרי עיבוד", "פלדה, נירוסטה, אלומיניום, טיטניום…"],
  ["part_size", "מידות חלק אופייניות", "קוטר/אורך או X×Y×Z במ״מ"],
  ["part_weight", "משקל חלק"],
  ["axes", "מספר צירים נדרש"],
  ["precision_req", "דיוק נדרש", "טולרנס במיקרון"],
  ["batch_size", "גודל סדרה"],
  ["bottleneck", "צוואר בקבוק בייצור"],
  ["budget", "תקציב"],
  ["investment_timing", "מועד השקעה"],
  ["decision_maker", "מקבל החלטה"],
];

export function ProfileForm({ c }: { c: Company }) {
  return (
    <ActionForm action={updateCompany} closeOnSuccess={false} className="space-y-3">
      <input type="hidden" name="id" value={c.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        {PROFILE_FIELDS.map(([k, label, hint]) => (
          <Field key={k} label={label}><Input name={k} defaultValue={(c[k] as string) ?? ""} placeholder={hint} /></Field>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="התאמה אפשרית ל-AKIRA SEIKI" hint="לפי האפיון בלבד. השאירו ריק אם עוד לא ידוע.">
          <Textarea name="fit_akira" defaultValue={c.fit_akira ?? ""} />
        </Field>
        <Field label="התאמה אפשרית ל-TAJMAC-ZPS" hint="לפי האפיון בלבד. השאירו ריק אם עוד לא ידוע.">
          <Textarea name="fit_zps" defaultValue={c.fit_zps ?? ""} />
        </Field>
      </div>
      <div className="flex justify-end"><SubmitButton>שמירת אפיון</SubmitButton></div>
    </ActionForm>
  );
}

export function SiteForm({ companyId, site }: { companyId: string; site?: Site }) {
  return (
    <ActionForm action={saveSite} className="space-y-3">
      <input type="hidden" name="company_id" value={companyId} />
      {site && <input type="hidden" name="id" value={site.id} />}
      <Field label="שם האתר"><Input name="label" defaultValue={site?.label ?? ""} placeholder="מפעל, הנהלה, אתר צפון…" /></Field>
      <Field label="כתובת מלאה (כפי שמופיעה במקור)"><Input name="address_raw" defaultValue={site?.address_raw ?? ""} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="רחוב ומספר (לניווט)"><Input name="street" defaultValue={site?.street ?? ""} /></Field>
        <Field label="יישוב"><Input name="city" defaultValue={site?.city ?? ""} /></Field>
        <Field label="מיקוד"><Input name="zip" defaultValue={site?.zip ?? ""} dir="ltr" /></Field>
        <Field label="אזור">
          <Select name="region_code" defaultValue={site?.region_code ?? ""}>
            <option value="">זיהוי אוטומטי</option>
            {REGION_CODES.map((r) => <option key={r} value={r}>{REGIONS[r].name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="region_confirmed" defaultChecked={site?.region_certain} /> האזור אומת</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="is_po_box" defaultChecked={site?.is_po_box} /> תיבת דואר</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="is_primary" defaultChecked={site?.is_primary} /> אתר ראשי</label>
      </div>
      <Field label="הערות"><Input name="notes" defaultValue={site?.notes ?? ""} /></Field>
      <p className="text-xs text-ink-3">כתובת נחשבת יעד ניווט רק כשיש רחוב ויישוב.</p>
      <div className="flex justify-end"><SubmitButton>שמירה</SubmitButton></div>
    </ActionForm>
  );
}

export function ContactForm({ companyId, contact, sites }: { companyId: string; contact?: Contact; sites: Site[] }) {
  return (
    <ActionForm action={saveContact} className="space-y-3">
      <input type="hidden" name="company_id" value={companyId} />
      {contact && <input type="hidden" name="id" value={contact.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="שם"><Input name="name" defaultValue={contact?.name ?? ""} required /></Field>
        <Field label="תפקיד"><Input name="role" defaultValue={contact?.role ?? ""} /></Field>
        <Field label="נייד"><Input name="mobile" defaultValue={contact?.mobile ?? ""} dir="ltr" inputMode="tel" /></Field>
        <Field label="טלפון"><Input name="phone" defaultValue={contact?.phone ?? ""} dir="ltr" inputMode="tel" /></Field>
      </div>
      <Field label="אימייל"><Input name="email" type="email" defaultValue={contact?.email ?? ""} dir="ltr" /></Field>
      {sites.length > 1 && (
        <Field label="אתר">
          <Select name="site_id" defaultValue={contact?.site_id ?? ""}><option value="">—</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.label || s.address_raw}</option>)}</Select>
        </Field>
      )}
      <Field label="הערות"><Input name="notes" defaultValue={contact?.notes ?? ""} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_primary" defaultChecked={contact?.is_primary} /> איש קשר ראשי</label>
      <div className="flex justify-end"><SubmitButton>שמירה</SubmitButton></div>
    </ActionForm>
  );
}

export function NoteForm({ companyId }: { companyId: string }) {
  return (
    <ActionForm action={addNote} closeOnSuccess={false} resetOnSuccess className="flex gap-2">
      <input type="hidden" name="company_id" value={companyId} />
      <Input name="body" placeholder="הוספת הערה…" required />
      <SubmitButton variant="secondary">הוספה</SubmitButton>
    </ActionForm>
  );
}

export function DeleteForm({ kind, id }: { kind: "site" | "contact"; id: string }) {
  return (
    <ActionForm action={kind === "site" ? deleteSite : deleteContact} closeOnSuccess={false}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-sm text-red-700 hover:underline"
        onClick={(e) => { if (!confirm("למחוק?")) e.preventDefault(); }}
      >
        מחיקה
      </button>
    </ActionForm>
  );
}

export function ResolveIssueForm({ id }: { id: string }) {
  return (
    <ActionForm action={resolveIssue} closeOnSuccess={false} className="flex gap-1">
      <input type="hidden" name="id" value={id} />
      <button type="submit" name="status" value="resolved" className="rounded px-2 py-0.5 text-xs text-emerald-800 hover:bg-emerald-50">טופל</button>
      <button type="submit" name="status" value="ignored" className="rounded px-2 py-0.5 text-xs text-ink-3 hover:bg-black/5">לא רלוונטי</button>
    </ActionForm>
  );
}
