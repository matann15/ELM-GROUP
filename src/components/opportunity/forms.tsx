"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { saveOpportunity, moveStage } from "@/app/actions/opportunities";
import { STAGES, CURRENCIES, BRANDS } from "@/lib/labels";
import type { Opportunity } from "@/lib/types";

export function OpportunityForm({ companyId, opp, owners }: { companyId?: string; opp?: Opportunity; owners?: { id: string; name: string }[] }) {
  const [stage, setStage] = useState(opp?.stage ?? "new_lead");
  return (
    <ActionForm action={saveOpportunity} className="space-y-3">
      {opp ? <input type="hidden" name="id" value={opp.id} /> : <input type="hidden" name="company_id" value={companyId} />}
      <Field label="שם ההזדמנות"><Input name="title" defaultValue={opp?.title ?? ""} placeholder="למשל: מרכז עיבוד אנכי לקו חדש" required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="שלב">
          <Select name="stage" value={stage} onChange={(e) => setStage(e.target.value)}>{STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>
        </Field>
        <Field label="מותג רלוונטי">
          <Select name="brand" defaultValue={opp?.brand ?? ""}><option value="">טרם נקבע</option>{BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}</Select>
        </Field>
      </div>
      <Field label="דגם" hint="רק אם נקבע על בסיס אפיון אצל הלקוח"><Input name="model" defaultValue={opp?.model ?? ""} /></Field>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Field label="סכום" hint="השאירו ריק אם לא ידוע"><Input name="amount" inputMode="decimal" defaultValue={opp?.amount ?? ""} dir="ltr" /></Field>
        <Field label="מטבע"><Select name="currency" defaultValue={opp?.currency ?? "ILS"}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
      </div>
      <div className="grid grid-cols-[1fr_160px] gap-3">
        <Field label="הצעד הבא"><Input name="next_step" defaultValue={opp?.next_step ?? ""} /></Field>
        <Field label="תאריך"><Input type="date" name="next_step_date" defaultValue={opp?.next_step_date ?? ""} /></Field>
      </div>
      {stage === "lost" && <Field label="סיבת הפסד"><Textarea name="loss_reason" defaultValue={opp?.loss_reason ?? ""} required /></Field>}
      {stage !== "lost" && stage !== "won" && <Field label="סיבת השהיה (אם מושהה)"><Input name="hold_reason" defaultValue={opp?.hold_reason ?? ""} /></Field>}
      {owners && !opp && (
        <Field label="אחראי"><Select name="owner_id"><option value="">אני</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
      )}
      <div className="flex justify-end"><SubmitButton>שמירה</SubmitButton></div>
    </ActionForm>
  );
}

export function StageSelect({ id, stage }: { id: string; stage: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select
      aria-label="העברת שלב"
      disabled={pending}
      value={stage}
      className="h-8 rounded-md border border-line bg-white px-1.5 text-xs"
      onChange={(e) => {
        const v = e.target.value;
        start(async () => {
          const r = await moveStage(id, v);
          if (!r.ok) alert(r.error);
          router.refresh();
        });
      }}
    >
      {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select>
  );
}
