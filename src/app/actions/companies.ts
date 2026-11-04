"use server";
import { revalidatePath } from "next/cache";
import { actionAdmin, actionUser, AuthError } from "@/lib/auth";
import { parseAddress, REGION_CODES, type RegionCode } from "@/lib/geo";
import { cleanEmail, cleanPhone, normalizeName, phoneDigits, isPlausibleEmail } from "@/lib/normalize";
import type { ActionResult } from "@/lib/types";

const s = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);
function fail(e: unknown): ActionResult {
  if (e instanceof AuthError) return { ok: false, error: e.message };
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: string }).message) : String(e);
  if (/row-level security|permission denied/i.test(msg)) return { ok: false, error: "אין הרשאה לבצע פעולה זו" };
  return { ok: false, error: msg };
}
const pick = <T extends string>(v: string | null, allowed: readonly T[], def: T): T => (v && (allowed as readonly string[]).includes(v) ? (v as T) : def);

const STATUSES = ["existing", "past", "prospect", "irrelevant"] as const;
const CLASSES = ["machining", "sheet_metal", "supplier", "service", "plastic", "other", "unclassified"] as const;
const PRIORITIES = ["high", "medium", "low"] as const;
const CONTACT = ["not_contacted", "attempted", "reached", "meeting_set", "do_not_contact"] as const;
const VERIF = ["unverified", "partial", "verified", "conflict"] as const;
const SOURCES = ["company_site", "business_directory", "original_list", "field", "unverified"] as const;

export async function createCompany(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionUser();
    const name = s(fd.get("name"));
    if (!name) return { ok: false, error: "שם החברה חובה" };
    const phone = cleanPhone(s(fd.get("phone")));
    const email = cleanEmail(s(fd.get("email")));
    if (email && !isPlausibleEmail(email)) return { ok: false, error: "כתובת האימייל אינה תקינה" };

    // בדיקת כפילות לפני יצירה (בתוך הרשומות שהמשתמש רשאי לראות)
    if (fd.get("force") !== "on") {
      const nn = normalizeName(name);
      const digits = phoneDigits(phone);
      const { data: similar } = await supabase.from("companies").select("id,name").is("merged_into", null).or(`name_normalized.eq.${JSON.stringify(nn)}${digits.length >= 9 ? `,search_text.ilike.%${digits}%` : ""}`).limit(5);
      if (similar && similar.length) {
        return { ok: false, error: `ייתכן שהלקוח כבר קיים: ${similar.map((x) => x.name).join(", ")}. אם זו חברה אחרת, סמנו "ליצור בכל זאת".` };
      }
    }
    const owner = profile.role === "admin" ? s(fd.get("owner_id")) : profile.id;
    const { data: comp, error } = await supabase
      .from("companies")
      .insert({
        name,
        name_normalized: normalizeName(name),
        phone_main: phone,
        email_main: email,
        status: pick(s(fd.get("status")), STATUSES, "prospect"),
        classification: pick(s(fd.get("classification")), CLASSES, "unclassified"),
        classification_confirmed: !!s(fd.get("classification")) && s(fd.get("classification")) !== "unclassified",
        specialization: s(fd.get("specialization")),
        priority: pick(s(fd.get("priority")), PRIORITIES, "medium"),
        source_type: pick(s(fd.get("source_type")), SOURCES, "field"),
        source_note: s(fd.get("source_note")),
        source_url: s(fd.get("source_url")),
        owner_id: owner,
      })
      .select("id")
      .single();
    if (error) throw error;
    const address = s(fd.get("address"));
    if (address) {
      const a = parseAddress(address);
      await supabase.from("company_sites").insert({
        company_id: comp.id, label: "ראשי", address_raw: a.raw, street: a.street, city: a.city, zip: a.zip,
        is_po_box: a.isPoBox, navigable: a.navigable, region_code: a.region, region_certain: a.regionCertain, is_primary: true,
      });
    }
    const contactName = s(fd.get("contact_name"));
    if (contactName) {
      await supabase.from("contacts").insert({ company_id: comp.id, name: contactName, role: s(fd.get("contact_role")), mobile: cleanPhone(s(fd.get("contact_phone"))), is_primary: true });
    }
    revalidatePath("/customers");
    return { ok: true, id: comp.id };
  } catch (e) {
    return fail(e);
  }
}

const EDITABLE_TEXT = [
  "name", "phone_main", "fax", "email_main", "website", "specialization", "activity_fields", "equipment_known", "notes",
  "source_note", "source_url", "materials", "part_size", "part_weight", "axes", "precision_req", "batch_size",
  "bottleneck", "budget", "investment_timing", "decision_maker", "fit_akira", "fit_zps",
] as const;

/** עדכון שדות כרטיס הלקוח. מעדכן רק שדות שנשלחו בטופס. */
export async function updateCompany(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionUser();
    const id = s(fd.get("id"));
    if (!id) return { ok: false, error: "חסר מזהה" };
    const patch: Record<string, unknown> = {};
    for (const k of EDITABLE_TEXT) if (fd.has(k)) patch[k] = k.includes("phone") || k === "fax" ? cleanPhone(s(fd.get(k))) : s(fd.get(k));
    if (fd.has("email_main")) {
      const e = cleanEmail(s(fd.get("email_main")));
      if (e && !isPlausibleEmail(e)) return { ok: false, error: "כתובת האימייל אינה תקינה" };
      patch.email_main = e;
    }
    if (patch.name === null) return { ok: false, error: "שם החברה חובה" };
    if (typeof patch.name === "string") patch.name_normalized = normalizeName(patch.name);
    if (fd.has("status")) patch.status = pick(s(fd.get("status")), STATUSES, "prospect");
    if (fd.has("classification")) {
      patch.classification = pick(s(fd.get("classification")), CLASSES, "unclassified");
      patch.classification_confirmed = true;
    }
    if (fd.has("priority")) patch.priority = pick(s(fd.get("priority")), PRIORITIES, "medium");
    if (fd.has("contact_status")) patch.contact_status = pick(s(fd.get("contact_status")), CONTACT, "not_contacted");
    if (fd.has("source_type")) patch.source_type = pick(s(fd.get("source_type")), SOURCES, "original_list");
    if (fd.has("verification_status")) {
      patch.verification_status = pick(s(fd.get("verification_status")), VERIF, "unverified");
      if (patch.verification_status === "verified" || patch.verification_status === "partial") patch.last_verified_at = new Date().toISOString();
    }
    if (fd.has("owner_id")) {
      if (profile.role !== "admin") return { ok: false, error: "רק מנהל יכול לשייך לקוח לאיש מכירות" };
      patch.owner_id = s(fd.get("owner_id"));
    }
    const { error } = await supabase.from("companies").update(patch).eq("id", id);
    if (error) throw error;
    if (fd.has("classification")) {
      await supabase.from("data_issues").update({ status: "resolved", resolved_by: profile.id, resolved_at: new Date().toISOString() }).eq("company_id", id).eq("kind", "classification").eq("status", "open");
    }
    revalidatePath(`/customers/${id}`);
    revalidatePath("/customers");
    return { ok: true, message: "נשמר" };
  } catch (e) {
    return fail(e);
  }
}

export async function assignCompanies(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await actionAdmin();
    const ids = fd.getAll("ids").map(String).filter(Boolean);
    const owner = s(fd.get("owner_id"));
    if (!ids.length) return { ok: false, error: "לא נבחרו לקוחות" };
    const { error } = await supabase.from("companies").update({ owner_id: owner }).in("id", ids);
    if (error) throw error;
    revalidatePath("/customers");
    return { ok: true, message: `${ids.length} לקוחות שויכו` };
  } catch (e) {
    return fail(e);
  }
}

export async function saveSite(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await actionUser();
    const id = s(fd.get("id"));
    const company_id = s(fd.get("company_id"));
    const address = s(fd.get("address_raw"));
    if (!company_id) return { ok: false, error: "חסר לקוח" };
    const a = parseAddress(address);
    const street = s(fd.get("street")) ?? a.street;
    const city = s(fd.get("city")) ?? a.city;
    const manualRegion = s(fd.get("region_code"));
    const region = manualRegion && REGION_CODES.includes(manualRegion as RegionCode) ? manualRegion : a.region;
    const regionConfirmed = fd.get("region_confirmed") === "on";
    const isPo = fd.get("is_po_box") === "on" || (!s(fd.get("street")) && a.isPoBox);
    const row = {
      company_id,
      label: s(fd.get("label")),
      address_raw: address,
      street,
      city,
      zip: s(fd.get("zip")) ?? a.zip,
      is_po_box: isPo,
      navigable: !!street && !!city,
      region_code: region,
      region_certain: regionConfirmed || (!manualRegion && a.regionCertain),
      is_primary: fd.get("is_primary") === "on",
      notes: s(fd.get("notes")),
    };
    const { error } = id ? await supabase.from("company_sites").update(row).eq("id", id) : await supabase.from("company_sites").insert(row);
    if (error) throw error;
    if (row.region_certain) await supabase.from("data_issues").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("company_id", company_id).eq("kind", "region_uncertain").eq("status", "open");
    if (row.navigable) await supabase.from("data_issues").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("company_id", company_id).in("kind", ["po_box", "partial_address", "missing_address"]).eq("status", "open");
    revalidatePath(`/customers/${company_id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSite(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await actionUser();
    const id = s(fd.get("id"));
    const { data, error } = await supabase.from("company_sites").delete().eq("id", id!).select("company_id");
    if (error) throw error;
    revalidatePath(`/customers/${data?.[0]?.company_id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveContact(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await actionUser();
    const id = s(fd.get("id"));
    const company_id = s(fd.get("company_id"));
    const name = s(fd.get("name"));
    if (!company_id || !name) return { ok: false, error: "שם איש הקשר חובה" };
    const email = cleanEmail(s(fd.get("email")));
    if (email && !isPlausibleEmail(email)) return { ok: false, error: "כתובת האימייל אינה תקינה" };
    const row = {
      company_id, name, role: s(fd.get("role")), phone: cleanPhone(s(fd.get("phone"))), mobile: cleanPhone(s(fd.get("mobile"))),
      email, is_primary: fd.get("is_primary") === "on", notes: s(fd.get("notes")), site_id: s(fd.get("site_id")),
    };
    const { error } = id ? await supabase.from("contacts").update(row).eq("id", id) : await supabase.from("contacts").insert(row);
    if (error) throw error;
    await supabase.from("data_issues").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("company_id", company_id).eq("kind", "missing_contact").eq("status", "open");
    revalidatePath(`/customers/${company_id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteContact(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await actionUser();
    const { data, error } = await supabase.from("contacts").delete().eq("id", s(fd.get("id"))!).select("company_id");
    if (error) throw error;
    revalidatePath(`/customers/${data?.[0]?.company_id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addNote(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionUser();
    const company_id = s(fd.get("company_id"));
    const body = s(fd.get("body"));
    if (!company_id || !body) return { ok: false, error: "ההערה ריקה" };
    const { error } = await supabase.from("company_notes").insert({ company_id, body, created_by: profile.id });
    if (error) throw error;
    revalidatePath(`/customers/${company_id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveIssue(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionUser();
    const id = s(fd.get("id"));
    const status = fd.get("status") === "ignored" ? "ignored" : "resolved";
    const { data, error } = await supabase.from("data_issues").update({ status, resolved_by: profile.id, resolved_at: new Date().toISOString() }).eq("id", id!).select("company_id");
    if (error) throw error;
    revalidatePath("/data-quality");
    if (data?.[0]) revalidatePath(`/customers/${data[0].company_id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
