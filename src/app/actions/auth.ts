"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

function safeNext(n: FormDataEntryValue | null) {
  const s = typeof n === "string" ? n : "/";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function signIn(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "יש להזין אימייל וסיסמה" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, error: "פרטי ההתחברות שגויים" };
  const { data: profile } = await supabase.from("profiles").select("active").eq("id", data.user.id).maybeSingle();
  if (!profile?.active) {
    await supabase.auth.signOut();
    return { ok: false, error: "החשבון אינו פעיל. הגישה למערכת היא בהזמנת מנהל בלבד." };
  }
  redirect(safeNext(fd.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = String(fd.get("email") ?? "").trim();
  if (!email) return { ok: false, error: "יש להזין אימייל" };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/set-password` });
  // אותה תשובה בכל מקרה — לא חושפים אילו כתובות רשומות
  return { ok: true, message: "אם הכתובת רשומה במערכת, נשלח אליה קישור לאיפוס סיסמה." };
}

export async function setPassword(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const p1 = String(fd.get("password") ?? "");
  const p2 = String(fd.get("password2") ?? "");
  if (p1.length < 10) return { ok: false, error: "הסיסמה צריכה להכיל לפחות 10 תווים" };
  if (p1 !== p2) return { ok: false, error: "הסיסמאות אינן תואמות" };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "הקישור פג תוקף. בקשו קישור חדש." };
  const { error } = await supabase.auth.updateUser({ password: p1 });
  if (error) return { ok: false, error: "לא ניתן לעדכן סיסמה: " + error.message };
  redirect("/");
}
