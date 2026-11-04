"use server";
import { revalidatePath } from "next/cache";
import { actionAdmin, actionUser, AuthError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { findCityByText } from "@/lib/geo";
import type { ActionResult } from "@/lib/types";

const s = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);
function fail(e: unknown): ActionResult {
  if (e instanceof AuthError) return { ok: false, error: e.message };
  return { ok: false, error: e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : String(e) };
}

/** הזמנת משתמש: רק מנהל. ההזמנה נרשמת קודם (כך הפרופיל ייווצר פעיל עם התפקיד הנכון), ואז נשלח מייל הזמנה. */
export async function inviteUser(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionAdmin();
    const email = s(fd.get("email"))?.toLowerCase();
    const role = s(fd.get("role")) === "admin" ? "admin" : "sales";
    const full_name = s(fd.get("full_name"));
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "אימייל לא תקין" };
    const { error: e1 } = await supabase.from("invitations").upsert({ email, role, full_name, invited_by: profile.id });
    if (e1) throw e1;
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/set-password`, data: { full_name } });
    if (error) return { ok: false, error: `ההזמנה נרשמה אך שליחת המייל נכשלה: ${error.message}` };
    revalidatePath("/admin/users");
    return { ok: true, message: `נשלחה הזמנה ל-${email}` };
  } catch (e) {
    return fail(e);
  }
}

export async function updateUser(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionAdmin();
    const id = s(fd.get("id"));
    const role = s(fd.get("role")) === "admin" ? "admin" : "sales";
    const active = fd.get("active") === "on";
    if (id === profile.id && (!active || role !== "admin")) return { ok: false, error: "לא ניתן להסיר הרשאת מנהל מעצמכם" };
    const { error } = await supabase.from("profiles").update({ role, active, full_name: s(fd.get("full_name")) ?? "" }).eq("id", id!);
    if (error) throw error;
    revalidatePath("/admin/users");
    return { ok: true, message: "נשמר" };
  } catch (e) {
    return fail(e);
  }
}

export async function updateMyProfile(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase, profile } = await actionUser();
    const home = s(fd.get("home_base")) ?? "קריית ביאליק";
    const city = findCityByText(home);
    if (!city) return { ok: false, error: "היישוב לא זוהה — בחרו יישוב מהרשימה" };
    const { error } = await supabase.from("profiles").update({ full_name: s(fd.get("full_name")) ?? "", phone: s(fd.get("phone")), home_base: city.name, home_base_region: city.region }).eq("id", profile.id);
    if (error) throw error;
    revalidatePath("/profile");
    return { ok: true, message: "נשמר" };
  } catch (e) {
    return fail(e);
  }
}
