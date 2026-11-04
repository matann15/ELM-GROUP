// פענוח קבצי XLSX/CSV, מיפוי עמודות והכנת רשומות מנוקות לצד הנתונים המקוריים.
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { parseAddress, type ParsedAddress } from "./geo";
import {
  cellToString, classify, cleanEmail, cleanPhone, importKey, interpretOtherLists,
  isPlausibleEmail, isPlausibleIsraeliPhone, normalizeName, type ClassificationResult,
} from "./normalize";

export type RawRow = Record<string, string | null>;

export type PriorHint = "bad_phone" | "not_interested" | "no_answer" | "call_later" | "other";
/** פענוח שמרני של הערות שיחה קודמות. משמש רק לסימון ולהורדת עדיפות — לא לשינוי סטטוס לקוח. */
export function interpretPriorOutcome(t: string): PriorHint {
  if (/שגוי|לא מחובר|חסום/.test(t)) return "bad_phone";
  if (/לא מעונ|לא רוצ|אין צורך|לא מענין|לא מעניין/.test(t)) return "not_interested";
  if (/לא עונ|לא ענ/.test(t)) return "no_answer";
  if (/להתקשר|לצלצל/.test(t)) return "call_later";
  return "other";
}

export const TARGET_FIELDS = {
  name: "שם חברה",
  address: "כתובת",
  zip: "מיקוד",
  phone: "טלפון",
  fax: "פקס",
  email: "דואר אלקטרוני",
  specialization: "התמחות / תחום",
  contact_name: "איש קשר",
  contact_phone: "טלפון איש קשר",
  other_lists: "מופיע ברשימות אחרות",
  notes: "הערות",
  website: "אתר אינטרנט",
} as const;
export type TargetField = keyof typeof TARGET_FIELDS;
export type Mapping = Partial<Record<TargetField, string>>; // שדה יעד → כותרת עמודה במקור

const GUESS: Record<TargetField, RegExp> = {
  name: /^(שם\s*(ה)?\s*חברה|שם|חברה|לקוח|company|name)$/i,
  address: /(כתובת|address)/i,
  zip: /(מיקוד|zip|אזור)/i,
  phone: /^(טלפון|טל|phone|tel)/i,
  fax: /(פקס|fax)/i,
  email: /(דואר|אימייל|מייל|email|e-mail)/i,
  specialization: /(התמחות|תחום|specialization|activity)/i,
  contact_name: /(איש קשר|contact)/i,
  contact_phone: /(נייד|טלפון איש קשר|mobile)/i,
  other_lists: /(רשימות אחרות)/i,
  notes: /(הערות|notes)/i,
  website: /(אתר|website|url)/i,
};

export function suggestMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<string>();
  // סדר חשוב: שדות ספציפיים לפני כלליים
  const order: TargetField[] = ["other_lists", "contact_phone", "contact_name", "fax", "email", "zip", "name", "address", "phone", "specialization", "notes", "website"];
  for (const f of order) {
    const h = headers.find((h) => !used.has(h) && GUESS[f].test(h.trim()));
    if (h) { m[f] = h; used.add(h); }
  }
  return m;
}

export async function parseXlsx(buf: ArrayBuffer): Promise<{ headers: string[]; rows: RawRow[]; sheet: string }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  // הגיליון הראשון שיש בו נתונים
  const ws = wb.worksheets.find((w) => w.actualRowCount > 1) ?? wb.worksheets[0];
  if (!ws) return { headers: [], rows: [], sheet: "" };
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = cellToString(cell.value) ?? `עמודה ${col}`;
  });
  const rows: RawRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, idx) => {
    if (idx === 1) return;
    const r: RawRow = {};
    let any = false;
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1);
      // טלפונים ומיקודים נשמרים כטקסט כפי שהוצגו בקובץ (cell.text שומר על 0 מוביל אם עוצב כטקסט)
      const v = cell.type === ExcelJS.ValueType.Number ? cell.text || String(cell.value) : cellToString(cell.value);
      r[h] = v && String(v).trim() ? String(v).trim() : null;
      if (r[h]) any = true;
    });
    if (any) rows.push(r);
  });
  return { headers: headers.filter(Boolean), rows, sheet: ws.name };
}

export function parseCsv(text: string): { headers: string[]; rows: RawRow[] } {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true, dynamicTyping: false });
  const headers = (res.meta.fields ?? []).filter(Boolean);
  const rows = res.data
    .map((r) => Object.fromEntries(headers.map((h) => [h, r[h]?.toString().trim() || null])) as RawRow)
    .filter((r) => Object.values(r).some(Boolean));
  return { headers, rows };
}

export type PreparedRow = {
  rowNumber: number;
  raw: RawRow;
  name: string;
  nameNormalized: string;
  importKey: string;
  phone: string | null;
  phoneValid: boolean;
  fax: string | null;
  email: string | null;
  emailValid: boolean;
  website: string | null;
  specialization: string | null;
  contactName: string | null;
  contactPhone: string | null;
  priorHint: PriorHint | null;
  notes: string | null;
  otherLists: string | null;
  address: ParsedAddress;
  classification: ClassificationResult;
  issues: { kind: string; detail: string }[];
  skip: boolean;
};

export function prepareRow(raw: RawRow, mapping: Mapping, rowNumber: number): PreparedRow {
  const get = (f: TargetField) => (mapping[f] ? raw[mapping[f]!] ?? null : null);
  const originalName = (get("name") ?? "").replace(/\s+/g, " ").trim();
  const name = originalName || `ללא שם (שורה ${rowNumber})`;
  let phone = cleanPhone(get("phone"));
  // תא טלפון שמכיל גם שם ("יוסי:050-8803141") — מפרידים לאיש קשר ולמספר
  let nameFromPhone: string | null = null;
  if (phone && /[א-תa-z]/i.test(phone)) {
    const m = phone.match(/0\d{1,2}-?\d{3}-?\d{4}|0\d{8,9}/);
    if (m) {
      nameFromPhone = phone.replace(m[0], "").replace(/[:\-–,]/g, " ").trim() || null;
      phone = m[0];
    }
  }
  const email = cleanEmail(get("email"));
  const addr = parseAddress(get("address"));
  const zipCol = get("zip");
  if (!addr.zip && zipCol && /^\d{5,7}$/.test(zipCol.replace(/\s/g, ""))) addr.zip = zipCol.replace(/\s/g, "");
  const spec = get("specialization");
  const cls = classify(spec, name);
  const other = interpretOtherLists(get("other_lists"));
  const issues: { kind: string; detail: string }[] = [];
  if (!originalName) issues.push({ kind: "missing_name", detail: "לשורה בקובץ אין שם חברה" });

  // בעמודת האימייל בקובץ המקורי מופיעות לעתים תוצאות שיחה קודמות ("לא מעוניין", "מספר שגוי")
  const emailText = get("email");
  const priorOutcome = emailText && !emailText.includes("@") && /[א-ת]/.test(emailText) ? emailText.trim() : null;
  const priorHint = priorOutcome ? interpretPriorOutcome(priorOutcome) : null;
  // איש קשר שמכיל גם מספר טלפון ("052-2441510 אורן")
  let contactName = get("contact_name") ?? nameFromPhone;
  let contactPhone = cleanPhone(get("contact_phone")) ?? (nameFromPhone ? phone : null);
  if (contactName) {
    const m = contactName.match(/0\d{1,2}-?\d{7}/);
    if (m) { contactPhone = contactPhone ?? m[0]; contactName = contactName.replace(m[0], "").trim() || null; }
  }
  if (contactName && parseAddress(contactName).regionCertain && contactName.trim().split(/\s+/).length === 1) {
    issues.push({ kind: "notes_in_wrong_column", detail: `בעמודת איש הקשר מופיע שם יישוב: ${contactName}` });
  }

  const phoneValid = isPlausibleIsraeliPhone(phone);
  if (!phone) issues.push({ kind: "missing_phone", detail: "אין מספר טלפון בקובץ" });
  else if (!phoneValid) issues.push({ kind: "phone_invalid", detail: `מספר לא תקין לכאורה: ${phone}` });
  const emailValid = isPlausibleEmail(email);
  if (priorOutcome) {
    issues.push({ kind: "notes_in_wrong_column", detail: `בעמודת האימייל רשום: "${priorOutcome}" — נשמר כהערה (תוצאת שיחה קודמת?)` });
    if (priorHint === "bad_phone") issues.push({ kind: "phone_invalid", detail: `לפי הקובץ: "${priorOutcome}"` });
  } else if (email && !emailValid) issues.push({ kind: "email_invalid", detail: `ערך לא תקין בעמודת האימייל: ${email}` });
  if (!addr.raw) issues.push({ kind: "missing_address", detail: "אין כתובת" });
  else if (addr.isPoBox && !addr.navigable) issues.push({ kind: "po_box", detail: "הכתובת היא תיבת דואר — יש להשיג כתובת פיזית לביקור" });
  else if (!addr.navigable) issues.push({ kind: "partial_address", detail: addr.notes.join("; ") || "כתובת חלקית" });
  if (addr.raw && (!addr.region || !addr.regionCertain)) issues.push({ kind: "region_uncertain", detail: addr.notes.join("; ") || "לא זוהה יישוב" });
  if (cls.needsReview) issues.push({ kind: "classification", detail: cls.reason });
  if (!contactName) issues.push({ kind: "missing_contact", detail: "אין איש קשר" });
  if (other.misplacedNote) issues.push({ kind: "notes_in_wrong_column", detail: `בעמודת "מופיע ברשימות אחרות": ${other.misplacedNote}` });

  const notes = [
    get("notes"),
    other.misplacedNote ? `הערה מהקובץ: ${other.misplacedNote}` : null,
    priorOutcome ? `רשום בקובץ המקורי (בעמודת האימייל): ${priorOutcome}` : null,
  ].filter(Boolean).join("\n") || null;

  return {
    rowNumber,
    raw,
    name,
    nameNormalized: normalizeName(name),
    importKey: importKey(name, phone),
    phone,
    phoneValid,
    fax: cleanPhone(get("fax")),
    email: emailValid ? email : null,
    emailValid,
    website: get("website"),
    specialization: spec,
    contactName,
    contactPhone,
    priorHint,
    notes,
    otherLists: other.appearsInOtherLists,
    address: addr,
    classification: cls,
    issues,
    skip: !originalName && !phone && !addr.raw && !email,
  };
}

/** מפתחות ייבוא ייחודיים לקובץ: אם שתי שורות זהות בשם ובטלפון, השנייה מקבלת סיומת #2.
 *  ייבוא חוזר של אותו קובץ מפיק את אותם מפתחות — ולכן לא נוצרות רשומות כפולות, והכפילות עצמה מוצגת לבדיקה. */
export function assignUniqueKeys(rows: PreparedRow[]): PreparedRow[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const n = (seen.get(r.importKey) ?? 0) + 1;
    seen.set(r.importKey, n);
    return n === 1 ? r : { ...r, importKey: `${r.importKey}#${n}` };
  });
}

/** השוואת שורה חדשה לרשומה קיימת: מחזיר רשימת שדות שהשתנו (לבדיקה, לא לדריסה) */
export function diffRaw(oldRaw: RawRow | null | undefined, newRaw: RawRow): string[] {
  if (!oldRaw) return [];
  const keys = new Set([...Object.keys(oldRaw), ...Object.keys(newRaw)]);
  const changed: string[] = [];
  for (const k of keys) if ((oldRaw[k] ?? null) !== (newRaw[k] ?? null)) changed.push(k);
  return changed;
}
