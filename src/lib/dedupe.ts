// זיהוי כפילויות אפשריות. התוצאה היא הצעה לבדיקה בלבד — לא מתבצע איחוד אוטומטי.
import { normalizeForMatch } from "./geo";
import { phoneDigits } from "./normalize";

export type DedupeInput = {
  id: string;
  nameNormalized: string;
  phones: (string | null)[];
  emails: (string | null)[];
  addresses: (string | null)[];
};
export type DuplicatePair = { a: string; b: string; reasons: string[]; score: number };

const GENERIC = new Set(["עיבוד", "שבבי", "שבב", "מכניקה", "מתכת", "חריטה", "כרסום", "הנדסה", "מדויק", "מדוייק", "בית", "מלאכה", "ל", "ו", "ייצור", "cnc", "עדינה", "צפון", "דרום", "מרכז"]);
function tokens(name: string) {
  return name.split(/\s+/).filter((t) => t.length > 1 && !GENERIC.has(t));
}
function nameSimilarity(a: string, b: string): "exact" | "similar" | null {
  if (!a || !b) return null;
  if (a === b) return "exact";
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return null;
  const A = new Set(ta), B = new Set(tb);
  const inter = [...A].filter((t) => B.has(t)).length;
  const jac = inter / new Set([...A, ...B]).size;
  if (jac >= 0.75) return "similar";
  const ja = ta.join(" "), jb = tb.join(" ");
  if (ja.length >= 5 && jb.length >= 5 && (ja.includes(jb) || jb.includes(ja))) return "similar";
  return null;
}
function addrKey(a: string | null) {
  if (!a) return "";
  if (/ת\.?\s?ד/.test(a)) return ""; // תיבות דואר אינן בסיס להשוואה
  return normalizeForMatch(a).trim();
}

export function findDuplicates(items: DedupeInput[]): DuplicatePair[] {
  const out: DuplicatePair[] = [];
  const prepared = items.map((i) => ({
    ...i,
    p: new Set(i.phones.map(phoneDigits).filter((d) => d.length >= 9)),
    e: new Set(i.emails.filter(Boolean).map((e) => e!.toLowerCase().trim())),
    ad: new Set(i.addresses.map(addrKey).filter((k) => k.length >= 6)),
  }));
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const x = prepared[i], y = prepared[j];
      const reasons: string[] = [];
      let score = 0;
      if ([...x.p].some((d) => y.p.has(d))) { reasons.push("טלפון זהה"); score += 40; }
      if ([...x.e].some((e) => y.e.has(e))) { reasons.push("אימייל זהה"); score += 40; }
      const ns = nameSimilarity(x.nameNormalized, y.nameNormalized);
      if (ns === "exact") { reasons.push("שם זהה"); score += 35; }
      else if (ns === "similar") { reasons.push("שם דומה"); score += 20; }
      if ([...x.ad].some((k) => y.ad.has(k))) { reasons.push("כתובת זהה"); score += 25; }
      if (score >= 35 || (ns && reasons.length >= 2)) {
        const [a, b] = x.id < y.id ? [x.id, y.id] : [y.id, x.id];
        out.push({ a, b, reasons, score });
      }
    }
  }
  return out.sort((p, q) => q.score - p.score);
}
