"use client";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { previewPlan, savePlan, type PreviewResult } from "@/app/actions/plan";
import { Field, Input, Select, Notice, Badge, btnClass } from "@/components/ui";

import { CITIES, regionName } from "@/lib/geo";
import { formatHebDate } from "@/lib/time";
import type { ActionResult } from "@/lib/types";

export function PlanBuilder({ owners, defaultOwner, defaultMonth, defaultFrom, defaultHome }: { owners?: { id: string; name: string }[]; defaultOwner: string; defaultMonth: string; defaultFrom: string; defaultHome: string }) {
  const [preview, previewAction, previewPending] = useActionState<PreviewResult | null, FormData>(previewPlan, null);
  const [saved, saveAction] = useActionState<ActionResult | null, FormData>(savePlan, null);
  const [mode, setMode] = useState<"month" | "range">("month");
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => setUnchecked(new Set()), [preview]);
  const byDay = useMemo(() => {
    if (!preview?.ok) return [];
    const m = new Map<string, typeof preview.plan.proposals>();
    for (const p of preview.plan.proposals) m.set(p.date, [...(m.get(p.date) ?? []), p]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [preview]);

  return (
    <form ref={formRef} className="space-y-5" action={previewAction}>
      <div className="rounded-xl border border-line bg-white p-4">
        <div className="mb-3 flex gap-2">
          {(["month", "range"] as const).map((m) => (
            <label key={m} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${mode === m ? "border-brand bg-brand-soft font-medium" : "border-line"}`}>
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
              {m === "month" ? "חודש" : "תקופה חופשית"}
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {mode === "month" ? (
            <>
              <Field label="חודש"><Input type="month" name="month" defaultValue={defaultMonth} required /></Field>
              <Field label="תאריך התחלה" hint="ימים שלפניו לא יתוכננו"><Input type="date" name="from" defaultValue={defaultFrom} /></Field>
            </>
          ) : (
            <>
              <Field label="מתאריך"><Input type="date" name="start" defaultValue={defaultFrom} required /></Field>
              <Field label="עד תאריך"><Input type="date" name="end" required /></Field>
            </>
          )}
          <Field label="נקודת יציאה">
            <Input name="home_base" list="cities" defaultValue={defaultHome} />
            <datalist id="cities">{CITIES.map((c) => <option key={c.name} value={c.name} />)}</datalist>
          </Field>
          {owners && (
            <Field label="איש מכירות">
              <Select name="owner_id" defaultValue={defaultOwner}>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
            </Field>
          )}
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-ink-2">כללי תכנון</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <Field label="ימי שטח בשבוע מלא"><Input type="number" name="field_days" defaultValue={3} min={0} max={5} /></Field>
            <Field label="שיחות ביום (מינימום)"><Input type="number" name="calls_per_day" defaultValue={3} min={0} max={20} /></Field>
            <Field label="ביקורים ביום שטח — מינימום"><Input type="number" name="min_visits" defaultValue={2} min={1} max={5} /></Field>
            <Field label="מקסימום"><Input type="number" name="max_visits" defaultValue={3} min={1} max={6} /></Field>
          </div>
          <p className="mt-2 text-xs text-ink-3">ימי עבודה: א׳–ה׳. ימים חסומים, חופשות ופגישות קבועות מוגדרים למטה. זמני נסיעה הם הערכה לפי מרחק אווירי בין יישובים.</p>
        </details>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" name="replace_previous" /> להחליף ביקורים מוצעים מתוכניות קודמות בתקופה שעדיין לא תואמו (ביקורים מתואמים ופעולות שבוצעו לא ייגעו)
        </label>
        <div className="mt-4 flex gap-2">
          <button type="submit" className={btnClass("primary", "md")} disabled={previewPending}>{previewPending ? "מחשב…" : "תצוגה מקדימה"}</button>
        </div>
      </div>

      {preview && !preview.ok && <Notice tone="red">{preview.error}</Notice>}
      {preview?.ok && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-white p-4">
            <h2 className="mb-2 font-semibold">סיכום התצוגה המקדימה</h2>
            <p className="text-sm text-ink-2">
              {preview.plan.proposals.filter((p) => p.type === "visit").length} ביקורים מוצעים ·{" "}
              {preview.plan.proposals.filter((p) => p.type === "call").length} שיחות · מתוך {preview.companyCount} לקוחות משויכים · יציאה מ{preview.homeBase} ·{" "}
              {preview.existingCount} פעולות קיימות בתקופה נשמרות כמו שהן
              {preview.replaceableCount ? ` · ${preview.replaceableCount} הצעות קודמות יוחלפו` : ""}
            </p>
            <h3 className="mb-1 mt-3 text-sm font-semibold">טיפול בשבועות</h3>
            <ul className="list-disc space-y-0.5 ps-5 text-sm text-ink-2">{preview.plan.weeks.map((w) => <li key={w.weekStart}>{w.explanation}</li>)}</ul>
            {preview.plan.shortages.length > 0 && (
              <div className="mt-3"><Notice><b>חוסרים:</b><ul className="mt-1 list-disc ps-5">{preview.plan.shortages.map((s, i) => <li key={i}>{s}</li>)}</ul></Notice></div>
            )}
            {preview.plan.notes.length > 0 && (
              <div className="mt-3"><Notice tone="blue"><ul className="list-disc ps-5">{preview.plan.notes.map((s, i) => <li key={i}>{s}</li>)}</ul></Notice></div>
            )}
            {preview.plan.issues.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-ink-2">{preview.plan.issues.length} אזהרות כללי תכנון</summary>
                <ul className="mt-1 list-disc ps-5 text-ink-2">{preview.plan.issues.map((s, i) => <li key={i} className={s.level === "error" ? "text-red-700" : ""}>{s.message}{s.date ? ` (${s.date.split("-").reverse().slice(0, 2).join("/")})` : ""}</li>)}</ul>
              </details>
            )}
          </div>

          {byDay.map(([day, items]) => (
            <section key={day} className="rounded-xl border border-line bg-white">
              <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <h3 className="font-semibold">{formatHebDate(day)}</h3>
                <span className="text-sm text-ink-3">
                  {items.filter((i) => i.type === "visit").length ? `יום שטח · ${[...new Set(items.filter((i) => i.type === "visit").map((i) => regionName(i.region)))].join(", ")}` : "יום משרד"}
                </span>
              </header>
              <ul className="divide-y divide-line">
                {items.map((p) => (
                  <li key={p.key} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={!unchecked.has(p.key)}
                      onChange={(e) => {
                        e.stopPropagation();
                        const n = new Set(unchecked);
                        if (e.target.checked) n.delete(p.key); else n.add(p.key);
                        setUnchecked(n);
                      }}
                      className="mt-1 size-4 accent-[var(--color-brand)]"
                      aria-label={`לכלול ${p.companyName}`}
                    />
                    <span className="ltr tabular w-12 shrink-0 font-medium">{p.start}</span>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{p.companyName}</span>{" "}
                      <Badge tone={p.type === "visit" ? "violet" : "brand"}>{p.type === "visit" ? "ביקור מוצע" : "שיחה"}</Badge>
                      <p className="text-ink-3">{p.purpose}{p.type === "visit" && p.driveEstimateMin ? ` · נסיעה משוערת ~${p.driveEstimateMin} דק׳` : ""}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {byDay.length === 0 && <Notice>לא נוצרו הצעות. בדקו את החוסרים למעלה — ייתכן שאין לקוחות משויכים, שאין כתובות ניווט, או שכל הימים חסומים.</Notice>}

          {byDay.length > 0 && (
            <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-line bg-white p-3 shadow-lg lg:bottom-4">
              <span className="text-sm">{preview.plan.proposals.length - unchecked.size} פעולות ייכנסו ליומן. אפשר להזיז ולעדכן אחר כך.</span>
              <button
                type="button"
                className={btnClass("primary", "md")}
                onClick={() => {
                  const fd = new FormData(formRef.current!);
                  preview.plan.proposals.filter((p) => !unchecked.has(p.key)).forEach((p) => fd.append("keys", p.key));
                  startTransition(() => saveAction(fd));
                }}
              >
                שמירת התוכנית
              </button>
            </div>
          )}
        </div>
      )}
      {saved && !saved.ok && <Notice tone="red">{saved.error}</Notice>}
      {saved?.ok && (
        <Notice tone="green">
          {saved.message}{" "}
          <button type="button" className="font-medium underline" onClick={() => router.push("/calendar?view=month")}>לצפייה ביומן</button>
        </Notice>
      )}
    </form>
  );
}

