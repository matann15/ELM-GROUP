import { requireUser } from "@/lib/auth";
import { listProfiles, resolveViewedUser } from "@/lib/queries";
import { todayLocal, formatHebDate, HEB_WEEKDAYS, formatDateTime } from "@/lib/time";
import { BLOCK_KIND } from "@/lib/labels";
import { Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client";
import { PlanBuilder } from "@/components/plan/builder";
import { UserPicker } from "@/components/user-picker";
import { addBlockedDays, addRecurring, removeBlockedDay, removeRecurring } from "@/app/actions/plan";

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser();
  const uid = resolveViewedUser(profile, sp.user);
  const isAdmin = profile.role === "admin";
  const today = todayLocal();
  const [profiles, blocked, recurring, plans] = await Promise.all([
    isAdmin ? listProfiles(supabase) : Promise.resolve([]),
    supabase.from("blocked_days").select("*").eq("owner_id", uid).gte("day", today).order("day").limit(60),
    supabase.from("recurring_meetings").select("*").eq("owner_id", uid).order("weekday"),
    supabase.from("plans").select("id,period_start,period_end,home_base,created_at,summary").eq("owner_id", uid).order("created_at", { ascending: false }).limit(5),
  ]);
  const viewed = isAdmin ? profiles.find((p) => p.id === uid) : profile;
  const ownerField = isAdmin ? <input type="hidden" name="owner_id" value={uid} /> : null;

  return (
    <>
      <PageHeader
        title="תכנון תקופה"
        sub="התוכנית נבנית כתצוגה מקדימה. דבר לא נשמר עד שתאשרו, ופגישות קיימות לא נדרסות."
        actions={isAdmin ? <UserPicker profiles={profiles} value={uid} /> : null}
      />
      <PlanBuilder
        owners={isAdmin ? profiles.map((p) => ({ id: p.id, name: p.full_name || p.email })) : undefined}
        defaultOwner={uid}
        defaultMonth={today.slice(0, 7)}
        defaultFrom={today}
        defaultHome={viewed?.home_base ?? "קריית ביאליק"}
      />

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="חופשות וימים חסומים" sub="ימים אלה לא יתוכננו. 'יום משרד' — שיחות בלבד, ללא ביקורים." />
          <div className="p-4">
            <ActionForm action={addBlockedDays} closeOnSuccess={false} resetOnSuccess className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ownerField}
              <Field label="מתאריך"><Input type="date" name="from" required /></Field>
              <Field label="עד"><Input type="date" name="to" /></Field>
              <Field label="סוג"><Select name="kind">{Object.entries(BLOCK_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="הערה"><Input name="note" /></Field>
              <div className="col-span-2 sm:col-span-4"><SubmitButton variant="secondary">הוספה</SubmitButton></div>
            </ActionForm>
            <ul className="mt-3 divide-y divide-line text-sm">
              {(blocked.data ?? []).length === 0 && <li className="py-2 text-ink-3">אין ימים חסומים עתידיים.</li>}
              {(blocked.data ?? []).map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2">
                  <span>{formatHebDate(b.day)} · {BLOCK_KIND[b.kind]}{b.note ? ` · ${b.note}` : ""}</span>
                  <ActionForm action={removeBlockedDay} closeOnSuccess={false}><input type="hidden" name="id" value={b.id} /><button className="text-red-700 hover:underline">הסרה</button></ActionForm>
                </li>
              ))}
            </ul>
          </div>
        </Card>
        <Card>
          <CardHeader title="פגישות קבועות" sub="למשל ישיבת צוות שבועית. התכנון לא יקבע פעולות בזמן זה." />
          <div className="p-4">
            <ActionForm action={addRecurring} closeOnSuccess={false} resetOnSuccess className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ownerField}
              <Field label="יום"><Select name="weekday">{HEB_WEEKDAYS.slice(0, 5).map((d, i) => <option key={i} value={i}>{d}</option>)}</Select></Field>
              <Field label="משעה"><Input type="time" name="start" defaultValue="08:00" required /></Field>
              <Field label="עד"><Input type="time" name="end" defaultValue="09:00" required /></Field>
              <Field label="תיאור"><Input name="title" required /></Field>
              <div className="col-span-2 sm:col-span-4"><SubmitButton variant="secondary">הוספה</SubmitButton></div>
            </ActionForm>
            <ul className="mt-3 divide-y divide-line text-sm">
              {(recurring.data ?? []).length === 0 && <li className="py-2 text-ink-3">אין פגישות קבועות.</li>}
              {(recurring.data ?? []).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <span>יום {HEB_WEEKDAYS[r.weekday]} · <span className="ltr tabular">{String(r.start_time).slice(0, 5)}–{String(r.end_time).slice(0, 5)}</span> · {r.title}</span>
                  <ActionForm action={removeRecurring} closeOnSuccess={false}><input type="hidden" name="id" value={r.id} /><button className="text-red-700 hover:underline">הסרה</button></ActionForm>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {(plans.data ?? []).length > 0 && (
        <Card className="mt-5">
          <CardHeader title="תוכניות שנשמרו" />
          <ul className="divide-y divide-line text-sm">
            {(plans.data ?? []).map((p) => (
              <li key={p.id} className="px-4 py-3">
                <p className="font-medium">{p.period_start.split("-").reverse().join("/")} – {p.period_end.split("-").reverse().join("/")} · יציאה מ{p.home_base}</p>
                <p className="text-ink-3">נשמרה {formatDateTime(p.created_at)}</p>
                {(p.summary?.shortages ?? []).length > 0 && <p className="text-amber-800">{p.summary.shortages.length} חוסרים תועדו בעת השמירה</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
