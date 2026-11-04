"use server";
import { revalidatePath } from "next/cache";
import { actionUser, AuthError } from "@/lib/auth";
import { buildPlan, type PlanResult } from "@/lib/planner";
import { loadPlanContext, persistPlan, readPlanInput } from "@/lib/plan-data";
import type { ActionResult } from "@/lib/types";

export type PreviewResult = ({ ok: true; plan: PlanResult; replaceableCount: number; companyCount: number; homeBase: string; existingCount: number } | { ok: false; error: string });

function fail(e: unknown) {
  if (e instanceof AuthError) return { ok: false as const, error: e.message };
  const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : String(e);
  return { ok: false as const, error: msg };
}

/** תצוגה מקדימה — לא נשמר דבר במסד */
export async function previewPlan(_: PreviewResult | null, fd: FormData): Promise<PreviewResult> {
  try {
    const { supabase, profile } = await actionUser();
    const input = readPlanInput(fd, profile);
    if ("error" in input) return { ok: false, error: input.error };
    const ctx = await loadPlanContext(supabase, input);
    const plan = buildPlan(ctx.settings, ctx.candidates, ctx.existing, ctx.blockedDays, ctx.recurring);
    return { ok: true, plan, replaceableCount: ctx.replaceable.length, companyCount: ctx.companyCount, homeBase: ctx.settings.homeBaseName, existingCount: ctx.existing.length };
  } catch (e) {
    return fail(e);
  }
}

/**
 * שמירה: מחשב שוב את התוכנית בצד השרת (לא סומך על נתוני הדפדפן) ושומר רק את ההצעות שסומנו.
 * פעולות קיימות ופגישות מתואמות לא נדרסות. החלפת הצעות קודמות — רק אם סומן, ורק ביקורים מוצעים שלא תואמו.
 */
export async function savePlan(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionUser();
    const input = readPlanInput(fd, profile);
    if ("error" in input) return { ok: false, error: input.error };
    const selected = new Set(fd.getAll("keys").map(String));
    if (!selected.size) return { ok: false, error: "לא נבחרו פעולות לשמירה" };
    const r = await persistPlan(supabase, input, selected);
    if ("error" in r) return { ok: false, error: r.error };
    const { visits, calls } = r;
    revalidatePath("/");
    revalidatePath("/calendar");
    revalidatePath("/plan");
    return { ok: true, message: `נשמרו ${visits} ביקורים מוצעים ו-${calls} שיחות. ביקורים יסומנו כמתואמים רק אחרי אישור הלקוח.` };
  } catch (e) {
    return fail(e);
  }
}

const s = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function addBlockedDays(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionUser();
    const from = s(fd.get("from"));
    const to = s(fd.get("to")) ?? from;
    const kind = s(fd.get("kind")) ?? "blocked";
    if (!from || !to || to < from) return { ok: false, error: "טווח תאריכים לא תקין" };
    const owner = profile.role === "admin" && s(fd.get("owner_id")) ? s(fd.get("owner_id"))! : profile.id;
    const rows = [];
    for (let d = from; d <= to; d = new Date(new Date(d + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10)) {
      rows.push({ owner_id: owner, day: d, kind, note: s(fd.get("note")) });
      if (rows.length > 60) return { ok: false, error: "טווח ארוך מדי (עד 60 יום)" };
    }
    const { error } = await supabase.from("blocked_days").upsert(rows, { onConflict: "owner_id,day" });
    if (error) throw error;
    revalidatePath("/plan");
    revalidatePath("/calendar");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeBlockedDay(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await actionUser();
    const { error } = await supabase.from("blocked_days").delete().eq("id", s(fd.get("id"))!);
    if (error) throw error;
    revalidatePath("/plan");
    revalidatePath("/calendar");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addRecurring(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionUser();
    const weekday = Number(s(fd.get("weekday")));
    const start = s(fd.get("start")), end = s(fd.get("end")), title = s(fd.get("title"));
    if (!(weekday >= 0 && weekday <= 6) || !start || !end || !title) return { ok: false, error: "יש למלא יום, שעות ותיאור" };
    if (end <= start) return { ok: false, error: "שעת הסיום לפני שעת ההתחלה" };
    const owner = profile.role === "admin" && s(fd.get("owner_id")) ? s(fd.get("owner_id"))! : profile.id;
    const { error } = await supabase.from("recurring_meetings").insert({ owner_id: owner, weekday, start_time: start, end_time: end, title });
    if (error) throw error;
    revalidatePath("/plan");
    revalidatePath("/calendar");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeRecurring(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await actionUser();
    const { error } = await supabase.from("recurring_meetings").delete().eq("id", s(fd.get("id"))!);
    if (error) throw error;
    revalidatePath("/plan");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
