"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionAdmin, AuthError } from "@/lib/auth";
import { parseCsv, parseXlsx, suggestMapping, TARGET_FIELDS, type Mapping, type RawRow } from "@/lib/importer";
import { commitRows, prepareAll, scanDuplicates } from "@/lib/import-server";
import type { ActionResult } from "@/lib/types";

function fail(e: unknown): ActionResult {
  if (e instanceof AuthError) return { ok: false, error: e.message };
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : String(e);
  return { ok: false, error: msg };
}

export async function uploadImport(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let batchId: string;
  try {
    const { supabase } = await actionAdmin();
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return { ok: false, error: "בחרו קובץ" };
    if (file.size > 8 * 1024 * 1024) return { ok: false, error: "הקובץ גדול מ-8MB" };
    const lower = file.name.toLowerCase();
    let parsed: { headers: string[]; rows: RawRow[] };
    if (lower.endsWith(".xlsx")) parsed = await parseXlsx(await file.arrayBuffer());
    else if (lower.endsWith(".csv")) {
      const buf = Buffer.from(await file.arrayBuffer());
      // CSV מאקסל בעברית עשוי להיות ב-Windows-1255
      let text = buf.toString("utf8");
      if (text.includes("�")) text = new TextDecoder("windows-1255").decode(buf);
      parsed = parseCsv(text);
    } else return { ok: false, error: "נתמכים קבצי XLSX ו-CSV בלבד" };
    if (!parsed.rows.length) return { ok: false, error: "לא נמצאו שורות נתונים בקובץ" };
    if (parsed.rows.length > 20000) return { ok: false, error: "יותר מ-20,000 שורות — פצלו את הקובץ" };
    const { data, error } = await supabase
      .from("import_batches")
      .insert({ filename: file.name, headers: parsed.headers, rows: parsed.rows, mapping: suggestMapping(parsed.headers) })
      .select("id")
      .single();
    if (error) throw error;
    batchId = data.id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/import?batch=${batchId}`);
}

export async function setMapping(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await actionAdmin();
    const id = String(fd.get("batch_id"));
    const mapping: Mapping = {};
    for (const k of Object.keys(TARGET_FIELDS) as (keyof typeof TARGET_FIELDS)[]) {
      const v = fd.get(`map_${k}`);
      if (typeof v === "string" && v) mapping[k] = v;
    }
    if (!mapping.name) return { ok: false, error: "יש למפות את עמודת שם החברה" };
    const { error } = await supabase.from("import_batches").update({ mapping }).eq("id", id).eq("status", "preview");
    if (error) throw error;
    revalidatePath("/import");
    return { ok: true, message: "המיפוי עודכן" };
  } catch (e) {
    return fail(e);
  }
}

export async function commitImport(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await actionAdmin();
    const id = String(fd.get("batch_id"));
    const owner = typeof fd.get("owner_id") === "string" && fd.get("owner_id") ? String(fd.get("owner_id")) : null;
    const { data: batch, error } = await supabase.from("import_batches").select("*").eq("id", id).single();
    if (error || !batch) return { ok: false, error: "קובץ הייבוא לא נמצא" };
    if (batch.status !== "preview") return { ok: false, error: "קובץ זה כבר יובא. העלו אותו שוב כדי לבצע ייבוא חוזר." };
    const prepared = prepareAll(batch.rows as RawRow[], batch.mapping as Mapping);
    const stats = await commitRows(supabase, id, prepared, owner);
    await supabase.from("import_batches").update({ status: "committed", stats, committed_at: new Date().toISOString(), rows: [] }).eq("id", id);
    revalidatePath("/customers");
    revalidatePath("/data-quality");
    revalidatePath("/import");
    return {
      ok: true,
      message: `נוצרו ${stats.created} לקוחות · ${stats.matched} כבר קיימים ללא שינוי · ${stats.matchedChanged} קיימים עם הבדלים (נכנסו לבדיקה) · ${stats.skipped} שורות ריקות · ${stats.issues} פריטים לתור ההשלמות · ${stats.duplicates} כפילויות אפשריות חדשות`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelImport(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await actionAdmin();
    await supabase.from("import_batches").update({ status: "cancelled", rows: [] }).eq("id", String(fd.get("batch_id"))).eq("status", "preview");
  } catch (e) {
    return fail(e);
  }
  redirect("/import");
}

export async function rescanDuplicates(): Promise<ActionResult> {
  try {
    const { supabase } = await actionAdmin();
    const n = await scanDuplicates(supabase);
    revalidatePath("/data-quality");
    return { ok: true, message: `נמצאו ${n} זוגות חדשים לבדיקה` };
  } catch (e) {
    return fail(e);
  }
}

/** החלטת מנהל על זוג כפילות אפשרית. איחוד רק בלחיצה מפורשת; הרשומה המאוחדת נשמרת ומסומנת. */
export async function resolveDuplicate(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionAdmin();
    const id = String(fd.get("id"));
    const decision = String(fd.get("decision"));
    const { data: cand } = await supabase.from("duplicate_candidates").select("*").eq("id", id).single();
    if (!cand || cand.status !== "open") return { ok: false, error: "הזוג כבר טופל" };
    if (decision === "not_duplicate") {
      const { error } = await supabase.from("duplicate_candidates").update({ status: "not_duplicate", resolved_by: profile.id, resolved_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    } else if (decision === "merge_into_a" || decision === "merge_into_b" || decision === "sites_into_a" || decision === "sites_into_b") {
      const keep = decision.endsWith("_a") ? cand.company_a : cand.company_b;
      const drop = decision.endsWith("_a") ? cand.company_b : cand.company_a;
      const { error } = await supabase.rpc("merge_companies", { keep_id: keep, drop_id: drop, candidate_id: id, as_sites: decision.startsWith("sites") });
      if (error) throw error;
    } else return { ok: false, error: "החלטה לא מוכרת" };
    revalidatePath("/data-quality");
    revalidatePath("/customers");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
