import Link from "next/link";
import { Plus, Phone as PhoneIcon, MapPin, AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listProfiles } from "@/lib/queries";
import { REGIONS, REGION_CODES, regionName } from "@/lib/geo";
import { CLASSIFICATION, COMPANY_STATUS, CONTACT_STATUS, PRIORITY, VERIFICATION } from "@/lib/labels";
import { Badge, btnClass, Empty, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm, Modal, SubmitButton } from "@/components/client";
import { AutoSubmitSelect } from "@/components/user-picker";
import { NewCompanyForm } from "@/components/company/forms";
import { assignCompanies } from "@/app/actions/companies";

const PAGE = 50;
type SP = { q?: string; region?: string; status?: string; owner?: string; contact?: string; verif?: string; priority?: string; cls?: string; issues?: string; page?: string };

function clean(q: string) {
  return q.replace(/[,()*%\\]/g, " ").trim().toLowerCase();
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser();
  const isAdmin = profile.role === "admin";
  const page = Math.max(1, Number(sp.page) || 1);

  const siteJoin = sp.region ? "company_sites!inner(id,city,region_code,region_certain,navigable,is_po_box,is_primary)" : "company_sites(id,city,region_code,region_certain,navigable,is_po_box,is_primary)";
  const issuesJoin = sp.issues === "1" ? "data_issues!inner(id,status)" : "data_issues(id,status)";
  let q = supabase
    .from("companies")
    .select(`id,name,status,classification,priority,contact_status,verification_status,phone_main,owner_id,last_contact_at,${siteJoin},contacts(id,name),${issuesJoin}`, { count: "exact" })
    .is("merged_into", null);

  if (sp.q) {
    const t = clean(sp.q);
    const digits = t.replace(/\D/g, "");
    q = digits.length >= 3 && digits.length === t.replace(/[\s-]/g, "").length ? q.ilike("search_text", `%${digits}%`) : q.ilike("search_text", `%${t}%`);
  }
  if (sp.region === "none") q = q.is("company_sites.region_code", null);
  else if (sp.region) q = q.eq("company_sites.region_code", sp.region);
  if (sp.status) q = q.eq("status", sp.status);
  else q = q.neq("status", "irrelevant");
  if (sp.owner === "none") q = q.is("owner_id", null);
  else if (sp.owner) q = q.eq("owner_id", sp.owner);
  if (sp.contact) q = q.eq("contact_status", sp.contact);
  if (sp.verif) q = q.eq("verification_status", sp.verif);
  if (sp.priority) q = q.eq("priority", sp.priority);
  if (sp.cls) q = q.eq("classification", sp.cls);
  if (sp.issues === "1") q = q.eq("data_issues.status", "open");

  const [{ data, count, error }, profiles] = await Promise.all([q.order("name").range((page - 1) * PAGE, page * PAGE - 1), listProfiles(supabase)]);
  const rows = data ?? [];
  const ownerName = (id: string | null) => (id ? profiles.find((p) => p.id === id)?.full_name || "—" : "לא משויך");
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/customers?${p.toString()}`;
  };
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  return (
    <>
      <PageHeader
        title="לקוחות"
        sub={`${count ?? 0} חברות${sp.status ? "" : " (ללא \"לא רלוונטי\")"} · חברה עם כמה אתרים נספרת פעם אחת`}
        actions={
          <>
          <a href="/api/export/customers" className={btnClass("secondary", "md")}>ייצוא CSV</a>
          <Modal title="לקוח חדש" trigger={<><Plus size={16} /> לקוח חדש</>} triggerClass={btnClass("primary", "md")}>
            <NewCompanyForm owners={isAdmin ? profiles.map((p) => ({ id: p.id, name: p.full_name || p.email })) : undefined} />
          </Modal>
          </>
        }
      />

      <form className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" action="/customers">
        <Input name="q" defaultValue={sp.q} placeholder="חיפוש: שם, יישוב, איש קשר, טלפון" className="col-span-2 sm:col-span-4 lg:col-span-8" />
        <AutoSubmitSelect name="region" defaultValue={sp.region ?? ""} className="h-10 rounded-lg border border-line bg-white px-2 text-sm">
          <option value="">כל האזורים</option>
          {REGION_CODES.map((r) => <option key={r} value={r}>{REGIONS[r].name}</option>)}
          <option value="none">ללא אזור</option>
        </AutoSubmitSelect>
        <AutoSubmitSelect name="status" defaultValue={sp.status ?? ""} className="h-10 rounded-lg border border-line bg-white px-2 text-sm">
          <option value="">כל המצבים</option>
          {Object.entries(COMPANY_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="cls" defaultValue={sp.cls ?? ""} className="h-10 rounded-lg border border-line bg-white px-2 text-sm">
          <option value="">כל סוגי הפעילות</option>
          {Object.entries(CLASSIFICATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="contact" defaultValue={sp.contact ?? ""} className="h-10 rounded-lg border border-line bg-white px-2 text-sm">
          <option value="">כל מצבי הקשר</option>
          {Object.entries(CONTACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="verif" defaultValue={sp.verif ?? ""} className="h-10 rounded-lg border border-line bg-white px-2 text-sm">
          <option value="">כל מצבי האימות</option>
          {Object.entries(VERIFICATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="priority" defaultValue={sp.priority ?? ""} className="h-10 rounded-lg border border-line bg-white px-2 text-sm">
          <option value="">כל העדיפויות</option>
          {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </AutoSubmitSelect>
        {isAdmin ? (
          <AutoSubmitSelect name="owner" defaultValue={sp.owner ?? ""} className="h-10 rounded-lg border border-line bg-white px-2 text-sm">
            <option value="">כל אנשי המכירות</option>
            <option value="none">לא משויך</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </AutoSubmitSelect>
        ) : <span />}
        <AutoSubmitSelect name="issues" defaultValue={sp.issues ?? ""} className="h-10 rounded-lg border border-line bg-white px-2 text-sm">
          <option value="">הכול</option>
          <option value="1">עם פריטים להשלמה</option>
        </AutoSubmitSelect>
        <button className="sr-only">חיפוש</button>
      </form>

      {error && <p className="mb-3 text-sm text-red-700">שגיאה בטעינה: {error.message}</p>}
      {rows.length === 0 ? (
        <Empty title="לא נמצאו לקוחות">{!sp.q && !isAdmin ? "עדיין לא שויכו אליכם לקוחות. מנהל המערכת משייך לקוחות מהמאגר." : "נסו לשנות את החיפוש או הסינון."}</Empty>
      ) : (
        <ActionForm action={assignCompanies} closeOnSuccess={false}>
          {isAdmin && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm">
              <span className="text-ink-3">שיוך הלקוחות המסומנים ל:</span>
              <Select name="owner_id" className="h-9 w-auto">
                <option value="">ללא שיוך</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </Select>
              <SubmitButton variant="secondary">שיוך</SubmitButton>
            </div>
          )}
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {rows.map((c) => {
              const sites = (c.company_sites ?? []) as { id: string; city: string | null; region_code: string | null; region_certain: boolean; navigable: boolean; is_po_box: boolean; is_primary: boolean }[];
              const primary = sites.find((x) => x.is_primary) ?? sites[0];
              const openIssues = ((c.data_issues ?? []) as { status: string }[]).filter((i) => i.status === "open").length;
              const contacts = (c.contacts ?? []) as { name: string }[];
              return (
                <li key={c.id} className="flex items-start gap-3 px-3 py-3 hover:bg-canvas/60 sm:px-4">
                  {isAdmin && <input type="checkbox" name="ids" value={c.id} aria-label={`בחירת ${c.name}`} className="mt-1.5 size-4 accent-[var(--color-brand)]" />}
                  <Link href={`/customers/${c.id}`} className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{c.name}</span>
                      <Badge tone={c.status === "existing" ? "green" : c.status === "past" ? "blue" : c.status === "irrelevant" ? "neutral" : "brand"}>{COMPANY_STATUS[c.status]}</Badge>
                      {c.classification !== "machining" && <Badge tone={c.classification === "unclassified" ? "amber" : "neutral"}>{CLASSIFICATION[c.classification]}</Badge>}
                      {c.priority === "high" && <Badge tone="red">עדיפות גבוהה</Badge>}
                      {sites.length > 1 && <Badge tone="neutral">{sites.length} אתרים</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-ink-3">
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={13} />
                        {primary?.city ?? "יישוב לא ידוע"} · {regionName(primary?.region_code)}
                        {primary && !primary.region_certain && <span className="text-amber-700">(לבדיקה)</span>}
                        {primary?.is_po_box && !primary.navigable && <span className="text-amber-700">· ת.ד.</span>}
                      </span>
                      {c.phone_main && <span className="inline-flex items-center gap-1"><PhoneIcon size={13} /><span className="ltr tabular">{c.phone_main}</span></span>}
                      {contacts[0] && <span>{contacts[0].name}</span>}
                      <span>{CONTACT_STATUS[c.contact_status]}</span>
                      {isAdmin && <span>{ownerName(c.owner_id)}</span>}
                      {openIssues > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={13} />{openIssues} להשלמה</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </ActionForm>
      )}
      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
          {page > 1 && <Link className={btnClass("secondary", "sm")} href={qs({ page: String(page - 1) })}>הקודם</Link>}
          <span className="text-ink-3">עמוד {page} מתוך {totalPages}</span>
          {page < totalPages && <Link className={btnClass("secondary", "sm")} href={qs({ page: String(page + 1) })}>הבא</Link>}
        </nav>
      )}
    </>
  );
}
