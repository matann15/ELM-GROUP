"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionUser, AuthError } from "@/lib/auth";
import { toUtc, timeToMinutes, minutesToTime } from "@/lib/time";
import { addIssue } from "@/lib/issues";
import type { ActionResult } from "@/lib/types";

const s = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

function fail(e: unknown): ActionResult {
  if (e instanceof AuthError) return { ok: false, error: e.message };
  const msg = e instanceof Error ? e.message : String(e);
  if (/row-level security|permission denied/i.test(msg)) return { ok: false, error: "אין הרשאה לבצע פעולה זו על הרשומה" };
  return { ok: false, error: msg };
}
function revalidateAll(companyId?: string | null) {
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/route");
  revalidatePath("/reports");
  if (companyId) revalidatePath(`/customers/${companyId}`);
}

const ActivitySchema = z.object({
  type: z.enum(["call", "visit", "task"]),
  status: z.enum(["proposed", "scheduled"]).default("scheduled"),
  company_id: z.string().uuid().nullable(),
  site_id: z.string().uuid().nullable(),
  contact_id: z.string().uuid().nullable(),
  opportunity_id: z.string().uuid().nullable(),
  owner_id: z.string().uuid().nullable(),
  title: z.string().max(300).nullable(),
  purpose: z.string().max(2000).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  duration: z.coerce.number().int().min(5).max(600).nullable(),
  customer_confirmed: z.boolean(),
});

export async function createActivity(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionUser();
    const parsed = ActivitySchema.safeParse({
      type: s(fd.get("type")),
      status: s(fd.get("status")) ?? "scheduled",
      company_id: s(fd.get("company_id")),
      site_id: s(fd.get("site_id")),
      contact_id: s(fd.get("contact_id")),
      opportunity_id: s(fd.get("opportunity_id")),
      owner_id: s(fd.get("owner_id")),
      title: s(fd.get("title")),
      purpose: s(fd.get("purpose")),
      date: s(fd.get("date")),
      time: s(fd.get("time")),
      duration: s(fd.get("duration")),
      customer_confirmed: fd.get("customer_confirmed") === "on",
    });
    if (!parsed.success) return { ok: false, error: "נתונים לא תקינים: " + parsed.error.issues.map((i) => i.path.join(".")).join(", ") };
    const v = parsed.data;
    if (v.type !== "task" && !v.company_id) return { ok: false, error: "שיחה וביקור חייבים להיות משויכים ללקוח" };
    if (v.type !== "task" && (!v.date || !v.time)) return { ok: false, error: "יש לבחור תאריך ושעה" };
    // רק מנהל רשאי להקצות פעולה לאחר; RLS אוכף זאת גם במסד
    const owner = profile.role === "admin" && v.owner_id ? v.owner_id : profile.id;
    const dur = v.duration ?? (v.type === "visit" ? 75 : v.type === "call" ? 15 : 30);
    const starts = v.date && v.time ? toUtc(v.date, v.time) : null;
    const { data, error } = await supabase
      .from("activities")
      .insert({
        type: v.type,
        status: v.type === "visit" ? (v.customer_confirmed ? "scheduled" : "proposed") : "scheduled",
        owner_id: owner,
        company_id: v.company_id,
        site_id: v.site_id,
        contact_id: v.contact_id,
        opportunity_id: v.opportunity_id,
        title: v.title,
        purpose: v.purpose,
        starts_at: starts?.toISOString() ?? null,
        ends_at: starts ? new Date(starts.getTime() + dur * 60000).toISOString() : null,
        due_date: v.type === "task" ? v.date : null,
        customer_confirmed: v.customer_confirmed,
      })
      .select("id")
      .single();
    if (error) throw error;
    revalidateAll(v.company_id);
    return { ok: true, id: data.id, message: "נשמר" };
  } catch (e) {
    return fail(e);
  }
}

/**
 * סיום פעולה: תוצאה, צעד הבא ותאריך המשך. יוצר משימת המשך אם התבקש.
 * "אין מענה" נשמר כסטטוס no_answer ואינו נספר כשיחה שהתקיימה.
 */
export async function completeActivity(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionUser();
    const id = s(fd.get("id"));
    const result = s(fd.get("result"));
    if (!id || !result) return { ok: false, error: "יש לבחור תוצאה" };
    const { data: act, error: e1 } = await supabase.from("activities").select("*").eq("id", id).single();
    if (e1 || !act) return { ok: false, error: "הפעולה לא נמצאה או שאין הרשאה" };

    const outcome = s(fd.get("outcome"));
    const nextStep = s(fd.get("next_step"));
    const followType = s(fd.get("follow_type"));
    const followDate = s(fd.get("follow_date"));
    const followTime = s(fd.get("follow_time"));
    const visitConfirmed = fd.get("visit_confirmed") === "on";

    const statusMap: Record<string, string> = {
      done: "done",
      no_answer: "no_answer",
      wrong_number: "no_answer",
      call_later: "no_answer",
      cancelled: "cancelled",
      postponed: "postponed",
    };
    const status = statusMap[result];
    if (!status) return { ok: false, error: "תוצאה לא מוכרת" };
    if (followType && !followDate) return { ok: false, error: "בחרתם פעולת המשך — יש לבחור תאריך" };
    if (followType && followType !== "task" && !followTime) return { ok: false, error: "לשיחה או לביקור המשך יש לבחור שעה" };

    const resultLabel: Record<string, string> = { wrong_number: "מספר שגוי", call_later: "ביקשו לחזור מאוחר יותר" };
    const { error: e2 } = await supabase
      .from("activities")
      .update({
        status,
        outcome: [resultLabel[result], outcome].filter(Boolean).join(" — ") || null,
        next_step: nextStep,
        follow_up_date: followDate,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (e2) throw e2;

    // עדכון מצב הקשר בלקוח
    if (act.company_id) {
      const { data: comp } = await supabase.from("companies").select("contact_status").eq("id", act.company_id).single();
      const patch: Record<string, unknown> = {};
      if (status === "done" && (act.type === "call" || act.type === "visit")) {
        patch.last_contact_at = new Date().toISOString();
        if (comp && !["do_not_contact", "meeting_set"].includes(comp.contact_status)) patch.contact_status = "reached";
      }
      if (status === "no_answer" && comp?.contact_status === "not_contacted") patch.contact_status = "attempted";
      if (visitConfirmed) patch.contact_status = "meeting_set";
      if (Object.keys(patch).length) await supabase.from("companies").update(patch).eq("id", act.company_id);
      if (result === "wrong_number") {
        await addIssue(supabase, act.company_id, "phone_invalid", `דווח בשיחה: מספר שגוי (${new Date().toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })})`);
      }
    }

    // שיחת תיאום שאישרה ביקור → הביקור הופך ל"מתואם"
    if (visitConfirmed && act.related_visit_id) {
      await supabase.from("activities").update({ status: "scheduled", customer_confirmed: true }).eq("id", act.related_visit_id);
    }

    // עדכון הזדמנות מקושרת
    if (act.opportunity_id && (nextStep || followDate)) {
      await supabase.from("opportunities").update({ next_step: nextStep, next_step_date: followDate }).eq("id", act.opportunity_id);
    }

    // פעולת המשך
    if (followType && followDate) {
      const ft = followType as "call" | "visit" | "task";
      const starts = ft !== "task" && followTime ? toUtc(followDate, followTime) : null;
      const dur = ft === "visit" ? 75 : 15;
      const { error: e3 } = await supabase.from("activities").insert({
        type: ft,
        status: ft === "visit" ? "proposed" : "scheduled",
        owner_id: act.owner_id ?? profile.id,
        company_id: act.company_id,
        site_id: act.site_id,
        contact_id: act.contact_id,
        opportunity_id: act.opportunity_id,
        title: ft === "task" ? nextStep ?? "משימת המשך" : null,
        purpose: nextStep ?? "המשך",
        starts_at: starts?.toISOString() ?? null,
        ends_at: starts ? new Date(starts.getTime() + dur * 60000).toISOString() : null,
        due_date: ft === "task" ? followDate : null,
      });
      if (e3) throw e3;
    }
    revalidateAll(act.company_id);
    return { ok: true, message: "נשמר" };
  } catch (e) {
    return fail(e);
  }
}

export async function rescheduleActivity(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await actionUser();
    const id = s(fd.get("id"));
    const date = s(fd.get("date"));
    const time = s(fd.get("time"));
    if (!id || !date) return { ok: false, error: "יש לבחור תאריך" };
    const { data: act } = await supabase.from("activities").select("type, starts_at, ends_at, company_id, status").eq("id", id).single();
    if (!act) return { ok: false, error: "הפעולה לא נמצאה" };
    if (act.type === "task" && !time) {
      const { error } = await supabase.from("activities").update({ due_date: date }).eq("id", id);
      if (error) throw error;
    } else {
      if (!time) return { ok: false, error: "יש לבחור שעה" };
      const durMin = act.starts_at && act.ends_at ? Math.round((+new Date(act.ends_at) - +new Date(act.starts_at)) / 60000) : act.type === "visit" ? 75 : 15;
      const starts = toUtc(date, time);
      const { error } = await supabase
        .from("activities")
        .update({
          starts_at: starts.toISOString(),
          ends_at: new Date(starts.getTime() + durMin * 60000).toISOString(),
          // ביקור שתואם עם הלקוח והוזז — חוזר ל"מוצע" עד לאישור מחדש, אלא אם סומן שהלקוח אישר
          ...(act.type === "visit" && act.status === "scheduled" && fd.get("keep_confirmed") !== "on"
            ? { status: "proposed", customer_confirmed: false }
            : {}),
        })
        .eq("id", id);
      if (error) throw error;
    }
    revalidateAll(act.company_id);
    return { ok: true, message: "הועבר" };
  } catch (e) {
    return fail(e);
  }
}

export async function confirmVisit(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await actionUser();
    const id = s(fd.get("id"));
    const { data, error } = await supabase.from("activities").update({ status: "scheduled", customer_confirmed: true }).eq("id", id!).eq("type", "visit").select("company_id").single();
    if (error) throw error;
    if (data?.company_id) await supabase.from("companies").update({ contact_status: "meeting_set" }).eq("id", data.company_id);
    revalidateAll(data?.company_id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteActivity(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await actionUser();
    const id = s(fd.get("id"));
    const { data, error } = await supabase.from("activities").delete().eq("id", id!).select("company_id");
    if (error) throw error;
    if (!data?.length) return { ok: false, error: "ניתן למחוק רק פעולה מוצעת שלכם (או כמנהל). פעולה מתואמת — בטלו אותה." };
    revalidateAll(data[0].company_id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** הזזה מהירה בשעות (למשל +15 דק׳) מתוך היומן */
export async function shiftActivity(id: string, date: string, time: string): Promise<ActionResult> {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("date", date);
  fd.set("time", minutesToTime(Math.max(0, Math.min(23 * 60 + 45, timeToMinutes(time)))));
  return rescheduleActivity(null, fd);
}
