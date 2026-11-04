// תוויות עבריות לערכי המסד
export const COMPANY_STATUS: Record<string, string> = {
  existing: "לקוח קיים",
  past: "לקוח עבר",
  prospect: "פוטנציאלי",
  irrelevant: "לא רלוונטי",
};
export const CLASSIFICATION: Record<string, string> = {
  machining: "עיבוד שבבי",
  sheet_metal: "פח / מסגרות",
  supplier: "ספק / בית מסחר",
  service: "שירותים",
  plastic: "פלסטיק",
  other: "אחר",
  unclassified: "לא מסווג",
};
export const CONTACT_STATUS: Record<string, string> = {
  not_contacted: "טרם נוצר קשר",
  attempted: "ניסיון ללא מענה",
  reached: "נוצר קשר",
  meeting_set: "נקבעה פגישה",
  do_not_contact: "לא ליצור קשר",
};
export const VERIFICATION: Record<string, string> = {
  unverified: "לא מאומת",
  partial: "מאומת חלקית",
  verified: "מאומת",
  conflict: "סתירה לבירור",
};
export const PRIORITY: Record<string, string> = { high: "גבוהה", medium: "בינונית", low: "נמוכה" };
export const ACTIVITY_TYPE: Record<string, string> = { call: "שיחה", visit: "ביקור", task: "משימה" };
export const ACTIVITY_STATUS: Record<string, string> = {
  proposed: "מוצע",
  scheduled: "מתואם",
  done: "בוצע",
  no_answer: "אין מענה",
  cancelled: "בוטל",
  postponed: "נדחה",
};
export const VISIT_STATUS: Record<string, string> = {
  proposed: "ביקור מוצע — לא תואם",
  scheduled: "ביקור מתואם",
  done: "ביקור בוצע",
  cancelled: "ביקור בוטל",
  postponed: "ביקור נדחה",
  no_answer: "אין מענה",
};
export const STAGES: { key: string; label: string }[] = [
  { key: "new_lead", label: "ליד חדש" },
  { key: "contacted", label: "נוצר קשר" },
  { key: "visit_set", label: "ביקור תואם" },
  { key: "technical", label: "אפיון טכני" },
  { key: "quote", label: "הצעת מחיר" },
  { key: "negotiation", label: "משא ומתן" },
  { key: "won", label: "נסגר בהצלחה" },
  { key: "lost", label: "נסגר ללא עסקה" },
];
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));
export const SOURCE_TYPE: Record<string, string> = {
  company_site: "אתר החברה",
  business_directory: "מדריך עסקי",
  original_list: "רשימת הלקוחות המקורית",
  field: "מידע מהשטח",
  unverified: "לא אומת",
};
export const ISSUE_KIND: Record<string, string> = {
  missing_name: "חסר שם חברה",
  missing_phone: "חסר טלפון",
  phone_invalid: "טלפון לא תקין / מספר שגוי",
  missing_address: "חסרה כתובת",
  po_box: "כתובת היא תיבת דואר",
  partial_address: "כתובת חלקית",
  region_uncertain: "שיוך אזור לא ודאי",
  classification: "סיווג לבדיקה",
  conflict: "סתירה בין מקורות",
  missing_contact: "חסר איש קשר",
  email_invalid: "אימייל לא תקין",
  notes_in_wrong_column: "הערה בעמודה לא מתאימה",
};
export const BLOCK_KIND: Record<string, string> = { vacation: "חופשה", blocked: "יום חסום", holiday: "חג", office: "יום משרד" };
export const CURRENCIES = ["ILS", "USD", "EUR"] as const;
export const CURRENCY_LABEL: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€" };
export const BRANDS = ["AKIRA SEIKI", "TAJMAC-ZPS"] as const;

export function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null || amount === undefined) return "סכום לא ידוע";
  return `${CURRENCY_LABEL[currency ?? ""] ?? ""}${Number(amount).toLocaleString("he-IL")}`;
}
