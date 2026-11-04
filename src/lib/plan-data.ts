import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CITIES, cityCoords, findCityByText, type RegionCode } from "./geo";
import { isPlausibleIsraeliPhone } from "./normalize";
import { localDateOf, localTimeOf, toUtc, addDays, todayLocal } from "./time";
import { buildPlan, DEFAULT_SETTINGS, type BlockedDay, type ExistingActivity, type PlanCandidate, type PlanSettings, type RecurringMeeting } from "./planner";

export type PlanInput = {
  ownerId: string;
  periodStart: string;
  periodEnd: string;
  homeBase: string;
  fieldDaysPerFullWeek: number;
  callsPerDay: number;
  minVisits: number;
  maxVisits: number;
  replacePrevious: boolean;
};

export function readPlanInput(fd: FormData, profile: { id: string; role: string }): PlanInput | { error: string } {
  const g = (k: string) => (typeof fd.get(k) === "string" ? String(fd.get(k)).trim() : "");
  const mode = g("mode");
  let start = g("start"), end = g("end");
  if (mode === "month") {
    const m = g("month");
    if (!/^\d{4}-\d{2}$/.test(m)) return { error: "בחרו חודש" };
    start = `${m}-01`;
    const [y, mm] = m.split("-").map(Number);
    end = `${m}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, "0")}`;
    const from = g("from");
    if (from && from > start && from <= end) start = from; // תאריך התחלה בתוך החודש
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { error: "תאריכים לא תקינים" };
  if (end < start) return { error: "תאריך הסיום לפני תאריך ההתחלה" };
  if (+new Date(end) - +new Date(start) > 92 * 86400000) return { error: "תקופת תכנון מקסימלית: 3 חודשים" };
  const num = (k: string, d: number, min: number, max: number) => {
    const n = Number(g(k));
    return Number.isFinite(n) && g(k) !== "" ? Math.min(max, Math.max(min, Math.round(n))) : d;
  };
  const minVisits = num("min_visits", DEFAULT_SETTINGS.minVisits, 1, 5);
  return {
    ownerId: profile.role === "admin" && g("owner_id") ? g("owner_id") : profile.id,
    periodStart: start,
    periodEnd: end,
    homeBase: g("home_base") || "קריית ביאליק",
    fieldDaysPerFullWeek: num("field_days", DEFAULT_SETTINGS.fieldDaysPerFullWeek, 0, 5),
    callsPerDay: num("calls_per_day", DEFAULT_SETTINGS.callsPerDay, 0, 20),
    minVisits,
    maxVisits: Math.max(minVisits, num("max_visits", DEFAULT_SETTINGS.maxVisits, 1, 6)),
    replacePrevious: fd.get("replace_previous") === "on",
  };
}

export async function loadPlanContext(supabase: SupabaseClient, input: PlanInput) {
  const home = findCityByText(input.homeBase) ?? CITIES.find((c) => c.name === "קריית ביאליק")!;
  const settings: PlanSettings = {
    ...DEFAULT_SETTINGS,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    today: todayLocal(),
    homeBaseName: home.name,
    homeBaseCoords: { lat: home.lat, lng: home.lng },
    fieldDaysPerFullWeek: input.fieldDaysPerFullWeek,
    callsPerDay: input.callsPerDay,
    minVisits: input.minVisits,
    maxVisits: input.maxVisits,
  };
  // טווח רחב מעט יותר — כדי לראות שיחות תיאום לפני תחילת התקופה
  const from = toUtc(addDays(input.periodStart, -7), "00:00").toISOString();
  const to = toUtc(addDays(input.periodEnd, 1), "00:00").toISOString();

  const [companies, acts, futureVisits, blocked, recurring] = await Promise.all([
    supabase
      .from("companies")
      .select("id,name,status,classification,priority,contact_status,last_contact_at,phone_main,company_sites(id,city,navigable,region_code,region_certain,is_primary),contacts(phone,mobile),opportunities(stage)")
      .eq("owner_id", input.ownerId)
      .is("merged_into", null)
      .neq("status", "irrelevant")
      .limit(5000),
    supabase
      .from("activities")
      .select("id,type,status,company_id,starts_at,ends_at,due_date,related_visit_id,plan_id,customer_confirmed,completed_at,title,company:companies(name),site:company_sites(navigable)")
      .eq("owner_id", input.ownerId)
      .gte("starts_at", from)
      .lt("starts_at", to),
    supabase.from("activities").select("company_id").eq("owner_id", input.ownerId).eq("type", "visit").in("status", ["proposed", "scheduled"]).gte("starts_at", new Date().toISOString()),
    supabase.from("blocked_days").select("day,kind,note").eq("owner_id", input.ownerId).gte("day", input.periodStart).lte("day", input.periodEnd),
    supabase.from("recurring_meetings").select("weekday,start_time,end_time,title").eq("owner_id", input.ownerId),
  ]);
  if (companies.error) throw companies.error;
  if (acts.error) throw acts.error;

  // הצעות קודמות שעדיין לא תואמו — אפשר להחליף אותן (רק אם המשתמש ביקש)
  const replaceable = new Set<string>();
  if (input.replacePrevious) {
    const startIso = toUtc(input.periodStart, "00:00").toISOString();
    const startIsoNow = startIso > new Date().toISOString() ? startIso : new Date().toISOString();
    for (const a of acts.data ?? []) {
      if (a.plan_id && a.type === "visit" && a.status === "proposed" && !a.customer_confirmed && a.starts_at! >= startIsoNow) replaceable.add(a.id);
    }
    for (const a of acts.data ?? []) {
      if (a.plan_id && a.type === "call" && a.status === "scheduled" && !a.completed_at && a.related_visit_id && replaceable.has(a.related_visit_id)) replaceable.add(a.id);
    }
  }

  const existing: ExistingActivity[] = (acts.data ?? [])
    .filter((a) => !replaceable.has(a.id))
    .map((a) => ({
      id: a.id,
      type: a.type,
      status: a.status,
      companyId: a.company_id,
      date: a.starts_at ? localDateOf(a.starts_at) : a.due_date,
      start: a.starts_at ? localTimeOf(a.starts_at) : null,
      end: a.ends_at ? localTimeOf(a.ends_at) : null,
      title: (a.company as unknown as { name: string } | null)?.name ?? a.title ?? "",
      relatedVisitId: a.related_visit_id,
      customerConfirmed: a.customer_confirmed,
      navigable: (a.site as unknown as { navigable: boolean } | null)?.navigable ?? null,
    }));

  const futureVisitCompanies = new Set((futureVisits.data ?? []).filter((v) => v.company_id).map((v) => v.company_id as string));
  const replacedCompanies = new Set((acts.data ?? []).filter((a) => replaceable.has(a.id) && a.type === "visit").map((a) => a.company_id));
  const candidates: PlanCandidate[] = (companies.data ?? []).map((c) => {
    const sites = (c.company_sites ?? []) as { id: string; city: string | null; navigable: boolean; region_code: string | null; region_certain: boolean; is_primary: boolean }[];
    const site = sites.filter((s) => s.navigable).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0] ?? sites[0] ?? null;
    const phones = [c.phone_main, ...((c.contacts ?? []) as { phone: string | null; mobile: string | null }[]).flatMap((x) => [x.phone, x.mobile])];
    return {
      companyId: c.id,
      name: c.name,
      siteId: site?.id ?? null,
      region: (site?.region_code as RegionCode) ?? null,
      regionCertain: !!site?.region_certain,
      navigable: !!site?.navigable,
      coords: cityCoords(site?.city),
      phoneOk: phones.some((p) => isPlausibleIsraeliPhone(p)),
      priority: c.priority,
      status: c.status,
      classification: c.classification,
      contactStatus: c.contact_status,
      lastContactAt: c.last_contact_at ? localDateOf(c.last_contact_at) : null,
      hasOpenOpportunity: ((c.opportunities ?? []) as { stage: string }[]).some((o) => !["won", "lost"].includes(o.stage)),
      hasFutureVisit: futureVisitCompanies.has(c.id) && !replacedCompanies.has(c.id),
    };
  });

  const blockedDays: BlockedDay[] = (blocked.data ?? []).map((b) => ({ day: b.day, kind: b.kind, note: b.note }));
  const rec: RecurringMeeting[] = (recurring.data ?? []).map((r) => ({ weekday: r.weekday, start: String(r.start_time).slice(0, 5), end: String(r.end_time).slice(0, 5), title: r.title }));
  return { settings, candidates, existing, blockedDays, recurring: rec, replaceable: [...replaceable], companyCount: candidates.length };
}

/**
 * שמירת תוכנית: מחשב מחדש בצד השרת ושומר רק את ההצעות שנבחרו. לא נוגע בפעולות קיימות,
 * מלבד החלפה (אם התבקשה) של ביקורים מוצעים מתוכניות קודמות שלא תואמו ושיחות התיאום שלהם.
 */
export async function persistPlan(
  supabase: SupabaseClient,
  input: PlanInput,
  selected: Set<string> | "all",
): Promise<{ error: string } | { planId: string; visits: number; calls: number; plan: ReturnType<typeof buildPlan> }> {
  const ctx = await loadPlanContext(supabase, input);
  const plan = buildPlan(ctx.settings, ctx.candidates, ctx.existing, ctx.blockedDays, ctx.recurring);
  const chosen = selected === "all" ? plan.proposals : plan.proposals.filter((p) => selected.has(p.key));
  if (!chosen.length) return { error: "הנתונים השתנו מאז התצוגה המקדימה. הפיקו תצוגה מקדימה מחדש." };

    if (input.replacePrevious && ctx.replaceable.length) {
      const { error } = await supabase.from("activities").delete().in("id", ctx.replaceable).in("status", ["proposed", "scheduled"]).is("completed_at", null);
      if (error) throw error;
    }

    const { data: planRow, error: e1 } = await supabase
      .from("plans")
      .insert({
        owner_id: input.ownerId,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        home_base: ctx.settings.homeBaseName,
        settings: { fieldDaysPerFullWeek: input.fieldDaysPerFullWeek, callsPerDay: input.callsPerDay, minVisits: input.minVisits, maxVisits: input.maxVisits },
        summary: { weeks: plan.weeks.map((w) => w.explanation), shortages: plan.shortages, notes: plan.notes },
      })
      .select("id")
      .single();
    if (e1) throw e1;

    const row = (p: (typeof chosen)[number]) => {
      const starts = toUtc(p.date, p.start);
      const ends = toUtc(p.date, p.end);
      return {
        type: p.type,
        status: p.type === "visit" ? "proposed" : "scheduled",
        owner_id: input.ownerId,
        company_id: p.companyId,
        site_id: p.siteId,
        plan_id: planRow.id,
        purpose: p.purpose,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
      };
    };
    const visits = chosen.filter((p) => p.type === "visit");
    const keyToId = new Map<string, string>();
    if (visits.length) {
      const { data, error } = await supabase.from("activities").insert(visits.map(row)).select("id,company_id,starts_at");
      if (error) throw error;
      for (const v of visits) {
        const match = data.find((d) => d.company_id === v.companyId && new Date(d.starts_at).getTime() === toUtc(v.date, v.start).getTime());
        if (match) keyToId.set(v.key, match.id);
      }
    }
    const calls = chosen.filter((p) => p.type === "call");
    if (calls.length) {
      const { error } = await supabase.from("activities").insert(
        calls.map((c) => ({ ...row(c), related_visit_id: c.relatedVisitKey ? keyToId.get(c.relatedVisitKey) ?? null : null })),
      );
      if (error) throw error;
    }
  return { planId: planRow.id, visits: visits.length, calls: calls.length, plan };
}
