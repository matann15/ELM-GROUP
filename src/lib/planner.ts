// מנוע תכנון: בונה הצעת תוכנית לתקופה ובודק כללי תכנון. פונקציות טהורות — ללא גישה למסד.
// זמני נסיעה הם הערכה לפי מרחק אווירי בין מרכזי יישובים; אין כאן אופטימיזציית מסלול אמיתית.
import { REGIONS, type RegionCode, estimateDriveMinutes, regionName } from "./geo";
import { addDays, rangeDays, startOfWeek, weekdayOf, timeToMinutes, minutesToTime, formatShortDate, HEB_WEEKDAYS } from "./time";

export type Coords = { lat: number; lng: number };

export type PlanCandidate = {
  companyId: string;
  name: string;
  siteId: string | null;
  region: RegionCode | null;
  regionCertain: boolean;
  navigable: boolean;
  coords: Coords | null;
  phoneOk: boolean;
  priority: "high" | "medium" | "low";
  status: "existing" | "past" | "prospect" | "irrelevant";
  classification: string;
  contactStatus: string;
  lastContactAt: string | null; // local date
  hasOpenOpportunity: boolean;
  hasFutureVisit: boolean;      // ביקור עתידי (מוצע/מתואם) כבר קיים במערכת
};

export type ExistingActivity = {
  id: string;
  type: "call" | "visit" | "task";
  status: string;
  companyId: string | null;
  date: string | null;     // local date
  start: string | null;    // HH:mm
  end: string | null;
  title: string;
  relatedVisitId?: string | null;
  customerConfirmed?: boolean;
  navigable?: boolean | null;
};

export type BlockedDay = { day: string; kind: string; note?: string | null };
export type RecurringMeeting = { weekday: number; start: string; end: string; title: string };

export type PlanSettings = {
  periodStart: string;
  periodEnd: string;
  today: string;
  homeBaseName: string;
  homeBaseCoords: Coords;
  workDays: number[];            // ברירת מחדל [0,1,2,3,4] = א׳–ה׳
  fieldDaysPerFullWeek: number;  // 3
  callsPerDay: number;           // 3
  minVisits: number;             // 2
  maxVisits: number;             // 3
  visitMinutes: number;          // 75
  departTime: string;            // "08:30"
  dayEnd: string;                // "17:00"
  maxDriveForThreeVisits: number;// דקות מבסיס היציאה: מעבר לזה — 2 ביקורים
};

export const DEFAULT_SETTINGS: Omit<PlanSettings, "periodStart" | "periodEnd" | "today" | "homeBaseName" | "homeBaseCoords"> = {
  workDays: [0, 1, 2, 3, 4],
  fieldDaysPerFullWeek: 3,
  callsPerDay: 3,
  minVisits: 2,
  maxVisits: 3,
  visitMinutes: 75,
  departTime: "08:30",
  dayEnd: "17:00",
  maxDriveForThreeVisits: 60,
};

export type Proposal = {
  key: string;
  type: "visit" | "call";
  date: string;
  start: string;
  end: string;
  companyId: string;
  companyName: string;
  siteId: string | null;
  region: RegionCode | null;
  purpose: string;
  relatedVisitKey?: string;
  driveEstimateMin?: number | null;
};

export type WeekSummary = {
  weekStart: string;
  daysInPeriod: string[];
  workingDays: string[];
  isPartial: boolean;
  fieldTarget: number;
  fieldDays: string[];
  explanation: string;
};

export type PlanResult = {
  proposals: Proposal[];
  weeks: WeekSummary[];
  shortages: string[];
  notes: string[];
  issues: RuleIssue[];
};

export type RuleIssue = { date: string | null; level: "error" | "warning"; message: string; ids?: string[] };

const BLOCKING_KINDS = new Set(["vacation", "blocked", "holiday"]);

function score(c: PlanCandidate, today: string): number {
  let s = { high: 30, medium: 15, low: 0 }[c.priority] ?? 0;
  if (c.status === "existing") s += 20;
  if (c.status === "past") s += 15;
  if (c.hasOpenOpportunity) s += 15;
  if (c.contactStatus === "reached" || c.contactStatus === "meeting_set") s += 10;
  if (c.contactStatus === "not_contacted") s += 5;
  if (c.lastContactAt && c.lastContactAt >= addDays(today, -14)) s -= 25;
  if (c.classification === "machining") s += 5;
  return s;
}

type Interval = { s: number; e: number };
function overlaps(a: Interval, b: Interval) {
  return a.s < b.e && b.s < a.e;
}
/** מוצא את השעה הפנויה הראשונה החל מ-from באורך len שאינה מתנגשת בתפוסים */
function firstFree(from: number, len: number, busy: Interval[], limit: number): number | null {
  let t = from;
  const sorted = [...busy].sort((a, b) => a.s - b.s);
  for (let guard = 0; guard < 50; guard++) {
    const clash = sorted.find((b) => overlaps({ s: t, e: t + len }, b));
    if (!clash) return t + len <= limit ? t : null;
    t = clash.e;
  }
  return null;
}

export function isWorkingDay(day: string, settings: Pick<PlanSettings, "workDays">, blocked: BlockedDay[]): boolean {
  if (!settings.workDays.includes(weekdayOf(day))) return false;
  return !blocked.some((b) => b.day === day && BLOCKING_KINDS.has(b.kind));
}

export function buildPlan(
  settings: PlanSettings,
  candidates: PlanCandidate[],
  existing: ExistingActivity[],
  blocked: BlockedDay[],
  recurring: RecurringMeeting[],
): PlanResult {
  const shortages: string[] = [];
  const notes: string[] = [];
  const proposals: Proposal[] = [];
  const allDays = rangeDays(settings.periodStart, settings.periodEnd);
  const isOffice = (d: string) => blocked.some((b) => b.day === d && b.kind === "office");
  const working = allDays.filter((d) => isWorkingDay(d, settings, blocked) && d >= settings.today);
  const pastDaysSkipped = allDays.filter((d) => d < settings.today && isWorkingDay(d, settings, blocked)).length;
  if (pastDaysSkipped > 0) notes.push(`${pastDaysSkipped} ימי עבודה בתקופה כבר עברו ולא תוכננו מחדש.`);

  const active = existing.filter((a) => !["cancelled"].includes(a.status));
  const busyByDay = new Map<string, Interval[]>();
  const addBusy = (d: string, iv: Interval) => busyByDay.set(d, [...(busyByDay.get(d) ?? []), iv]);
  for (const a of active) {
    if (a.date && a.start) addBusy(a.date, { s: timeToMinutes(a.start), e: a.end ? timeToMinutes(a.end) : timeToMinutes(a.start) + 15 });
  }
  for (const d of allDays) {
    for (const r of recurring.filter((r) => r.weekday === weekdayOf(d))) addBusy(d, { s: timeToMinutes(r.start), e: timeToMinutes(r.end) });
  }
  const existingVisitsOn = (d: string) => active.filter((a) => a.type === "visit" && a.date === d);
  const existingCallsOn = (d: string) => active.filter((a) => a.type === "call" && a.date === d);

  // ── שבועות וימי שטח ──
  const weeksMap = new Map<string, string[]>();
  for (const d of allDays) {
    const w = startOfWeek(d);
    weeksMap.set(w, [...(weeksMap.get(w) ?? []), d]);
  }
  const weeks: WeekSummary[] = [];
  for (const [weekStart, daysInPeriod] of weeksMap) {
    const nominalWorkDays = settings.workDays.map((wd) => addDays(weekStart, wd));
    const inPeriodWork = nominalWorkDays.filter((d) => d >= settings.periodStart && d <= settings.periodEnd);
    const workingDays = inPeriodWork.filter((d) => working.includes(d));
    const cutByPeriod = inPeriodWork.length < nominalWorkDays.length;
    const blockedCount = inPeriodWork.filter((d) => !isWorkingDay(d, settings, blocked)).length;
    const pastCount = inPeriodWork.filter((d) => d < settings.today && isWorkingDay(d, settings, blocked)).length;
    const isPartial = workingDays.length < nominalWorkDays.length;
    const fieldTarget = isPartial
      ? Math.min(workingDays.length, Math.round((settings.fieldDaysPerFullWeek * workingDays.length) / nominalWorkDays.length))
      : settings.fieldDaysPerFullWeek;

    const reasons: string[] = [];
    if (cutByPeriod) reasons.push(`רק ${inPeriodWork.length} מתוך ${nominalWorkDays.length} ימי העבודה בשבוע נמצאים בתקופה`);
    if (blockedCount) reasons.push(`${blockedCount} ימים חסומים/חופשה`);
    if (pastCount) reasons.push(`${pastCount} ימים שכבר עברו`);
    const label = `שבוע ${formatShortDate(weekStart)}–${formatShortDate(addDays(weekStart, 6))}`;
    const explanation = isPartial
      ? `${label}: שבוע חלקי — ${reasons.join("; ")}. ${workingDays.length} ימי עבודה לתכנון → ${fieldTarget} ימי שטח (יחסי ל-${settings.fieldDaysPerFullWeek} בשבוע מלא, מעוגל).`
      : `${label}: שבוע מלא — ${settings.fieldDaysPerFullWeek} ימי שטח.`;

    // ימי שטח: קודם ימים שכבר יש בהם ביקורים קיימים, אחר כך לפי העדפה ב׳, ג׳, ד׳, ה׳, א׳
    const pref = [1, 2, 3, 4, 0, 5, 6];
    const eligible = workingDays.filter((d) => !isOffice(d));
    const withVisits = eligible.filter((d) => existingVisitsOn(d).length > 0);
    const fieldDays = [...withVisits];
    const rest = eligible
      .filter((d) => !withVisits.includes(d))
      .filter((d) => d > settings.today) // ביקור חדש צריך לפחות יום תיאום מראש
      .filter((d) => {
        const busy = (busyByDay.get(d) ?? []).reduce((s, b) => s + (b.e - b.s), 0);
        return busy < 180; // יום עם יותר מ-3 שעות פגישות קבועות אינו יום שטח
      })
      .sort((a, b) => pref.indexOf(weekdayOf(a)) - pref.indexOf(weekdayOf(b)));
    for (const d of rest) {
      if (fieldDays.length >= fieldTarget) break;
      fieldDays.push(d);
    }
    fieldDays.sort();
    if (fieldDays.length < fieldTarget) {
      shortages.push(`${label}: נמצאו רק ${fieldDays.length} ימים מתאימים לשטח מתוך ${fieldTarget} (ימים חסומים, פגישות קבועות או יום התחלה ללא זמן לתיאום).`);
    }
    weeks.push({ weekStart, daysInPeriod, workingDays, isPartial, fieldTarget, fieldDays, explanation });
  }

  // ── מאגר מועמדים לביקור, לפי אזור ──
  const visitable = candidates.filter(
    (c) =>
      c.status !== "irrelevant" &&
      c.contactStatus !== "do_not_contact" &&
      !c.hasFutureVisit &&
      (c.classification === "machining" || c.status === "existing" || c.status === "past"),
  );
  const noAddress = visitable.filter((c) => !c.navigable).length;
  const uncertain = visitable.filter((c) => c.navigable && (!c.region || !c.regionCertain)).length;
  if (noAddress) notes.push(`${noAddress} חברות מתאימות לביקור לא נכללו כי אין להן כתובת ניווט (ת.ד. או כתובת חלקית). הן זמינות לשיחות.`);
  if (uncertain) notes.push(`${uncertain} חברות לא נכללו בביקורים כי שיוך האזור שלהן לא ודאי — יש לאשר אזור בכרטיס הלקוח.`);

  const pool = new Map<RegionCode, PlanCandidate[]>();
  for (const c of visitable) {
    if (!c.navigable || !c.region || !c.regionCertain) continue;
    pool.set(c.region, [...(pool.get(c.region) ?? []), c]);
  }
  for (const list of pool.values()) list.sort((a, b) => score(b, settings.today) - score(a, settings.today));
  const used = new Set<string>(active.filter((a) => a.type === "visit" && a.companyId).map((a) => a.companyId!));

  const driveFromHome = (r: RegionCode) => estimateDriveMinutes(settings.homeBaseCoords, { lat: REGIONS[r].lat, lng: REGIONS[r].lng }) ?? 999;
  const visitsByDay = new Map<string, Proposal[]>();
  const fieldDayList = weeks.flatMap((w) => w.fieldDays).sort();

  for (const day of fieldDayList) {
    const existingV = existingVisitsOn(day);
    // אזור היום: אם כבר יש ביקור קיים — האזור שלו; אחרת האזור עם הערך הגבוה ביותר
    let region: RegionCode | null = null;
    const existingRegion = existingV
      .map((v) => candidates.find((c) => c.companyId === v.companyId)?.region)
      .find((r): r is RegionCode => !!r);
    if (existingRegion) region = existingRegion;
    else {
      let best = -Infinity;
      for (const [r, list] of pool) {
        const avail = list.filter((c) => !used.has(c.companyId));
        if (avail.length === 0) continue;
        const top = avail.slice(0, settings.maxVisits).reduce((s, c) => s + score(c, settings.today) + 10, 0);
        const neighborsAvail = REGIONS[r].neighbors.reduce((s, n) => s + (pool.get(n)?.filter((c) => !used.has(c.companyId)).length ?? 0), 0);
        const value = top + Math.min(neighborsAvail, 3) * 2 - driveFromHome(r) / 6;
        if (value > best) { best = value; region = r; }
      }
    }
    if (!region) {
      shortages.push(`${formatShortDate(day)}: אין עוד לקוחות מתאימים עם כתובת ניווט לביקור.`);
      continue;
    }
    const drive = driveFromHome(region);
    const target = Math.max(0, (drive <= settings.maxDriveForThreeVisits ? settings.maxVisits : settings.minVisits) - existingV.length);
    const picks: PlanCandidate[] = [];
    const take = (list: PlanCandidate[] | undefined) => {
      for (const c of list ?? []) {
        if (picks.length >= target) return;
        if (used.has(c.companyId) || picks.some((p) => p.companyId === c.companyId)) continue;
        picks.push(c);
      }
    };
    take(pool.get(region));
    for (const n of REGIONS[region].neighbors) if (picks.length < target) take(pool.get(n));

    // סדר ביקורים: מהקרוב לבסיס אל הרחוק (הערכה גסה; לא אופטימיזציה)
    picks.sort((a, b) => (estimateDriveMinutes(settings.homeBaseCoords, a.coords) ?? 0) - (estimateDriveMinutes(settings.homeBaseCoords, b.coords) ?? 0));
    let cursor = timeToMinutes(settings.departTime);
    let prev: Coords | null = settings.homeBaseCoords;
    const dayProps: Proposal[] = [];
    for (const c of picks) {
      const leg = estimateDriveMinutes(prev, c.coords) ?? 30;
      const start = firstFree(roundUp15(cursor + leg), settings.visitMinutes, busyByDay.get(day) ?? [], timeToMinutes(settings.dayEnd));
      if (start === null) {
        shortages.push(`${formatShortDate(day)}: אין זמן פנוי לביקור נוסף (${c.name}) — היום מלא לפי הערכת הנסיעה.`);
        break;
      }
      const p: Proposal = {
        key: `v-${day}-${c.companyId}`,
        type: "visit",
        date: day,
        start: minutesToTime(start),
        end: minutesToTime(start + settings.visitMinutes),
        companyId: c.companyId,
        companyName: c.name,
        siteId: c.siteId,
        region: c.region,
        purpose: c.status === "existing" ? "ביקור לקוח קיים — בירור צרכים ומעקב" : "ביקור היכרות ואפיון צרכים",
        driveEstimateMin: leg,
      };
      addBusy(day, { s: start, e: start + settings.visitMinutes });
      dayProps.push(p);
      used.add(c.companyId);
      cursor = start + settings.visitMinutes;
      prev = c.coords;
    }
    const totalVisits = dayProps.length + existingV.length;
    if (totalVisits < settings.minVisits) {
      shortages.push(`${formatShortDate(day)} (${regionName(region)}): רק ${totalVisits} ביקורים — אין מספיק לקוחות מתאימים באזור ובאזורים הסמוכים.`);
    }
    if (drive > settings.maxDriveForThreeVisits && dayProps.length) {
      notes.push(`${formatShortDate(day)}: ${regionName(region)} רחוק מ${settings.homeBaseName} (כ-${drive} דק׳ לפי הערכה) — תוכננו עד ${settings.minVisits} ביקורים.`);
    }
    visitsByDay.set(day, dayProps);
    proposals.push(...dayProps);
  }

  // ── שיחות: תיאום לכל ביקור מוצע + שיחות יזומות, לפחות 3 ביום לחברות שונות ──
  const callsByDay = new Map<string, Proposal[]>();
  const companiesVisitedOn = (d: string) =>
    new Set([...(visitsByDay.get(d) ?? []).map((p) => p.companyId), ...existingVisitsOn(d).map((a) => a.companyId).filter(Boolean) as string[]]);
  const companiesCalledOn = (d: string) =>
    new Set([...(callsByDay.get(d) ?? []).map((p) => p.companyId), ...existingCallsOn(d).map((a) => a.companyId).filter(Boolean) as string[]]);
  const callDaysBefore = (visitDay: string) => working.filter((d) => d < visitDay && d >= settings.today).sort().reverse();

  const pushCall = (day: string, p: Omit<Proposal, "start" | "end">) => {
    const list = callsByDay.get(day) ?? [];
    const isField = fieldDayList.includes(day);
    const base = isField ? timeToMinutes("07:45") : timeToMinutes("09:00");
    const start = firstFree(base + list.length * 15, 15, busyByDay.get(day) ?? [], timeToMinutes(settings.dayEnd) + 120) ?? base;
    const full: Proposal = { ...p, start: minutesToTime(start), end: minutesToTime(start + 15) };
    addBusy(day, { s: start, e: start + 15 });
    callsByDay.set(day, [...list, full]);
    proposals.push(full);
  };

  for (const v of proposals.filter((p) => p.type === "visit")) {
    const options = callDaysBefore(v.date);
    // מעדיפים 2 ימי עבודה לפני הביקור, ויום שבו אין ביקור באותה חברה ואין עדיין שיחה אליה
    const ordered = [...options.slice(1, 3), options[0], ...options.slice(3)].filter(Boolean);
    const day = ordered.find((d) => !companiesVisitedOn(d).has(v.companyId) && !companiesCalledOn(d).has(v.companyId));
    if (!day) {
      notes.push(`לביקור ב${v.companyName} (${formatShortDate(v.date)}) אין יום עבודה פנוי לשיחת תיאום לפני הביקור.`);
      continue;
    }
    pushCall(day, {
      key: `c-${day}-${v.companyId}`,
      type: "call",
      date: day,
      companyId: v.companyId,
      companyName: v.companyName,
      siteId: v.siteId,
      region: v.region,
      purpose: `תיאום ביקור ל${HEB_WEEKDAYS[weekdayOf(v.date)]} ${formatShortDate(v.date)} ${v.start}`,
      relatedVisitKey: v.key,
    });
  }

  const callable = candidates
    .filter((c) => c.status !== "irrelevant" && c.contactStatus !== "do_not_contact" && c.phoneOk)
    .filter((c) => !["supplier", "plastic", "service"].includes(c.classification))
    .sort((a, b) => score(b, settings.today) - score(a, settings.today));
  const calledInPeriod = new Set<string>([
    ...proposals.filter((p) => p.type === "call").map((p) => p.companyId),
    ...active.filter((a) => a.type === "call" && a.companyId).map((a) => a.companyId!),
  ]);
  const visitedInPeriod = new Set(proposals.filter((p) => p.type === "visit").map((p) => p.companyId));
  let callShortDays = 0;
  for (const day of working) {
    const have = companiesCalledOn(day).size;
    let need = settings.callsPerDay - have;
    if (need <= 0) continue;
    const visited = companiesVisitedOn(day);
    for (const c of callable) {
      if (need <= 0) break;
      if (calledInPeriod.has(c.companyId) || visitedInPeriod.has(c.companyId) || visited.has(c.companyId)) continue;
      pushCall(day, {
        key: `c-${day}-${c.companyId}`,
        type: "call",
        date: day,
        companyId: c.companyId,
        companyName: c.name,
        siteId: c.siteId,
        region: c.region,
        purpose: c.contactStatus === "not_contacted" ? "שיחת היכרות ואימות פרטים" : "שיחת מעקב",
      });
      calledInPeriod.add(c.companyId);
      need--;
    }
    if (need > 0) callShortDays++;
  }
  if (callShortDays) shortages.push(`ב-${callShortDays} ימים אין מספיק חברות עם טלפון תקין כדי להגיע ל-${settings.callsPerDay} שיחות. לא נוספו רשומות פיקטיביות.`);

  proposals.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const issues = validatePlan(
    settings,
    [
      ...existing,
      ...proposals.map((p) => ({
        id: p.key,
        type: p.type,
        status: "proposed",
        companyId: p.companyId,
        date: p.date,
        start: p.start,
        end: p.end,
        title: p.companyName,
        relatedVisitId: p.relatedVisitKey ?? null,
        navigable: true,
      })),
    ],
    blocked,
    recurring,
    weeks,
  );
  return { proposals, weeks, shortages, notes, issues };
}

function roundUp15(m: number) {
  return Math.ceil(m / 15) * 15;
}

/** בדיקת כללי התכנון על אוסף פעולות (קיימות ו/או מוצעות). */
export function validatePlan(
  settings: Pick<PlanSettings, "periodStart" | "periodEnd" | "workDays" | "callsPerDay" | "minVisits" | "maxVisits" | "fieldDaysPerFullWeek" | "today">,
  acts: ExistingActivity[],
  blocked: BlockedDay[],
  recurring: RecurringMeeting[],
  weeks?: WeekSummary[],
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const live = acts.filter((a) => a.date && !["cancelled", "postponed"].includes(a.status));
  const days = rangeDays(settings.periodStart, settings.periodEnd);
  for (const d of days) {
    const dayActs = live.filter((a) => a.date === d);
    const working = isWorkingDay(d, settings, blocked);
    if (!working) {
      if (dayActs.length) issues.push({ date: d, level: "error", message: `${dayActs.length} פעולות ביום שאינו יום עבודה / יום חסום`, ids: dayActs.map((a) => a.id) });
      continue;
    }
    if (d < settings.today) continue;
    const calls = dayActs.filter((a) => a.type === "call");
    const visits = dayActs.filter((a) => a.type === "visit");
    const callCompanies = new Set(calls.map((c) => c.companyId).filter(Boolean));
    const visitCompanies = new Set(visits.map((v) => v.companyId).filter(Boolean));
    if (callCompanies.size < settings.callsPerDay) {
      issues.push({ date: d, level: "warning", message: `${callCompanies.size} שיחות לחברות שונות (נדרשות לפחות ${settings.callsPerDay})` });
    }
    const dupCalls = calls.filter((c, i) => c.companyId && calls.findIndex((x) => x.companyId === c.companyId) !== i);
    if (dupCalls.length) issues.push({ date: d, level: "warning", message: "יותר משיחה אחת לאותה חברה באותו יום", ids: dupCalls.map((c) => c.id) });
    const callsToVisited = calls.filter((c) => c.companyId && visitCompanies.has(c.companyId));
    if (callsToVisited.length) issues.push({ date: d, level: "warning", message: "שיחה לחברה שמבקרים בה באותו יום — אינה נספרת למכסת השיחות", ids: callsToVisited.map((c) => c.id) });
    if (visits.length > settings.maxVisits) issues.push({ date: d, level: "warning", message: `${visits.length} ביקורים ביום (מעל ${settings.maxVisits})`, ids: visits.map((v) => v.id) });
    if (visits.length > 0 && visits.length < settings.minVisits) issues.push({ date: d, level: "warning", message: `רק ${visits.length} ביקור ביום שטח (ברירת מחדל ${settings.minVisits}–${settings.maxVisits})` });
    for (const v of visits) {
      if (v.navigable === false) issues.push({ date: d, level: "error", message: `ביקור ב"${v.title}" ללא כתובת ניווט (ת.ד./כתובת חלקית)`, ids: [v.id] });
      if (v.status === "proposed") {
        const coord = live.find((a) => a.type === "call" && a.relatedVisitId === v.id && a.date && a.date < d);
        if (!coord) issues.push({ date: d, level: "warning", message: `ביקור מוצע ב"${v.title}" ללא שיחת תיאום לפני יום הביקור`, ids: [v.id] });
      }
    }
    // התנגשויות שעות
    const timed = dayActs.filter((a) => a.start).map((a) => ({ a, s: timeToMinutes(a.start!), e: a.end ? timeToMinutes(a.end) : timeToMinutes(a.start!) + 15 }));
    const rec = recurring.filter((r) => r.weekday === weekdayOf(d)).map((r) => ({ title: r.title, s: timeToMinutes(r.start), e: timeToMinutes(r.end) }));
    for (let i = 0; i < timed.length; i++) {
      for (let j = i + 1; j < timed.length; j++) {
        if (overlaps(timed[i], timed[j])) issues.push({ date: d, level: "error", message: `התנגשות שעות: "${timed[i].a.title}" ו"${timed[j].a.title}"`, ids: [timed[i].a.id, timed[j].a.id] });
      }
      for (const r of rec) if (overlaps(timed[i], r)) issues.push({ date: d, level: "error", message: `"${timed[i].a.title}" מתנגש בפגישה הקבועה "${r.title}"`, ids: [timed[i].a.id] });
    }
  }
  // ימי שטח בשבוע
  const weekStarts = Array.from(new Set(days.map(startOfWeek)));
  for (const w of weekStarts) {
    const summary = weeks?.find((x) => x.weekStart === w);
    const weekDays = rangeDays(w, addDays(w, 6)).filter((d) => d >= settings.periodStart && d <= settings.periodEnd && d >= settings.today);
    if (!weekDays.length) continue;
    const fieldDays = new Set(live.filter((a) => a.type === "visit" && a.date && weekDays.includes(a.date)).map((a) => a.date));
    const nominal = settings.workDays.length;
    const workingCount = weekDays.filter((d) => isWorkingDay(d, settings, blocked)).length;
    const target = summary?.fieldTarget ?? (workingCount >= nominal ? settings.fieldDaysPerFullWeek : Math.round((settings.fieldDaysPerFullWeek * workingCount) / nominal));
    if (fieldDays.size < target) issues.push({ date: w, level: "warning", message: `שבוע ${formatShortDate(w)}: ${fieldDays.size} ימי שטח מתוך ${target} נדרשים` });
    if (fieldDays.size > Math.max(target, settings.fieldDaysPerFullWeek)) issues.push({ date: w, level: "warning", message: `שבוע ${formatShortDate(w)}: ${fieldDays.size} ימי שטח — יותר מהיעד (${target})` });
  }
  return issues;
}
