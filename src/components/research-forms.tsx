"use client";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field, Input, Select, Textarea, btnClass } from "@/components/ui";
import { addResearchSource, uploadResearchCsv, acceptResearch, rejectResearch } from "@/app/actions/research";

export function ResearchForm() {
  return (
    <ActionForm action={addResearchSource} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="שם החברה"><Input name="proposed_name" required /></Field>
        <Field label="יישוב"><Input name="proposed_city" /></Field>
        <Field label="טלפון (כפי שמופיע במקור)"><Input name="proposed_phone" dir="ltr" /></Field>
        <Field label="תחום"><Input name="proposed_specialization" /></Field>
      </div>
      <Field label="קישור למקור" hint="חובה — הדף שבו נמצא המידע"><Input name="url" type="url" dir="ltr" required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="סוג המקור">
          <Select name="source_type" defaultValue="company_site">
            <option value="company_site">אתר החברה</option>
            <option value="business_directory">מדריך עסקי</option>
            <option value="unverified">לא אומת</option>
          </Select>
        </Field>
        <Field label="תאריך בדיקה"><Input type="date" name="checked_at" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink-2">מה אומת מול המקור</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {[["name", "שם"], ["city", "יישוב"], ["address", "כתובת"], ["phone", "טלפון"], ["specialization", "תחום"]].map(([k, l]) => (
            <label key={k} className="flex items-center gap-1.5"><input type="checkbox" name="verified_fields" value={k} /> {l}</label>
          ))}
        </div>
      </fieldset>
      <Field label="הערות / סתירות"><Textarea name="notes" /></Field>
      <div className="flex justify-end"><SubmitButton>הוספה לבדיקה</SubmitButton></div>
    </ActionForm>
  );
}

export function ResearchCsvForm() {
  return (
    <ActionForm action={uploadResearchCsv} closeOnSuccess={false} className="flex flex-wrap items-center gap-3">
      <input type="file" name="file" accept=".csv" required className="text-sm file:me-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-brand-dark" />
      <SubmitButton variant="secondary">טעינת קובץ מחקר</SubmitButton>
    </ActionForm>
  );
}

export function ResearchDecision({ id }: { id: string }) {
  return (
    <div className="flex gap-2">
      <ActionForm action={acceptResearch} closeOnSuccess={false}><input type="hidden" name="id" value={id} /><button className={btnClass("soft", "sm")}>אישור והוספה</button></ActionForm>
      <ActionForm action={rejectResearch} closeOnSuccess={false}><input type="hidden" name="id" value={id} /><button className={btnClass("ghost", "sm")}>דחייה</button></ActionForm>
    </div>
  );
}
