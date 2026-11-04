"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { completeActivity, rescheduleActivity, createActivity } from "@/app/actions/activities";

type Opt = { value: string; label: string };
const RESULTS: Record<string, Opt[]> = {
  call: [
    { value: "done", label: "שיחה התקיימה" },
    { value: "no_answer", label: "אין מענה" },
    { value: "call_later", label: "ביקשו לחזור מאוחר יותר" },
    { value: "wrong_number", label: "מספר שגוי" },
  ],
  visit: [
    { value: "done", label: "ביקור בוצע" },
    { value: "postponed", label: "נדחה" },
    { value: "cancelled", label: "בוטל" },
  ],
  task: [
    { value: "done", label: "בוצעה" },
    { value: "cancelled", label: "בוטלה" },
  ],
};

export function CompleteForm({ id, type, isCoordination, defaultFollowDate }: { id: string; type: "call" | "visit" | "task"; isCoordination: boolean; defaultFollowDate: string }) {
  const [result, setResult] = useState(RESULTS[type][0].value);
  const [follow, setFollow] = useState<string>(type === "call" && isCoordination ? "" : "call");
  return (
    <ActionForm action={completeActivity} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-2">תוצאה</legend>
        <div className="grid grid-cols-2 gap-2">
          {RESULTS[type].map((r) => (
            <label key={r.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${result === r.value ? "border-brand bg-brand-soft font-medium" : "border-line"}`}>
              <input type="radio" name="result" value={r.value} checked={result === r.value} onChange={() => setResult(r.value)} className="accent-[var(--color-brand)]" />
              {r.label}
            </label>
          ))}
        </div>
        {type === "call" && result !== "done" && <p className="mt-1.5 text-xs text-ink-3">לא נספר כשיחה שהתקיימה.</p>}
      </fieldset>
      {isCoordination && result === "done" && (
        <label className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <input type="checkbox" name="visit_confirmed" className="accent-emerald-700" /> הלקוח אישר את מועד הביקור — לסמן את הביקור כמתואם
        </label>
      )}
      <Field label={type === "visit" ? "סיכום הביקור" : "סיכום / מה נאמר"}>
        <Textarea name="outcome" placeholder={type === "visit" ? "מה ראיתי, צרכים, ציוד, מי מקבל החלטה…" : ""} />
      </Field>
      <Field label="הצעד הבא">
        <Input name="next_step" placeholder="למשל: לשלוח מפרט AKIRA, לתאם ביקור עם מנהל הייצור" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="פעולת המשך">
          <Select name="follow_type" value={follow} onChange={(e) => setFollow(e.target.value)}>
            <option value="">ללא</option>
            <option value="call">שיחה</option>
            <option value="visit">ביקור (מוצע)</option>
            <option value="task">משימה</option>
          </Select>
        </Field>
        {follow && (
          <>
            <Field label="תאריך">
              <Input type="date" name="follow_date" defaultValue={defaultFollowDate} required />
            </Field>
            {follow !== "task" && (
              <Field label="שעה">
                <Input type="time" name="follow_time" defaultValue="10:00" step={900} required />
              </Field>
            )}
          </>
        )}
      </div>
      <div className="flex justify-end pt-1">
        <SubmitButton>שמירה</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function RescheduleForm({ id, date, time, type, status }: { id: string; date: string; time: string; type: string; status: string }) {
  return (
    <ActionForm action={rescheduleActivity} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="תאריך"><Input type="date" name="date" defaultValue={date} required /></Field>
        <Field label="שעה"><Input type="time" name="time" defaultValue={time} step={900} required={type !== "task"} /></Field>
      </div>
      {type === "visit" && status === "scheduled" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="keep_confirmed" /> הלקוח כבר אישר את המועד החדש
        </label>
      )}
      {type === "visit" && status === "scheduled" && <p className="text-xs text-ink-3">ביקור מתואם שמוזז חוזר למצב "מוצע" עד לאישור הלקוח.</p>}
      <div className="flex justify-end"><SubmitButton>העברה</SubmitButton></div>
    </ActionForm>
  );
}

export type CompanyOption = { id: string; name: string; sites: { id: string; label: string }[]; contacts: { id: string; label: string }[] };

export function NewActivityForm({
  companies,
  defaultCompanyId,
  defaultDate,
  defaultType = "call",
  owners,
  opportunityId,
}: {
  companies?: CompanyOption[];
  defaultCompanyId?: string;
  defaultDate: string;
  defaultType?: "call" | "visit" | "task";
  owners?: { id: string; name: string }[];
  opportunityId?: string;
}) {
  const [type, setType] = useState(defaultType);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? "");
  const [q, setQ] = useState("");
  const comp = companies?.find((c) => c.id === companyId);
  const filtered = (companies ?? []).filter((c) => !q || c.name.includes(q)).slice(0, 50);
  return (
    <ActionForm action={createActivity} className="space-y-4">
      {opportunityId && <input type="hidden" name="opportunity_id" value={opportunityId} />}
      <div className="grid grid-cols-3 gap-2">
        {(["call", "visit", "task"] as const).map((t) => (
          <label key={t} className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm ${type === t ? "border-brand bg-brand-soft font-medium" : "border-line"}`}>
            <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
            {{ call: "שיחה", visit: "ביקור", task: "משימה" }[t]}
          </label>
        ))}
      </div>
      {companies && !defaultCompanyId ? (
        <Field label="לקוח">
          <Input placeholder="חיפוש לפי שם…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
          <Select name="company_id" value={companyId} onChange={(e) => setCompanyId(e.target.value)} required={type !== "task"}>
            <option value="">{type === "task" ? "ללא לקוח" : "בחרו לקוח"}</option>
            {filtered.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="company_id" value={defaultCompanyId ?? ""} />
      )}
      {comp && type === "visit" && comp.sites.length > 0 && (
        <Field label="אתר">
          <Select name="site_id">{comp.sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select>
        </Field>
      )}
      {comp && comp.contacts.length > 0 && (
        <Field label="איש קשר">
          <Select name="contact_id"><option value="">—</option>{comp.contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
        </Field>
      )}
      {type === "task" && <Field label="כותרת המשימה"><Input name="title" required /></Field>}
      <Field label="מטרה"><Input name="purpose" placeholder={type === "visit" ? "היכרות, אפיון, הדגמה…" : ""} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={type === "task" ? "תאריך יעד" : "תאריך"}><Input type="date" name="date" defaultValue={defaultDate} required /></Field>
        {type !== "task" && <Field label="שעה"><Input type="time" name="time" defaultValue="10:00" step={900} required /></Field>}
      </div>
      {type === "visit" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="customer_confirmed" /> הביקור כבר תואם ואושר ע״י הלקוח
        </label>
      )}
      {owners && owners.length > 1 && (
        <Field label="אחראי">
          <Select name="owner_id"><option value="">אני</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
        </Field>
      )}
      <div className="flex justify-end"><SubmitButton>יצירה</SubmitButton></div>
    </ActionForm>
  );
}
