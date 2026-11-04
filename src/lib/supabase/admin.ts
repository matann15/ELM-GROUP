import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * לקוח עם מפתח שירות — עוקף RLS. משמש אך ורק להזמנת משתמשים ולניהול חשבונות,
 * ורק אחרי שבדקנו בצד השרת שהמבקש הוא מנהל פעיל.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY אינו מוגדר בסביבת השרת");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
