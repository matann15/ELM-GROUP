import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Activity, Profile } from "./types";

export const ACTIVITY_SELECT =
  "*, company:companies(id,name,phone_main,status,priority), site:company_sites(id,address_raw,street,city,navigable,is_po_box,region_code), contact:contacts(id,name,role,phone,mobile)";

export type ActivityRow = Activity & {
  company: { id: string; name: string; phone_main: string | null; status: string; priority: string } | null;
  site: { id: string; address_raw: string | null; street: string | null; city: string | null; navigable: boolean; is_po_box: boolean; region_code: string | null } | null;
  contact: { id: string; name: string; role: string | null; phone: string | null; mobile: string | null } | null;
};

export async function listProfiles(supabase: SupabaseClient): Promise<Profile[]> {
  const { data } = await supabase.from("profiles").select("*").eq("active", true).order("full_name");
  return (data ?? []) as Profile[];
}

/** עבור מנהל: איש המכירות שנבחר ב-?user=; עבור איש מכירות: תמיד הוא עצמו */
export function resolveViewedUser(profile: Profile, requested: string | undefined | null): string {
  if (profile.role === "admin" && requested) return requested;
  return profile.id;
}

/** כתובת היעד לניווט: רק אתר עם כתובת פיזית; תיבת דואר אינה יעד ניווט */
export function navAddress(site: ActivityRow["site"]): string | null {
  if (!site || !site.navigable || site.is_po_box && !site.street) return null;
  return [site.street, site.city].filter(Boolean).join(", ") || null;
}
