// כל חישובי התאריכים והשעות לפי Asia/Jerusalem.
// "תאריך מקומי" מיוצג כמחרוזת YYYY-MM-DD ושעה כ-HH:mm — כך אין תלות באזור הזמן של השרת.
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const TZ = "Asia/Jerusalem";

export function toUtc(localDate: string, time: string): Date {
  return fromZonedTime(`${localDate}T${time.length === 5 ? time + ":00" : time}`, TZ);
}
export function localDateOf(d: Date | string): string {
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, TZ, "yyyy-MM-dd");
}
export function localTimeOf(d: Date | string): string {
  return formatInTimeZone(typeof d === "string" ? new Date(d) : d, TZ, "HH:mm");
}
export function todayLocal(): string {
  return localDateOf(new Date());
}
/** 0 = ראשון ... 6 = שבת */
export function weekdayOf(localDate: string): number {
  return new Date(localDate + "T12:00:00Z").getUTCDay();
}
export function addDays(localDate: string, n: number): string {
  const d = new Date(localDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function diffDays(a: string, b: string): number {
  return Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86400000);
}
export function rangeDays(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
export function startOfWeek(localDate: string): string {
  return addDays(localDate, -weekdayOf(localDate));
}
export function startOfMonth(localDate: string): string {
  return localDate.slice(0, 8) + "01";
}
export function endOfMonth(localDate: string): string {
  const [y, m] = localDate.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${localDate.slice(0, 8)}${String(last).padStart(2, "0")}`;
}
export function addMonths(localDate: string, n: number): string {
  const [y, m] = localDate.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
/** גבולות יום מקומי ב-UTC, לשאילתות */
export function dayBoundsUtc(localDate: string): { from: string; to: string } {
  return { from: toUtc(localDate, "00:00").toISOString(), to: toUtc(addDays(localDate, 1), "00:00").toISOString() };
}

export const HEB_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const HEB_WEEKDAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
export const HEB_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export function formatHebDate(localDate: string, withWeekday = true): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const wd = withWeekday ? `יום ${HEB_WEEKDAYS[weekdayOf(localDate)]}, ` : "";
  return `${wd}${d} ב${HEB_MONTHS[m - 1]} ${y}`;
}
export function formatShortDate(localDate: string | null | undefined): string {
  if (!localDate) return "";
  const [, m, d] = localDate.slice(0, 10).split("-").map(Number);
  return `${d}/${m}`;
}
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return formatInTimeZone(new Date(iso), TZ, "dd/MM/yyyy HH:mm");
}
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return formatInTimeZone(new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso), TZ, "dd/MM/yyyy");
}
