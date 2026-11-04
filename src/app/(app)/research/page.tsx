import Link from "next/link";
import { Plus, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { SOURCE_TYPE } from "@/lib/labels";
import { formatDate } from "@/lib/time";
import { Badge, btnClass, Card, CardHeader, Notice, PageHeader } from "@/components/ui";
import { Modal } from "@/components/client";
import { ResearchCsvForm, ResearchDecision, ResearchForm } from "@/components/research-forms";

const FIELD_LABEL: Record<string, string> = { name: "שם", city: "יישוב", phone: "טלפון", address: "כתובת", specialization: "תחום" };

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = ["accepted", "rejected"].includes(sp.status ?? "") ? sp.status! : "pending";
  const { supabase, profile } = await requireUser();
  const isAdmin = profile.role === "admin";
  const { data } = await supabase.from("research_sources").select("*").eq("status", status).order("created_at", { ascending: false }).limit(300);
  return (
    <>
      <PageHeader
        title="מחקר והרחבת המאגר"
        sub="מקורות למפעלי עיבוד שבבי חדשים. כל תוספת נשמרת עם קישור, תאריך בדיקה ומה אומת."
        actions={<Modal title="מקור חדש" trigger={<><Plus size={16} /> מקור חדש</>} triggerClass={btnClass("primary", "md")}><ResearchForm /></Modal>}
      />
      <div className="mb-5 space-y-3">
        <Notice tone="blue">המאגר אינו רשימה מלאה של כל המפעלים בארץ. מקורות מאתרי חברות עדיפים על מדריכים עסקיים; מידע סותר נכנס לבדיקה ולא דורס נתונים קיימים. לקוח נוצר רק אחרי אישור מנהל.</Notice>
        {isAdmin && <Card><div className="p-4"><p className="mb-2 text-sm text-ink-2">טעינת קובץ CSV עם עמודות: proposed_name, proposed_city, proposed_phone, proposed_specialization, url, source_type, checked_at, verified_fields, notes</p><ResearchCsvForm /></div></Card>}
      </div>
      <div className="mb-3 flex gap-1.5 text-sm">
        {[["pending", "ממתינים לבדיקה"], ["accepted", "אושרו"], ["rejected", "נדחו"]].map(([k, l]) => (
          <Link key={k} href={`/research?status=${k}`} className={`rounded-lg px-3 py-1.5 ${k === status ? "bg-brand-soft font-semibold text-brand-dark" : "bg-white text-ink-2"}`}>{l}</Link>
        ))}
      </div>
      <Card>
        <CardHeader title={`${(data ?? []).length} מקורות`} />
        <ul className="divide-y divide-line">
          {(data ?? []).length === 0 && <li className="px-4 py-4 text-sm text-ink-3">אין מקורות ברשימה זו.</li>}
          {(data ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold">{r.proposed_name}</span>
                  <Badge tone={r.source_type === "company_site" ? "green" : r.source_type === "business_directory" ? "blue" : "amber"}>{SOURCE_TYPE[r.source_type]}</Badge>
                  {r.company_id && <Link href={`/customers/${r.company_id}`} className="text-brand">לכרטיס</Link>}
                </div>
                <p className="text-ink-2">{[r.proposed_city, r.proposed_specialization].filter(Boolean).join(" · ")}{r.proposed_phone ? <> · <span className="ltr tabular">{r.proposed_phone}</span></> : null}</p>
                <p className="text-ink-3">
                  נבדק {formatDate(r.checked_at)} · אומת: {(r.verified_fields ?? []).map((f: string) => FIELD_LABEL[f] ?? f).join(", ") || "לא אומת"} ·{" "}
                  <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand">מקור <ExternalLink size={11} /></a>
                </p>
                {r.notes && <p className="text-ink-3">{r.notes}</p>}
              </div>
              {isAdmin && status === "pending" && <ResearchDecision id={r.id} />}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
