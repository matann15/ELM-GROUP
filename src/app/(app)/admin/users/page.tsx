import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { Card, CardHeader, Notice, PageHeader } from "@/components/ui";
import { InviteForm, UserRow } from "@/components/user-forms";

export default async function UsersPage() {
  const { supabase } = await requireAdmin();
  const [{ data: profiles }, { data: invites }, { data: audit }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("invitations").select("*").is("accepted_at", null).order("created_at", { ascending: false }),
    supabase.from("audit_log").select("id,table_name,action,changed_by,changed_at,new_data,old_data").order("changed_at", { ascending: false }).limit(40),
  ]);
  const P = (profiles ?? []) as Profile[];
  const who = (id: string | null) => P.find((p) => p.id === id)?.full_name || (id ? "משתמש" : "מערכת");
  const TABLE: Record<string, string> = { companies: "לקוח", activities: "פעולה", opportunities: "הזדמנות", contacts: "איש קשר", company_sites: "אתר", profiles: "משתמש", data_issues: "פריט השלמה", plans: "תוכנית", duplicate_candidates: "כפילות", company_notes: "הערה", research_sources: "מקור מחקר", blocked_days: "יום חסום", recurring_meetings: "פגישה קבועה", invitations: "הזמנה" };
  const ACT: Record<string, string> = { insert: "נוצר", update: "עודכן", delete: "נמחק" };
  return (
    <>
      <PageHeader title="משתמשים והרשאות" sub="אין הרשמה ציבורית. משתמש נכנס רק בהזמנה." />
      <Card className="mb-5">
        <CardHeader title="הזמנת משתמש" />
        <div className="p-4"><InviteForm /></div>
        {(invites ?? []).length > 0 && (
          <div className="border-t border-line px-4 py-3 text-sm text-ink-3">ממתינות: {(invites ?? []).map((i) => `${i.email} (${i.role === "admin" ? "מנהל" : "מכירות"})`).join(" · ")}</div>
        )}
      </Card>
      <Card className="mb-5">
        <CardHeader title={`משתמשים (${P.length})`} />
        <div className="space-y-3 p-4">{P.map((p) => <UserRow key={p.id} p={p} />)}</div>
        <div className="px-4 pb-4"><Notice tone="blue">משתמש לא פעיל אינו יכול לקרוא שום נתון — גם אם ינסה לגשת ישירות ל-API. מחיקת חשבון מלאה נעשית בלוח הבקרה של Supabase.</Notice></div>
      </Card>
      <Card>
        <CardHeader title="יומן שינויים אחרון" sub="מי יצר ושינה רשומות ומתי" />
        <ul className="divide-y divide-line text-sm">
          {(audit ?? []).map((a) => {
            const d = (a.new_data ?? a.old_data) as Record<string, string> | null;
            return (
              <li key={a.id} className="px-4 py-2">
                <span className="text-ink-3">{formatDateTime(a.changed_at)}</span> · {who(a.changed_by)} · {TABLE[a.table_name] ?? a.table_name} {ACT[a.action] ?? a.action}
                {d?.name || d?.title || d?.proposed_name ? <span className="text-ink-3"> · {d.name ?? d.title ?? d.proposed_name}</span> : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
