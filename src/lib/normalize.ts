// ניקוי ונרמול נתונים מהייבוא. הערכים המקוריים נשמרים תמיד ב-raw.

export type Classification = "machining" | "sheet_metal" | "supplier" | "service" | "plastic" | "other" | "unclassified";

/** מחזיר מחרוזת טלפון נקייה; לעולם לא מספר (כדי לא לאבד 0 מוביל). */
export function cleanPhone(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  // ערך מספרי שהגיע מאקסל ללא 0 מוביל (למשל 48768382)
  if (/^\d{8,9}$/.test(s) && !s.startsWith("0")) s = "0" + s;
  return s.replace(/\s+/g, " ");
}

/** רק ספרות, לצורך השוואה וזיהוי כפילויות. "04-9525333/4" → "049525333" */
export function phoneDigits(v: string | null | undefined): string {
  if (!v) return "";
  const first = String(v).split(/[\/,;]| או /)[0];
  let d = first.replace(/\D/g, "");
  if (d.startsWith("972")) d = "0" + d.slice(3);
  if (d.length >= 8 && !d.startsWith("0")) d = "0" + d;
  return d;
}

export function isPlausibleIsraeliPhone(v: string | null | undefined): boolean {
  const d = phoneDigits(v);
  return /^0(5\d{8}|[2-46-9]\d{7}|7\d{8})$/.test(d);
}

export function cleanEmail(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  return s;
}
export function isPlausibleEmail(s: string | null): boolean {
  return !!s && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s);
}

const NAME_NOISE = [/בע["״']?מ/g, /\(\d{4}\)/g, /\bltd\.?\b/gi, /\binc\.?\b/gi, /חברה/g, /תעשיות/g, /["'״׳.,\-–()]/g];

export function normalizeName(name: string): string {
  let s = (name ?? "").toLowerCase();
  for (const re of NAME_NOISE) s = s.replace(re, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** מפתח ייבוא יציב: שם מנורמל + ספרות הטלפון. ייבוא חוזר של אותה שורה יזוהה ולא ייצור לקוח חדש. */
export function importKey(name: string, phone: string | null): string {
  return `${normalizeName(name)}|${phoneDigits(phone)}`;
}

const KW = {
  machining: ["עיבוד שבבי", "עיבודד שבבי", "שבבי", "חריטה", "חירטה", "כרסום", "cnc", "השחזה", "השחזות", "מכניקה עדינה", "חלקים מדויקים", "חלקים מדוייקים", "swiss", "קידוח", "טורנר", "חיתוך בחוט", "מבלטים", "תבניות"],
  sheet_metal: ["מסגרות", "ריתוך", "ריתוכים", "פח", "זיווד", "כיפוף"],
  supplier: ["אספקה", "ציוד", "סוכנויות", "סוכנות", "יבוא", "יבואן", "כלי עבודה", "מיסבים", "חלקי חילוף", "שיווק", "מכירת"],
  service: ["שירות", "תיקון", "שיפוץ", "הובלה", "ייעוץ", "תכנון"],
  plastic: ["פלסטיק", "פלסטיקה", "שקיות", "אריזה", "הזרקת"],
};

export type ClassificationResult = {
  classification: Classification;  // מה שנשמר בפועל
  suggested: Classification;       // מה שהזיהוי האוטומטי מציע
  needsReview: boolean;
  reason: string;
};

/**
 * סיווג שמרני. מפעל מסווג אוטומטית כ"עיבוד שבבי" רק אם יש מילות מפתח של עיבוד שבבי
 * ואין סימנים לספק, שירות או פלסטיק. ספקים, שירותים ופלסטיק לעולם אינם מסווגים
 * אוטומטית כמפעל שבבי — הם נשמרים כ"לא מסווג" עם הצעה ומסומנים לבדיקה.
 */
export function classify(specialization: string | null | undefined, name: string | null | undefined): ClassificationResult {
  const text = `${specialization ?? ""} ${name ?? ""}`.toLowerCase();
  const has = (k: keyof typeof KW) => KW[k].some((w) => text.includes(w));
  const m = has("machining"), sm = has("sheet_metal"), sup = has("supplier"), srv = has("service"), pl = has("plastic");
  // "מכונות לעיבוד שבבי" בלבד יכול להיות גם ספק מכונות (מתחרה) — לבדיקה
  const onlyMachinesCategory = /מכונות (כלים )?ל?עיבוד שבבי/.test(text) && !/(חריטה|כרסום|cnc|ייצור|קבלנות|עיבוד שבבי מדויק)/.test(text);

  if (pl) return { classification: "unclassified", suggested: "plastic", needsReview: true, reason: "מילות מפתח של פלסטיק/אריזה" };
  if (sup && !m) return { classification: "unclassified", suggested: "supplier", needsReview: true, reason: "נראה כספק/בית מסחר" };
  if (srv && !m) return { classification: "unclassified", suggested: "service", needsReview: true, reason: "נראה כנותן שירות" };
  if (m && (sup || srv)) return { classification: "unclassified", suggested: "machining", needsReview: true, reason: "סימנים מעורבים: עיבוד שבבי וגם ספק/שירות" };
  if (m && onlyMachinesCategory) return { classification: "machining", suggested: "machining", needsReview: true, reason: "קטגוריית 'מכונות לעיבוד שבבי' — לוודא שזה מפעל ולא ספק מכונות" };
  if (m) return { classification: "machining", suggested: "machining", needsReview: false, reason: "מילות מפתח של עיבוד שבבי" };
  if (sm) return { classification: "sheet_metal", suggested: "sheet_metal", needsReview: true, reason: "מסגרות/ריתוך — לא בהכרח עיבוד שבבי" };
  if (!text.trim()) return { classification: "unclassified", suggested: "unclassified", needsReview: true, reason: "אין תחום התמחות" };
  return { classification: "unclassified", suggested: "other", needsReview: true, reason: "לא זוהה תחום" };
}

/** עמודת "מופיע ברשימות אחרות" מכילה לעתים שמות או הערות — מזהים זאת. */
export function interpretOtherLists(v: unknown): { appearsInOtherLists: string | null; misplacedNote: string | null } {
  const s = v === null || v === undefined ? "" : String(v).trim();
  if (!s) return { appearsInOtherLists: null, misplacedNote: null };
  if (/מופיע/.test(s)) return { appearsInOtherLists: s, misplacedNote: null };
  return { appearsInOtherLists: null, misplacedNote: s };
}

export function cellToString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("text" in o) return String(o.text ?? "").trim() || null;
    if ("result" in o) return String(o.result ?? "").trim() || null;
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join("").trim() || null;
    if (v instanceof Date) return v.toISOString();
  }
  const s = String(v).trim();
  return s || null;
}
