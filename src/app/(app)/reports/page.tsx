import Link from "next/link";
import { clsx } from "clsx";
import { requireUser } from "@/lib/auth";
import { listProfiles } from "@/lib/queries";
import { regionName } from "@/lib/geo";
import { STAGE_LABEL, ACTIVITY_TYPE } from "@/lib/labels";
import { endOfMonth, formatDate, localDateOf, localTimeOf, startOfMonth, toUtc, todayLocal, addDays } from "@/lib/time";
import { Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { statusLabel } from "@/components/activity/card";

type Act = { id: string; type: string; status: string; owner_id: string; company_id: string | null; starts_at: string | null; company: { name: string } | null; site: { region_code: string | null } | null };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; user?: string; show?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser();
  const isAdmin = profile.role === "admin";
  const today = todayLocal();
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : startOfMonth(today);
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) && sp.to >= from ? sp.to : endOfMonth(today);
  const user = isAdmin ? sp.user ?? "" : profile.id;

  let aq = supabase
    .from("activities")
    .select("id,type,status,owner_id,company_id,starts_at,company:companies(name),site:company_sites(region_code)")
    .in("type", ["call", "visit"])
    .gte("starts_at", toUtc(from, "00:00").toISOString())
    .lt("starts_at", toUtc(addDays(to, 1), "00:00").toISOString())
    .order("starts_at")
    .limit(10000);
  if (user) aq = aq.eq("owner_id", user);
  let cq = supabase.from("companies").select("id,name,owner_id,status,company_sites(region_code,is_primary)").is("merged_into", null).neq("status", "irrelevant").limit(10000);
  if (user) cq = cq.eq("owner_id", user);
  let oq = supabase.from("opportunities").select("id,title,stage,next_step,next_step_date,owner_id,company:companies(id,name)").not("stage", "in", "(won,lost)");
  if (user) oq = oq.eq("owner_id", user);
  const [{ data: actsRaw }, { data: comps }, { data: opps }, profiles] = await Promise.all([aq, cq, oq, listProfiles(supabase)]);
  const acts = (actsRaw ?? []) as unknown as Act[];
  const live = acts.filter((a) => !["cancelled", "postponed"].includes(a.status));
  const day = (a: Act) => (a.starts_at ? localDateOf(a.starts_at) : "");

  const sets: Record<string, Act[]> = {
    calls_planned: live.filter((a) => a.type === "call"),
    calls_done: acts.filter((a) => a.type === "call" && a.status === "done"),
    calls_no_answer: acts.filter((a) => a.type === "call" && a.status === "no_answer"),
    visits_planned: live.filter((a) => a.type === "visit"),
    visits_done: acts.filter((a) => a.type === "visit" && a.status === "done"),
    visits_proposed: live.filter((a) => a.type === "visit" && a.status === "proposed"),
  };
  const fieldPlanned = [...new Set(sets.visits_planned.map(day))].sort();
  const fieldDone = [...new Set(sets.visits_done.map(day))].sort();
  const touched = new Set(acts.filter((a) => a.status === "done" || a.status === "no_answer").map((a) => a.company_id));
  const untouched = (comps ?? []).filter((c) => !touched.has(c.id));
  const oppsNoNext = (opps ?? []).filter((o) => !o.next_step || !o.next_step_date || o.next_step_date < today);
  const name = (id: string) => profiles.find((p) => p.id === id)?.full_name || "—";

  const byUser = new Map<string, { calls: number; visits: number; noAnswer: number }>();
  const byRegion = new Map<string, { calls: number; visits: number }>();
  for (const a of acts) {
    if (a.status !== "done" && a.status !== "no_answer") continue;
    const u = byUser.get(a.owner_id) ?? { calls: 0, visits: 0, noAnswer: 0 };
    if (a.type === "call" && a.status === "done") u.calls++;
    if (a.type === "call" && a.status === "no_answer") u.noAnswer++;
    if (a.type === "visit" && a.status === "done") u.visits++;
    byUser.set(a.owner_id, u);
    if (a.status === "done") {
      const rk = a.site?.region_code ?? "none";
      const r = byRegion.get(rk) ?? { calls: 0, visits: 0 };
      if (a.type === "call") r.calls++; else r.visits++;
      byRegion.set(rk, r);
    }
  }

  const base = { from, to, ...(sp.user ? { user: sp.user } : {}) };
  const link = (show: string) => `/reports?${new URLSearchParams({ ...base, show })}#details`;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  let detailTitle = "";
  let detail: React.ReactNode = null;
  const actList = (list: Act[]) => (
    <ul className="divide-y divide-line">
      {list.map((a) => (
        <li key={a.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5 text-sm">
          <span><Link href={`/customers/${a.company_id}`} className="font-medium hover:text-brand">{a.company?.name ?? "—"}</Link> · {ACTIVITY_TYPE[a.type]} · {statusLabel(a)}</span>
          <span className="text-ink-3">{a.starts_at ? `${formatDate(a.starts_at)} ${localTimeOf(a.starts_at)}` : ""}{isAdmin ? ` · ${name(a.owner_id)}` : ""}</span>
        </li>
      ))}
    </ul>
  );
  const show = sp.show ?? "";
  if (sets[show]) {
    detailTitle = { calls_planned: "שיחות מתוכננות", calls_done: "שיחות שהתקיימו", calls_no_answer: "שיחות ללא מענה", visits_planned: "ביקורים מתוכננים", visits_done: "ביקורים שבוצעו", visits_proposed: "ביקורים מוצעים שלא תואמו" }[show]!;
    detail = actList(sets[show]);
  } else if (show === "fielddays_planned" || show === "fielddays_done") {
    const days = show === "fielddays_planned" ? fieldPlanned : fieldDone;
    detailTitle = show === "fielddays_planned" ? "ימי שטח מתוכננים" : "ימי שטח שבוצעו";
    detail = (
      <ul className="divide-y divide-line">
        {days.map((d) => (
          <li key={d} className="px-4 py-2.5 text-sm">
            <Link href={`/route?date=${d}${sp.user ? `&user=${sp.user}` : ""}`} className="font-medium hover:text-brand">{formatDate(d)}</Link>
            <span className="text-ink-3"> · {sets.visits_planned.filter((a) => day(a) === d).map((a) => a.company?.name).join(", ")}</span>
          </li>
        ))}
      </ul>
    );
  } else if (show === "untouched") {
    detailTitle = "לקוחות ללא טיפול בתקופה";
    detail = (
      <ul className="divide-y divide-line">
        {untouched.slice(0, 500).map((c) => {
          const s = ((c.company_sites ?? []) as { region_code: string | null; is_primary: boolean }[]).find((x) => x.is_primary) ?? (c.company_sites as { region_code: string | null }[])[0];
          return (
            <li key={c.id} className="px-4 py-2.5 text-sm">
              <Link href={`/customers/${c.id}`} className="font-medium hover:text-brand">{c.name}</Link>
              <span className="text-ink-3"> · {regionName(s?.region_code)}{isAdmin ? ` · ${c.owner_id ? name(c.owner_id) : "לא משויך"}` : ""}</span>
            </li>
          );
        })}
        {untouched.length > 500 && <li className="px-4 py-2.5 text-sm text-ink-3">מוצגים 500 הראשונים מתוך {untouched.length}. סננו לפי איש מכירות.</li>}
      </ul>
    );
  } else if (show === "opps_no_next") {
    detailTitle = "הזדמנויות ללא צעד הבא (או שמועדו עבר)";
    detail = (
      <ul className="divide-y divide-line">
        {oppsNoNext.map((o) => {
          const comp = o.company as unknown as { id: string; name: string } | null;
          return (
            <li key={o.id} className="px-4 py-2.5 text-sm">
              <Link href={`/customers/${comp?.id}#opps`} className="font-medium hover:text-brand">{comp?.name}</Link> · {o.title} · {STAGE_LABEL[o.stage]}
              <span className="text-ink-3"> · {o.next_step ? `${o.next_step} (${o.next_step_date ? formatDate(o.next_step_date) : "ללא תאריך"})` : "אין צעד הבא"}</span>
            </li>
          );
        })}
      </ul>
    );
  } else if (show.startsWith("user:")) {
    const id = show.slice(5);
    detailTitle = `פעילות שבוצעה — ${name(id)}`;
    detail = actList(acts.filter((a) => a.owner_id === id && (a.status === "done" || a.status === "no_answer")));
  } else if (show.startsWith("region:")) {
    const r = show.slice(7);
    detailTitle = `פעילות שבוצעה — ${regionName(r === "none" ? null : r)}`;
    detail = actList(acts.filter((a) => a.status === "done" && (a.site?.region_code ?? "none") === r));
  }

  return (
    <>
      <PageHeader title="דוחות" sub="כל מספר מחושב מהנתונים בפועל — לחצו עליו כדי לראות את הרשומות." />
      <form className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-3" action="/reports">
        <Field label="מתאריך"><Input type="date" name="from" defaultValue={from} /></Field>
        <Field label="עד תאריך"><Input type="date" name="to" defaultValue={to} /></Field>
        {isAdmin && (
          <Field label="איש מכירות">
            <Select name="user" defaultValue={sp.user ?? ""}><option value="">כולם</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</Select>
          </Field>
        )}
        <button className="h-10 rounded-lg bg-brand px-4 text-white">הצגה</button>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="מתוכנן מול בוצע" sub={`${formatDate(from)} – ${formatDate(to)}`} />
          <table className="w-full text-sm">
            <thead className="text-ink-3"><tr><th className="px-4 py-2 text-start font-normal"></th><th className="px-2 py-2 text-start font-normal">מתוכנן</th><th className="px-2 py-2 text-start font-normal">בוצע</th><th className="px-2 py-2 text-start font-normal">%</th></tr></thead>
            <tbody className="divide-y divide-line">
              <Row label="שיחות" a={[sets.calls_planned.length, link("calls_planned")]} b={[sets.calls_done.length, link("calls_done")]} p={pct(sets.calls_done.length, sets.calls_planned.length)} />
              <Row label="ביקורים" a={[sets.visits_planned.length, link("visits_planned")]} b={[sets.visits_done.length, link("visits_done")]} p={pct(sets.visits_done.length, sets.visits_planned.length)} />
              <Row label="ימי שטח" a={[fieldPlanned.length, link("fielddays_planned")]} b={[fieldDone.length, link("fielddays_done")]} p={pct(fieldDone.length, fieldPlanned.length)} />
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-2.5 text-sm text-ink-3">
            <Link className="text-brand" href={link("calls_no_answer")}>{sets.calls_no_answer.length} שיחות ללא מענה</Link> (לא נספרו כשיחה שהתקיימה) ·{" "}
            <Link className="text-brand" href={link("visits_proposed")}>{sets.visits_proposed.length} ביקורים מוצעים שלא תואמו</Link>
          </p>
        </Card>
        <Card>
          <CardHeader title="דורש טיפול" />
          <ul className="divide-y divide-line text-sm">
            <li className="flex items-center justify-between px-4 py-3">
              <span>לקוחות ללא שיחה או ביקור בתקופה</span>
              <Link className="text-lg font-bold text-brand" href={link("untouched")}>{untouched.length}</Link>
            </li>
            <li className="flex items-center justify-between px-4 py-3">
              <span>הזדמנויות פתוחות ללא צעד הבא / שמועדו עבר</span>
              <Link className="text-lg font-bold text-brand" href={link("opps_no_next")}>{oppsNoNext.length}</Link>
            </li>
          </ul>
        </Card>
        <Card>
          <CardHeader title="פעילות לפי איש מכירות" sub="שיחות וביקורים שבוצעו" />
          <table className="w-full text-sm">
            <thead className="text-ink-3"><tr><th className="px-4 py-2 text-start font-normal">איש מכירות</th><th className="px-2 py-2 text-start font-normal">שיחות</th><th className="px-2 py-2 text-start font-normal">ללא מענה</th><th className="px-2 py-2 text-start font-normal">ביקורים</th></tr></thead>
            <tbody className="divide-y divide-line">
              {[...byUser.entries()].map(([id, v]) => (
                <tr key={id}><td className="px-4 py-2"><Link className="hover:text-brand" href={link(`user:${id}`)}>{name(id)}</Link></td><td className="px-2 tabular">{v.calls}</td><td className="px-2 tabular">{v.noAnswer}</td><td className="px-2 tabular">{v.visits}</td></tr>
              ))}
              {byUser.size === 0 && <tr><td className="px-4 py-3 text-ink-3" colSpan={4}>אין פעילות שבוצעה בתקופה.</td></tr>}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardHeader title="פעילות לפי אזור" sub="לפי אזור האתר של הפעולה" />
          <table className="w-full text-sm">
            <thead className="text-ink-3"><tr><th className="px-4 py-2 text-start font-normal">אזור</th><th className="px-2 py-2 text-start font-normal">שיחות</th><th className="px-2 py-2 text-start font-normal">ביקורים</th></tr></thead>
            <tbody className="divide-y divide-line">
              {[...byRegion.entries()].map(([r, v]) => (
                <tr key={r}><td className="px-4 py-2"><Link className="hover:text-brand" href={link(`region:${r}`)}>{regionName(r === "none" ? null : r)}</Link></td><td className="px-2 tabular">{v.calls}</td><td className="px-2 tabular">{v.visits}</td></tr>
              ))}
              {byRegion.size === 0 && <tr><td className="px-4 py-3 text-ink-3" colSpan={3}>אין פעילות שבוצעה בתקופה.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>

      {detail && (
        <Card className="mt-5" id="details">
          <CardHeader title={detailTitle} action={<Link href={`/reports?${new URLSearchParams(base)}`} className="text-sm text-ink-3">סגירה</Link>} />
          {detail}
        </Card>
      )}
    </>
  );
}

function Row({ label, a, b, p }: { label: string; a: [number, string]; b: [number, string]; p: string }) {
  return (
    <tr>
      <td className="px-4 py-2.5 font-medium">{label}</td>
      <td className="px-2"><Link href={a[1]} className={clsx("tabular text-brand hover:underline")}>{a[0]}</Link></td>
      <td className="px-2"><Link href={b[1]} className="tabular text-brand hover:underline">{b[0]}</Link></td>
      <td className="px-2 tabular text-ink-3">{p}</td>
    </tr>
  );
}
