"use server";
import { revalidatePath } from "next/cache";
import { actionUser, AuthError } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

const s = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);
const STAGES = ["new_lead", "contacted", "visit_set", "technical", "quote", "negotiation", "won", "lost"];
function fail(e: unknown): ActionResult {
  if (e instanceof AuthError) return { ok: false, error: e.message };
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : String(e);
  if (/row-level security|permission denied/i.test(msg)) return { ok: false, error: "אין הרשאה לבצע פעולה זו" };
  if (/amount_needs_currency/.test(msg)) return { ok: false, error: "לסכום יש לבחור מטבע" };
  return { ok: false, error: msg };
}

function readFields(fd: FormData) {
  const amountRaw = s(fd.get("amount"));
  const amount = amountRaw ? Number(amountRaw.replace(/[,\s₪$€]/g, "")) : null;
  const stage = s(fd.get("stage"));
  return {
    title: s(fd.get("title")),
    stage: stage && STAGES.includes(stage) ? stage : undefined,
    brand: ["AKIRA SEIKI", "TAJMAC-ZPS"].includes(s(fd.get("brand")) ?? "") ? s(fd.get("brand")) : null,
    model: s(fd.get("model")),
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    currency: amount !== null ? s(fd.get("currency")) : null,
    next_step: s(fd.get("next_step")),
    next_step_date: s(fd.get("next_step_date")),
    loss_reason: s(fd.get("loss_reason")),
    hold_reason: s(fd.get("hold_reason")),
  };
}

export async function saveOpportunity(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionUser();
    const id = s(fd.get("id"));
    const f = readFields(fd);
    if (!f.title) return { ok: false, error: "יש לתת שם להזדמנות" };
    if (f.amount !== null && !f.currency) return { ok: false, error: "לסכום יש לבחור מטבע" };
    if (f.stage === "lost" && !f.loss_reason) return { ok: false, error: "בסגירה ללא עסקה יש לציין סיבה" };
    const closed = f.stage === "won" || f.stage === "lost" ? new Date().toISOString() : null;
    if (id) {
      const { data, error } = await supabase.from("opportunities").update({ ...f, closed_at: closed }).eq("id", id).select("company_id").single();
      if (error) throw error;
      revalidatePath(`/customers/${data.company_id}`);
    } else {
      const company_id = s(fd.get("company_id"));
      if (!company_id) return { ok: false, error: "חסר לקוח" };
      const owner = profile.role === "admin" && s(fd.get("owner_id")) ? s(fd.get("owner_id")) : profile.id;
      const { error } = await supabase.from("opportunities").insert({ ...f, stage: f.stage ?? "new_lead", company_id, owner_id: owner, closed_at: closed });
      if (error) throw error;
      revalidatePath(`/customers/${company_id}`);
    }
    revalidatePath("/opportunities");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function moveStage(id: string, stage: string): Promise<ActionResult> {
  try {
    const { supabase } = await actionUser();
    if (!STAGES.includes(stage)) return { ok: false, error: "שלב לא תקין" };
    if (stage === "lost") return { ok: false, error: "לסגירה ללא עסקה פתחו את ההזדמנות וציינו סיבה" };
    const { error } = await supabase.from("opportunities").update({ stage, closed_at: stage === "won" ? new Date().toISOString() : null }).eq("id", id);
    if (error) throw error;
    revalidatePath("/opportunities");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
