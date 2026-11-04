import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

/** משתמש מחובר + פרופיל. null אם לא מחובר. */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>();
  return { supabase, user, profile: profile ?? null };
});

/** לדפים: מפנה להתחברות אם אין משתמש פעיל */
export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.profile || !s.profile.active) redirect("/login?error=inactive");
  return { supabase: s.supabase, user: s.user, profile: s.profile };
}

export async function requireAdmin() {
  const s = await requireUser();
  if (s.profile.role !== "admin") redirect("/?error=forbidden");
  return s;
}

/** לפעולות שרת: זורק שגיאה במקום הפניה */
export class AuthError extends Error {}
export async function actionUser() {
  const s = await getSession();
  if (!s || !s.profile || !s.profile.active) throw new AuthError("אין הרשאה — יש להתחבר מחדש");
  return { supabase: s.supabase, user: s.user, profile: s.profile };
}
export async function actionAdmin() {
  const s = await actionUser();
  if (s.profile.role !== "admin") throw new AuthError("פעולה זו מותרת למנהל בלבד");
  return s;
}
