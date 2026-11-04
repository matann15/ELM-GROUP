import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** פותח פריט בתור ההשלמות; אם כבר קיים פריט פתוח מאותו סוג ללקוח — לא מוסיף כפילות */
export async function addIssue(supabase: SupabaseClient, companyId: string, kind: string, detail: string) {
  const { error } = await supabase.from("data_issues").insert({ company_id: companyId, kind, detail });
  if (error && error.code !== "23505") throw error;
}
