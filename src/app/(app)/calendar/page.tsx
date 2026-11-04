import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { requireUser } from "@/lib/auth";
import { ACTIVITY_SELECT, listProfiles, resolveViewedUser, type ActivityRow } from "@/lib/queries";
import { validatePlan, DEFAULT_SETTINGS, type RuleIssue, type ExistingActivity } from "@/lib/planner";
import {
  addDays, addMonths, endOfMonth, formatHebDate, HEB_MONTHS, HEB_WEEKDAYS, HEB_WEEKDAYS_SHORT, localDateOf, localTimeOf,
  rangeDays, startOfMonth, startOfWeek, toUtc, todayLocal, weekdayOf,
} from "@/lib/time";
import { BLOCK_KIND } from "@/lib/labels";
import { Badge, btnClass, Notice, PageHeader } from "@/components/ui";
import { Modal } from "@/components/client";
import { ActivityCard, statusLabel } from "@/components/activity/card";
import { RescheduleForm } from "@/components/activity/forms";
import { DeleteActivityButton } from "@/components/activity/buttons";
import { UserPicker } from "@/components/user-picker";

type View = "month" | "week" | "day";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; user?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser();
  const uid = resolveViewedUser(profile, sp.user);
  const view: View = sp.view === "month" || sp.view === "day" ? sp.view : "week";
  const today = todayLocal();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  let start: string, end: string;
  if (view === "month") { start = startOfWeek(startOfMonth(date)); end = addDays(startOfWeek(endOfMonth(date)), 6); }
  else if (view === "week") { start = startOfWeek(date); end = addDays(start, 6); }
  else { start = date; end = date; }

  const [acts, tasks, blocked, recurring, profiles] = await Promise.all([
    supabase.from("activities").select(ACTIVITY_SELECT).eq("owner_id", uid).gte("starts_at", toUtc(start, "00:00").toISOString()).lt("starts_at", toUtc(addDays(end, 1), "00:00").toISOString()).order("starts_at"),
    supabase.from("activities").select(ACTIVITY_SELECT).eq("owner_id", uid).is("starts_at", null).gte("due_date", start).lte("due_date", end),
    supabase.from("blocked_days").select("day,kind,note").eq("owner_id", uid).gte("day", start).lte("day", end),
    supabase.from("recurring_meetings").select("weekday,start_time,end_time,title").eq("owner_id", uid),
    profile.role === "admin" ? listProfiles(supabase) : Promise.resolve([]),
  ]);
  const all = [...((acts.data ?? []) as ActivityRow[]), ...((tasks.data ?? []) as ActivityRow[])];
  const dayOf = (a: ActivityRow) => (a.starts_at ? localDateOf(a.starts_at) : a.due_date!);
  const byDay = new Map<string, ActivityRow[]>();
  for (const a of all) byDay.set(dayOf(a), [...(byDay.get(dayOf(a)) ?? []), a]);
  const blockedMap = new Map((blocked.data ?? []).map((b) => [b.day, b]));
  const rec = (recurring.data ?? []).map((r) => ({ weekday: r.weekday, start: String(r.start_time).slice(0, 5), end: String(r.end_time).slice(0, 5), title: r.title }));

  // שיחות תיאום של ביקורים בטווח יכולות להיות לפני תחילת הטווח — טוענים אותן לבדיקה
  const visitIds = all.filter((a) => a.type === "visit").map((a) => a.id);
  const { data: coordCalls } = visitIds.length
    ? await supabase.from("activities").select("id,type,status,company_id,starts_at,ends_at,related_visit_id").in("related_visit_id", visitIds)
    : { data: [] };
  const extraCoord = (coordCalls ?? []).filter((c) => !all.some((a) => a.id === c.id));

  // בדיקת כללי תכנון על הטווח המוצג (מהיום והלאה)
  const vStart = view === "month" ? startOfMonth(date) : start;
  const vEnd = view === "month" ? endOfMonth(date) : end;
  const issues: RuleIssue[] = validatePlan(
    { ...DEFAULT_SETTINGS, periodStart: vStart, periodEnd: vEnd, today },
    all.filter((a) => a.type !== "task").map((a): ExistingActivity => ({
      id: a.id, type: a.type, status: a.status, companyId: a.company_id, date: dayOf(a),
      start: a.starts_at ? localTimeOf(a.starts_at) : null, end: a.ends_at ? localTimeOf(a.ends_at) : null,
      title: a.company?.name ?? a.title ?? "", relatedVisitId: a.related_visit_id, navigable: a.site ? a.site.navigable : null,
    })).concat(extraCoord.map((c): ExistingActivity => ({
      id: c.id, type: c.type, status: c.status, companyId: c.company_id, date: c.starts_at ? localDateOf(c.starts_at) : null,
      start: null, end: null, title: "", relatedVisitId: c.related_visit_id, navigable: null,
    }))),
    (blocked.data ?? []).map((b) => ({ day: b.day, kind: b.kind })),
    rec,
  );
  const issuesByDay = new Map<string, RuleIssue[]>();
  for (const i of issues) if (i.date) issuesByDay.set(i.date, [...(issuesByDay.get(i.date) ?? []), i]);
  const flagged = new Set(issues.filter((i) => i.level === "error").flatMap((i) => i.ids ?? []));

  const step = (dir: 1 | -1) => (view === "month" ? addMonths(date, dir) : addDays(date, dir * (view === "week" ? 7 : 1)));
  const href = (patch: Record<string, string>) => `/calendar?${new URLSearchParams({ view, date, ...(sp.user ? { user: sp.user } : {}), ...patch })}`;
  const title = view === "month" ? `${HEB_MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}` : view === "week" ? `שבוע ${start.split("-").reverse().slice(0, 2).join("/")}–${end.split("-").reverse().slice(0, 2).join("/")}` : formatHebDate(date);

  return (
    <>
      <PageHeader
        title="יומן"
        sub={title}
        actions={
          <>
            {profile.role === "admin" && <UserPicker profiles={profiles} value={uid} />}
            <div className="flex overflow-hidden rounded-lg border border-line bg-white text-sm">
              {(["day", "week", "month"] as View[]).map((v) => (
                <Link key={v} href={href({ view: v })} className={clsx("px-3 py-2", v === view ? "bg-brand-soft font-semibold text-brand-dark" : "text-ink-2 hover:bg-canvas")}>
                  {{ day: "יום", week: "שבוע", month: "חודש" }[v]}
                </Link>
              ))}
            </div>
            <Link href={href({ date: step(-1) })} className={btnClass("secondary", "md")} aria-label="הקודם"><ChevronRight size={18} /></Link>
            <Link href={href({ date: today })} className={btnClass("secondary", "md")}>היום</Link>
            <Link href={href({ date: step(1) })} className={btnClass("secondary", "md")} aria-label="הבא"><ChevronLeft size={18} /></Link>
          </>
        }
      />

      <Legend />
      {issues.length > 0 && (
        <details className="mb-4 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-2.5 text-sm">
          <summary className="cursor-pointer font-medium text-amber-900"><AlertTriangle size={15} className="me-1 inline" />{issues.length} חריגות מכללי התכנון בטווח המוצג</summary>
          <ul className="mt-2 list-disc space-y-0.5 ps-5 text-amber-900">
            {issues.map((i, k) => <li key={k} className={i.level === "error" ? "text-red-700" : ""}>{i.date ? `${i.date.split("-").reverse().slice(0, 2).join("/")}: ` : ""}{i.message}</li>)}
          </ul>
        </details>
      )}

      {view === "month" && (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="grid grid-cols-7 border-b border-line bg-canvas text-center text-xs font-medium text-ink-3">
            {HEB_WEEKDAYS_SHORT.map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {rangeDays(start, end).map((d) => {
              const items = (byDay.get(d) ?? []).filter((a) => a.status !== "cancelled");
              const inMonth = d.slice(0, 7) === date.slice(0, 7);
              const b = blockedMap.get(d);
              const wd = weekdayOf(d);
              const dayIssues = issuesByDay.get(d) ?? [];
              const visits = items.filter((a) => a.type === "visit").length;
              const calls = items.filter((a) => a.type === "call").length;
              return (
                <Link
                  key={d}
                  href={href({ view: "day", date: d })}
                  className={clsx("min-h-[92px] border-b border-e border-line p-1.5 text-xs transition-colors hover:bg-brand-soft/40 sm:min-h-[112px]", !inMonth && "bg-canvas/70 text-ink-3", (wd >= 5 || b) && inMonth && "bg-black/[0.025]")}
                >
                  <div className="flex items-center justify-between">
                    <span className={clsx("tabular inline-flex size-6 items-center justify-center rounded-full", d === today && "bg-brand font-bold text-white")}>{Number(d.slice(8))}</span>
                    {dayIssues.length > 0 && inMonth && <AlertTriangle size={13} className="text-amber-600" />}
                  </div>
                  {b && <div className="mt-0.5 truncate text-[11px] text-ink-3">{BLOCK_KIND[b.kind]}</div>}
                  <div className="mt-1 hidden space-y-0.5 sm:block">
                    {items.slice(0, 4).map((a) => (
                      <div key={a.id} className={clsx("truncate rounded px-1 py-0.5", pill(a))}>
                        {a.starts_at && <span className="ltr tabular">{localTimeOf(a.starts_at)} </span>}
                        {a.company?.name ?? a.title}
                      </div>
                    ))}
                    {items.length > 4 && <div className="text-ink-3">+{items.length - 4}</div>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
                    {visits > 0 && <span className="rounded bg-sky-100 px-1 text-sky-900">{visits}ב׳</span>}
                    {calls > 0 && <span className="rounded bg-brand-soft px-1 text-brand-dark">{calls}ש׳</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {view === "week" && (
        <div className="grid gap-3 lg:grid-cols-5">
          {rangeDays(start, end)
            .filter((d) => weekdayOf(d) <= 4 || (byDay.get(d) ?? []).length > 0)
            .map((d) => {
              const items = byDay.get(d) ?? [];
              const b = blockedMap.get(d);
              const dayRec = rec.filter((r) => r.weekday === weekdayOf(d));
              const dayIssues = issuesByDay.get(d) ?? [];
              return (
                <section key={d} className={clsx("rounded-xl border bg-white", d === today ? "border-brand" : "border-line")}>
                  <Link href={href({ view: "day", date: d })} className="flex items-center justify-between border-b border-line px-3 py-2 hover:bg-canvas">
                    <span className="font-semibold">{HEB_WEEKDAYS[weekdayOf(d)]} <span className="tabular font-normal text-ink-3">{d.split("-").reverse().slice(0, 2).join("/")}</span></span>
                    {items.some((a) => a.type === "visit" && a.status !== "cancelled") ? <Badge tone="blue">שטח</Badge> : b ? <Badge tone="neutral">{BLOCK_KIND[b.kind]}</Badge> : null}
                  </Link>
                  <ul className="space-y-1.5 p-2">
                    {dayRec.map((r, i) => <li key={i} className="rounded-md bg-black/5 px-2 py-1 text-xs text-ink-2"><span className="ltr tabular">{r.start}</span> {r.title} (קבוע)</li>)}
                    {items.length === 0 && dayRec.length === 0 && <li className="px-1 py-2 text-xs text-ink-3">ריק</li>}
                    {items.map((a) => <MiniItem key={a.id} a={a} flagged={flagged.has(a.id)} />)}
                  </ul>
                  {dayIssues.length > 0 && (
                    <ul className="border-t border-line px-3 py-2 text-xs text-amber-800">
                      {dayIssues.map((i, k) => <li key={k} className={i.level === "error" ? "text-red-700" : ""}>• {i.message}</li>)}
                    </ul>
                  )}
                </section>
              );
            })}
        </div>
      )}

      {view === "day" && (
        <div className="space-y-3">
          {blockedMap.get(date) && <Notice tone="blue">{BLOCK_KIND[blockedMap.get(date)!.kind]}{blockedMap.get(date)!.note ? ` — ${blockedMap.get(date)!.note}` : ""}</Notice>}
          {rec.filter((r) => r.weekday === weekdayOf(date)).map((r, i) => <div key={i} className="rounded-xl border border-line bg-black/[0.03] px-4 py-3 text-sm"><span className="ltr tabular font-semibold">{r.start}–{r.end}</span> · {r.title} (פגישה קבועה)</div>)}
          {(issuesByDay.get(date) ?? []).map((i, k) => <Notice key={k} tone={i.level === "error" ? "red" : "amber"}>{i.message}</Notice>)}
          {(byDay.get(date) ?? []).length === 0 ? <p className="text-sm text-ink-3">אין פעולות ביום זה.</p> : (byDay.get(date) ?? []).map((a) => <ActivityCard key={a.id} a={a} />)}
        </div>
      )}
    </>
  );
}

function pill(a: ActivityRow) {
  if (a.status === "done") return "bg-emerald-50 text-emerald-900";
  if (a.status === "no_answer") return "bg-amber-50 text-amber-900";
  if (a.type === "visit") return a.status === "proposed" ? "bg-violet-50 text-violet-900 border border-dashed border-violet-300" : "bg-sky-50 text-sky-900";
  if (a.type === "call") return "bg-brand-soft text-brand-dark";
  return "bg-black/5 text-ink-2";
}

function MiniItem({ a, flagged }: { a: ActivityRow; flagged: boolean }) {
  const d = a.starts_at ? localDateOf(a.starts_at) : a.due_date ?? "";
  const t = a.starts_at ? localTimeOf(a.starts_at) : "";
  return (
    <li>
      <Modal
        title={a.company?.name ?? a.title ?? "פעולה"}
        triggerClass={clsx("block w-full rounded-md px-2 py-1.5 text-start text-xs", pill(a), flagged && "ring-2 ring-red-400")}
        trigger={
          <>
            <span className="ltr tabular font-semibold">{t}</span> {a.company?.name ?? a.title}
            <span className="block opacity-75">{statusLabel(a)}</span>
          </>
        }
      >
        <div className="space-y-4">
          <ActivityCard a={a} />
          <div className="rounded-lg border border-line p-3">
            <h3 className="mb-2 text-sm font-semibold">העברה ליום או שעה אחרים</h3>
            <RescheduleForm id={a.id} date={d} time={t} type={a.type} status={a.status} />
          </div>
          {a.status === "proposed" && <div className="flex justify-end"><DeleteActivityButton id={a.id} /></div>}
        </div>
      </Modal>
    </li>
  );
}

function Legend() {
  return (
    <div className="mb-3 flex flex-wrap gap-2 text-xs">
      <span className="rounded border border-dashed border-violet-300 bg-violet-50 px-2 py-0.5 text-violet-900">ביקור מוצע (לא תואם)</span>
      <span className="rounded bg-sky-50 px-2 py-0.5 text-sky-900">ביקור מתואם</span>
      <span className="rounded bg-brand-soft px-2 py-0.5 text-brand-dark">שיחה</span>
      <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-900">בוצע</span>
      <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-900">אין מענה</span>
    </div>
  );
}
