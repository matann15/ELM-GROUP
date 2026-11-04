"use server";
import { revalidatePath } from "next/cache";
import { actionAdmin, actionUser, AuthError } from "@/lib/auth";
import { parseCsv } from "@/lib/importer";
import { parseAddress } from "@/lib/geo";
import { classify, cleanPhone, normalizeName, phoneDigits } from "@/lib/normalize";
import { addIssue } from "@/lib/issues";
import type { ActionResult } from "@/lib/types";

const s = (v: FormDataEntryValue | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : null);
const TYPES = ["company_site", "business_directory", "unverified"];
const FIELDS = ["name", "city", "phone", "address", "specialization"];
function fail(e: unknown): ActionResult {
  if (e instanceof AuthError) return { ok: false, error: e.message };
  return { ok: false, error: e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : String(e) };
}
function validUrl(u: string | null) {
  try { return !!u && ["http:", "https:"].includes(new URL(u).protocol); } catch { return false; }
}

export async function addResearchSource(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionUser();
    const name = s(fd.get("proposed_name"));
    const url = s(fd.get("url"));
    if (!name) return { ok: false, error: "שם החברה חובה" };
    if (!validUrl(url)) return { ok: false, error: "חובה קישור מקור תקין (http/https)" };
    const type = TYPES.includes(s(fd.get("source_type")) ?? "") ? s(fd.get("source_type")) : "unverified";
    const { error } = await supabase.from("research_sources").insert({
      proposed_name: name, proposed_city: s(fd.get("proposed_city")), proposed_phone: cleanPhone(s(fd.get("proposed_phone"))),
      proposed_specialization: s(fd.get("proposed_specialization")), url, source_type: type,
      checked_at: s(fd.get("checked_at")) ?? new Date().toISOString().slice(0, 10),
      verified_fields: fd.getAll("verified_fields").map(String).filter((f) => FIELDS.includes(f)),
      notes: s(fd.get("notes")), created_by: profile.id,
    });
    if (error) throw error;
    revalidatePath("/research");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** טעינת קובץ תוצאות מחקר (CSV) לתור הבדיקה — לא נוצרים לקוחות עד אישור פרטני */
export async function uploadResearchCsv(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionAdmin();
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return { ok: false, error: "בחרו קובץ CSV" };
    const { rows } = parseCsv(await file.text());
    const { data: existing } = await supabase.from("research_sources").select("url,proposed_name");
    const seen = new Set((existing ?? []).map((r) => `${r.url}|${normalizeName(r.proposed_name)}`));
    const out = [];
    let bad = 0;
    for (const r of rows) {
      const name = s(r.proposed_name), url = s(r.url);
      if (!name || !validUrl(url)) { bad++; continue; }
      if (seen.has(`${url}|${normalizeName(name)}`)) continue;
      out.push({
        proposed_name: name, proposed_city: s(r.proposed_city), proposed_phone: cleanPhone(s(r.proposed_phone)),
        proposed_specialization: s(r.proposed_specialization), url,
        source_type: TYPES.includes(s(r.source_type) ?? "") ? s(r.source_type) : "unverified",
        checked_at: /^\d{4}-\d{2}-\d{2}$/.test(s(r.checked_at) ?? "") ? s(r.checked_at) : new Date().toISOString().slice(0, 10),
        verified_fields: (s(r.verified_fields) ?? "").split(/[;,]/).map((x) => x.trim()).filter((f) => FIELDS.includes(f)),
        notes: s(r.notes), created_by: profile.id,
      });
    }
    if (out.length) { const { error } = await supabase.from("research_sources").insert(out); if (error) throw error; }
    revalidatePath("/research");
    return { ok: true, message: `נוספו ${out.length} מקורות לבדיקה${bad ? ` · ${bad} שורות ללא שם או קישור תקין דולגו` : ""}` };
  } catch (e) {
    return fail(e);
  }
}

/** אישור מקור: יוצר לקוח פוטנציאלי חדש, או מקשר ללקוח קיים ומכניס סתירות לבדיקה (בלי לדרוס) */
export async function acceptResearch(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionAdmin();
    const id = s(fd.get("id"));
    const { data: r } = await supabase.from("research_sources").select("*").eq("id", id!).single();
    if (!r || r.status !== "pending") return { ok: false, error: "המקור כבר טופל" };
    const nn = normalizeName(r.proposed_name);
    const digits = phoneDigits(r.proposed_phone);
    const { data: match } = await supabase.from("companies").select("id,name,phone_main").is("merged_into", null)
      .or(`name_normalized.eq.${JSON.stringify(nn)}${digits.length >= 9 ? `,search_text.ilike.%${digits}%` : ""}`).limit(1);
    let companyId: string;
    let msg: string;
    if (match && match.length) {
      companyId = match[0].id;
      if (r.proposed_phone && phoneDigits(match[0].phone_main) !== digits) {
        await addIssue(supabase, companyId, "conflict", `מקור מחקר (${r.url}) מציין טלפון ${r.proposed_phone}; במערכת: ${match[0].phone_main ?? "אין"}`);
      }
      await supabase.from("company_notes").insert({ company_id: companyId, body: `מקור מחקר: ${r.url} (${r.checked_at}). אומת: ${(r.verified_fields ?? []).join(", ") || "לא צוין"}.${r.notes ? " " + r.notes : ""}`, created_by: profile.id });
      msg = `קושר ללקוח קיים: ${match[0].name}`;
    } else {
      const cls = classify(r.proposed_specialization, r.proposed_name);
      const { data: c, error } = await supabase.from("companies").insert({
        name: r.proposed_name, name_normalized: nn, phone_main: r.proposed_phone, specialization: r.proposed_specialization,
        classification: cls.classification, classification_suggested: cls.suggested, status: "prospect",
        source_type: r.source_type, source_url: r.url, verification_status: (r.verified_fields ?? []).length ? "partial" : "unverified",
        last_verified_at: (r.verified_fields ?? []).length ? new Date(r.checked_at + "T12:00:00Z").toISOString() : null,
        source_note: `נבדק ${r.checked_at}. אומת מול המקור: ${(r.verified_fields ?? []).join(", ") || "לא אומת"}.${r.notes ? " " + r.notes : ""}`,
      }).select("id").single();
      if (error) throw error;
      companyId = c.id;
      if (r.proposed_city) {
        const a = parseAddress(r.proposed_city);
        await supabase.from("company_sites").insert({ company_id: c.id, label: "ראשי", address_raw: r.proposed_city, city: a.city, region_code: a.region, region_certain: a.regionCertain, navigable: false, is_primary: true });
        await addIssue(supabase, c.id, "partial_address", "ממקור מחקר — ידוע יישוב בלבד");
      }
      if (cls.needsReview) await addIssue(supabase, c.id, "classification", cls.reason);
      msg = "נוצר לקוח פוטנציאלי חדש (לא משויך)";
    }
    await supabase.from("research_sources").update({ status: "accepted", company_id: companyId }).eq("id", id!);
    revalidatePath("/research");
    revalidatePath("/customers");
    return { ok: true, message: msg };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectResearch(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await actionAdmin();
    const { error } = await supabase.from("research_sources").update({ status: "rejected" }).eq("id", s(fd.get("id"))!);
    if (error) throw error;
    revalidatePath("/research");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
