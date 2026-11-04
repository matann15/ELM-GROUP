import Link from "next/link";
import { Plus, ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ACTIVITY_SELECT, listProfiles, resolveViewedUser, type ActivityRow } from "@/lib/queries";
import { dayBoundsUtc, formatHebDate, todayLocal, formatShortDate, weekdayOf, addDays } from "@/lib/time";
import { STAGE_LABEL } from "@/lib/labels";
import { ActivityCard } from "@/components/activity/card";
import { NewActivityForm, type CompanyOption } from "@/components/activity/forms";
import { Modal } from "@/components/client";
import { Badge, btnClass, Card, CardHeader, Empty, Notice, PageHeader } from "@/components/ui";
import { UserPicker } from "@/components/user-picker";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ user?: string; date?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser();
  const uid = resolveViewedUser(profile, sp.user);
  const today = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayLocal();
  const { from, to } = dayBoundsUtc(today);

  const [timed, tasks, overdueTimed, overdueTasks, opps, companies, profiles, blocked] = await Promise.all([
    supabase.from("activities").select(ACTIVITY_SELECT).eq("owner_id", uid).gte("starts_at", from).lt("starts_at", to).order("starts_at"),
    supabase.from("activities").select(ACTIVITY_SELECT).eq("owner_id", uid).is("starts_at", null).eq("due_date", today),
    supabase.from("activities").select(ACTIVITY_SELECT).eq("owner_id", uid).in("status", ["scheduled", "proposed"]).lt("starts_at", from).order("starts_at", { ascending: false }).limit(30),
    supabase.from("activities").select(ACTIVITY_SELECT).eq("owner_id", uid).in("status", ["scheduled", "proposed"]).is("starts_at", null).lt("due_date", today).limit(30),
    supabase
      .from("opportunities")
      .select("id,title,stage,next_step,next_step_date,company:companies(id,name)")
      .eq("owner_id", uid)
      .not("stage", "in", "(won,lost)")
      .order("next_step_date", { ascending: true, nullsFirst: true })
      .limit(12),
    supabase.from("companies").select("id,name,company_sites(id,address_raw,city),contacts(id,name,role)").neq("status", "irrelevant").is("merged_into", null).order("name").limit(2000),
    profile.role === "admin" ? listProfiles(supabase) : Promise.resolve([]),
    supabase.from("blocked_days").select("kind,note").eq("owner_id", uid).eq("day", today).maybeSingle(),
  ]);

  const dayActs = [...((timed.data ?? []) as ActivityRow[]), ...((tasks.data ?? []) as ActivityRow[])];
  const overdue = [...((overdueTimed.data ?? []) as ActivityRow[]), ...((overdueTasks.data ?? []) as ActivityRow[])];

  // התקדמות: שיחות שהתקיימו בפועל היום (ללא "אין מענה"), לחברות שונות שאינן חברות הביקור היום
  const { data: doneToday } = await supabase
    .from("activities")
    .select("id,type,status,company_id,starts_at")
    .eq("owner_id", uid)
    .gte("completed_at", from)
    .lt("completed_at", to);
  const visitCompaniesToday = new Set(dayActs.filter((a) => a.type === "visit" && a.status !== "cancelled").map((a) => a.company_id));
  const callsDone = new Set((doneToday ?? []).filter((a) => a.type === "call" && a.status === "done" && a.company_id && !visitCompaniesToday.has(a.company_id)).map((a) => a.company_id));
  const noAnswer = (doneToday ?? []).filter((a) => a.type === "call" && a.status === "no_answer").length;
  const visitsPlanned = dayActs.filter((a) => a.type === "visit" && !["cancelled", "postponed"].includes(a.status)).length;
  const visitsDone = dayActs.filter((a) => a.type === "visit" && a.status === "done").length;
  const callsPlanned = new Set(dayActs.filter((a) => a.type === "call" && a.status !== "cancelled" && a.company_id && !visitCompaniesToday.has(a.company_id)).map((a) => a.company_id)).size;
  const isWorkday = weekdayOf(today) <= 4 && !blocked.data;

  const companyOptions: CompanyOption[] = (companies.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    sites: (c.company_sites ?? []).map((s: { id: string; address_raw: string | null; city: string | null }) => ({ id: s.id, label: s.address_raw ?? s.city ?? "אתר" })),
    contacts: (c.contacts ?? []).map((ct: { id: string; name: string; role: string | null }) => ({ id: ct.id, label: ct.name + (ct.role ? ` · ${ct.role}` : "") })),
  }));
  const viewedName = profiles.find((p) => p.id === uid)?.full_name;

  return (
    <>
      <PageHeader
        title="היום שלי"
        sub={
          <span>
            {formatHebDate(today)}
            {uid !== profile.id && viewedName ? ` · ${viewedName}` : ""}
          </span>
        }
        actions={
          <>
            {profile.role === "admin" && <UserPicker profiles={profiles} value={uid} />}
            <Link href={`/?date=${addDays(today, -1)}${sp.user ? `&user=${sp.user}` : ""}`} className={btnClass("ghost", "md")}>יום קודם</Link>
            <Link href={`/?date=${addDays(today, 1)}${sp.user ? `&user=${sp.user}` : ""}`} className={btnClass("ghost", "md")}>יום הבא</Link>
            <Modal title="פעולה חדשה" trigger={<><Plus size={16} /> פעולה חדשה</>} triggerClass={btnClass("primary", "md")}>
              <NewActivityForm companies={companyOptions} defaultDate={today} owners={profile.role === "admin" ? profiles.map((p) => ({ id: p.id, name: p.full_name || p.email })) : undefined} />
            </Modal>
          </>
        }
      />

      {blocked.data && (
        <div className="mb-4"><Notice tone="blue">היום מסומן כ{blocked.data.kind === "vacation" ? "חופשה" : blocked.data.kind === "office" ? "יום משרד" : "יום חסום"}{blocked.data.note ? ` — ${blocked.data.note}` : ""}.</Notice></div>
      )}

      {/* התקדמות יומית */}
      <section className="mb-5 grid grid-cols-2 gap-3">
        <Progress label="שיחות שהתקיימו" value={callsDone.size} target={3} note={`${callsPlanned} מתוכננות${noAnswer ? ` · ${noAnswer} ללא מענה (לא נספרו)` : ""}`} />
        <Progress label="ביקורים שבוצעו" value={visitsDone} target={visitsPlanned} note={visitsPlanned ? `מתוך ${visitsPlanned} ביקורים להיום` : isWorkday ? "יום משרד — אין ביקורים" : "אין ביקורים"} />
      </section>
      {isWorkday && callsPlanned < 3 && (
        <div className="mb-5">
          <Notice>
            מתוכננות היום {callsPlanned} שיחות לחברות שונות (היעד: לפחות 3, לא לחברות הביקור).{" "}
            <Link href="/plan" className="font-medium underline">לתכנון</Link> או הוסיפו שיחה בכפתור &quot;פעולה חדשה&quot;.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section>
          <h2 className="mb-3 text-lg font-semibold">סדר היום</h2>
          {dayActs.length === 0 ? (
            <Empty title="אין פעולות מתוכננות להיום">צרו תוכנית לתקופה במסך התכנון, או הוסיפו פעולה ידנית.</Empty>
          ) : (
            <div className="space-y-3">{dayActs.map((a) => <ActivityCard key={a.id} a={a} />)}</div>
          )}

          {overdue.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 flex items-center gap-2 text-lg font-semibold">
                באיחור <Badge tone="red">{overdue.length}</Badge>
              </h2>
              <div className="space-y-3">{overdue.map((a) => <ActivityCard key={a.id} a={a} showDate overdue />)}</div>
            </>
          )}
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="הצעד הבא בהזדמנויות" action={<Link href="/opportunities" className="text-sm text-brand">הכול</Link>} />
            <ul className="divide-y divide-line">
              {(opps.data ?? []).length === 0 && <li className="px-4 py-4 text-sm text-ink-3">אין הזדמנויות פתוחות.</li>}
              {(opps.data ?? []).map((o) => {
                const comp = o.company as unknown as { id: string; name: string } | null;
                const late = o.next_step_date && o.next_step_date < today;
                return (
                  <li key={o.id} className="px-4 py-3">
                    <Link href={`/customers/${comp?.id}#opps`} className="group block">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium group-hover:text-brand">{comp?.name}</span>
                        <Badge tone="neutral">{STAGE_LABEL[o.stage]}</Badge>
                      </div>
                      {o.next_step ? (
                        <p className={`mt-0.5 text-sm ${late ? "text-red-700" : "text-ink-2"}`}>
                          {o.next_step}
                          {o.next_step_date ? ` · ${formatShortDate(o.next_step_date)}` : ""}
                          {late ? " (באיחור)" : ""}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-sm text-amber-800">אין צעד הבא מוגדר</p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Link href={`/route?date=${today}${sp.user ? `&user=${sp.user}` : ""}`} className={btnClass("secondary", "lg", "w-full justify-between")}>
            מסלול השטח של היום <ArrowLeft size={18} />
          </Link>
        </aside>
      </div>
    </>
  );
}

function Progress({ label, value, target, note }: { label: string; value: number; target: number; note: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const met = target > 0 && value >= target;
  return (
    <div className="rounded-xl border border-line bg-white p-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-ink-2">{label}</span>
        <span className="tabular text-xl font-bold">
          {value}
          <span className="text-base font-normal text-ink-3">/{target}</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/5">
        <div className={`h-full rounded-full ${met ? "bg-emerald-500" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-ink-3">{note}</p>
    </div>
  );
}
