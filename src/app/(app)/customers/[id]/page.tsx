import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone as PhoneIcon, Navigation, Mail, Plus, Pencil, AlertTriangle, ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ACTIVITY_SELECT, listProfiles, type ActivityRow } from "@/lib/queries";
import { regionName, wazeLink } from "@/lib/geo";
import { CLASSIFICATION, COMPANY_STATUS, CONTACT_STATUS, ISSUE_KIND, PRIORITY, SOURCE_TYPE, STAGE_LABEL, VERIFICATION, formatMoney } from "@/lib/labels";
import { formatDate, formatDateTime, localDateOf, localTimeOf, todayLocal } from "@/lib/time";
import type { Company, Contact, Opportunity, Site } from "@/lib/types";
import { Badge, btnClass, Card, CardHeader, ExtLink, Notice } from "@/components/ui";
import { Modal } from "@/components/client";
import { ActivityCard, statusLabel, statusTone } from "@/components/activity/card";
import { NewActivityForm } from "@/components/activity/forms";
import { ContactForm, DeleteForm, EditCompanyForm, NoteForm, ProfileForm, ResolveIssueForm, SiteForm, SourceForm } from "@/components/company/forms";
import { OpportunityForm } from "@/components/opportunity/forms";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, profile } = await requireUser();
  const { data: c } = await supabase.from("companies").select("*").eq("id", id).maybeSingle<Company>();
  if (!c) notFound(); // אין רשומה או אין הרשאה (RLS) — אותה תשובה

  const [sites, contacts, opps, acts, notes, issues, profiles, mergedFrom] = await Promise.all([
    supabase.from("company_sites").select("*").eq("company_id", id).order("is_primary", { ascending: false }),
    supabase.from("contacts").select("*").eq("company_id", id).order("is_primary", { ascending: false }),
    supabase.from("opportunities").select("*").eq("company_id", id).order("created_at", { ascending: false }),
    supabase.from("activities").select(ACTIVITY_SELECT).eq("company_id", id).order("starts_at", { ascending: false, nullsFirst: false }).limit(200),
    supabase.from("company_notes").select("*").eq("company_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("data_issues").select("*").eq("company_id", id).order("created_at", { ascending: false }),
    listProfiles(supabase),
    supabase.from("companies").select("id,name").eq("merged_into", id),
  ]);
  const S = (sites.data ?? []) as Site[];
  const C = (contacts.data ?? []) as Contact[];
  const O = (opps.data ?? []) as Opportunity[];
  const A = (acts.data ?? []) as ActivityRow[];
  const openIssues = (issues.data ?? []).filter((i) => i.status === "open");
  const closedIssues = (issues.data ?? []).filter((i) => i.status !== "open");
  const isAdmin = profile.role === "admin";
  const who = (uid: string | null) => (uid ? profiles.find((p) => p.id === uid)?.full_name || "משתמש" : "מערכת/ייבוא");
  const primary = S.find((s) => s.is_primary) ?? S[0];
  const navAddr = primary && primary.navigable ? [primary.street, primary.city].filter(Boolean).join(", ") : null;
  const future = A.filter((a) => ["scheduled", "proposed"].includes(a.status)).reverse();
  const history = A.filter((a) => !["scheduled", "proposed"].includes(a.status));
  const timeline = [
    ...history.map((a) => ({ at: a.completed_at ?? a.starts_at ?? a.created_at, kind: "act" as const, a })),
    ...(notes.data ?? []).map((n) => ({ at: n.created_at as string, kind: "note" as const, n })),
  ].sort((x, y) => (y.at ?? "").localeCompare(x.at ?? ""));
  const ownersOpt = isAdmin ? profiles.map((p) => ({ id: p.id, name: p.full_name || p.email })) : undefined;
  const profileFilled = ["materials", "part_size", "axes", "precision_req", "batch_size"].filter((k) => c[k as keyof Company]).length;

  return (
    <>
      {c.merged_into && (
        <div className="mb-4"><Notice tone="blue">רשומה זו אוחדה לרשומה אחרת. <Link className="underline" href={`/customers/${c.merged_into}`}>מעבר לרשומה הפעילה</Link></Notice></div>
      )}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/customers" className="text-sm text-ink-3 hover:text-ink">לקוחות ›</Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{c.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={c.status === "existing" ? "green" : c.status === "past" ? "blue" : c.status === "irrelevant" ? "neutral" : "brand"}>{COMPANY_STATUS[c.status]}</Badge>
            <Badge tone={c.classification === "unclassified" ? "amber" : "neutral"}>{CLASSIFICATION[c.classification]}{!c.classification_confirmed && c.classification !== "unclassified" ? " (אוטומטי)" : ""}</Badge>
            {c.classification === "unclassified" && c.classification_suggested && <Badge tone="neutral">הצעה: {CLASSIFICATION[c.classification_suggested]}</Badge>}
            <Badge tone={c.priority === "high" ? "red" : "neutral"}>עדיפות {PRIORITY[c.priority]}</Badge>
            <Badge tone="neutral">{CONTACT_STATUS[c.contact_status]}</Badge>
            <Badge tone={c.verification_status === "verified" ? "green" : c.verification_status === "conflict" ? "red" : "amber"}>{VERIFICATION[c.verification_status]}</Badge>
            <Badge tone="neutral">אחראי: {who(c.owner_id) === "מערכת/ייבוא" ? "לא משויך" : who(c.owner_id)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.phone_main && <ExtLink href={`tel:${c.phone_main.replace(/[^\d+]/g, "")}`} variant="soft"><PhoneIcon size={16} /> חיוג</ExtLink>}
          {navAddr && <ExtLink href={wazeLink(navAddr)}><Navigation size={16} /> ניווט</ExtLink>}
          <Modal title="פעולה חדשה" trigger={<><Plus size={16} /> פעולה</>} triggerClass={btnClass("primary", "md")}>
            <NewActivityForm
              companies={[{ id: c.id, name: c.name, sites: S.map((s) => ({ id: s.id, label: s.label || s.address_raw || "אתר" })), contacts: C.map((x) => ({ id: x.id, label: x.name + (x.role ? ` · ${x.role}` : "") })) }]}
              defaultCompanyId={c.id}
              defaultDate={todayLocal()}
              owners={ownersOpt}
            />
          </Modal>
          <Modal title="עריכת פרטי לקוח" trigger={<><Pencil size={15} /> עריכה</>} wide>
            <EditCompanyForm c={c} owners={ownersOpt} />
          </Modal>
        </div>
      </div>

      {openIssues.length > 0 && (
        <Card className="mb-5 border-amber-200 bg-amber-50/40">
          <CardHeader title={<span className="inline-flex items-center gap-1.5"><AlertTriangle size={16} className="text-amber-700" /> דורש בירור או השלמה</span>} />
          <ul className="divide-y divide-amber-100">
            {openIssues.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                <div><span className="font-medium">{ISSUE_KIND[i.kind] ?? i.kind}</span>{i.detail ? <span className="text-ink-2"> — {i.detail}</span> : null}</div>
                <ResolveIssueForm id={i.id} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* משימות עתידיות */}
          <section>
            <h2 className="mb-2 text-lg font-semibold">פעולות פתוחות</h2>
            {future.length === 0 ? <p className="text-sm text-ink-3">אין פעולות מתוכננות. הוסיפו שיחה או ביקור בכפתור &quot;פעולה&quot;.</p> : (
              <div className="space-y-3">{future.map((a) => <ActivityCard key={a.id} a={a} showDate overdue={(a.starts_at ? localDateOf(a.starts_at) : a.due_date ?? "") < todayLocal()} />)}</div>
            )}
          </section>

          {/* הזדמנויות */}
          <Card id="opps">
            <CardHeader title="הזדמנויות" action={<Modal title="הזדמנות חדשה" trigger={<><Plus size={15} /> חדשה</>} triggerClass={btnClass("ghost", "sm")}><OpportunityForm companyId={c.id} owners={ownersOpt} /></Modal>} />
            {O.length === 0 ? <p className="px-4 py-4 text-sm text-ink-3">אין הזדמנויות.</p> : (
              <ul className="divide-y divide-line">
                {O.map((o) => (
                  <li key={o.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{o.title}</span>
                        <Badge tone={o.stage === "won" ? "green" : o.stage === "lost" ? "neutral" : "brand"}>{STAGE_LABEL[o.stage]}</Badge>
                        {o.brand && <Badge tone="neutral">{o.brand}{o.model ? ` · ${o.model}` : ""}</Badge>}
                      </div>
                      <p className="mt-0.5 text-sm text-ink-3">
                        {formatMoney(o.amount, o.currency)} · אחראי: {who(o.owner_id)}
                        {o.next_step ? ` · הבא: ${o.next_step}${o.next_step_date ? ` (${formatDate(o.next_step_date)})` : ""}` : !["won", "lost"].includes(o.stage) ? " · אין צעד הבא" : ""}
                      </p>
                      {o.loss_reason && <p className="text-sm text-ink-3">סיבת הפסד: {o.loss_reason}</p>}
                      {o.hold_reason && <p className="text-sm text-ink-3">מושהה: {o.hold_reason}</p>}
                    </div>
                    <Modal title="עריכת הזדמנות" trigger={<Pencil size={15} />} triggerClass={btnClass("ghost", "sm")}><OpportunityForm opp={o} /></Modal>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* אפיון */}
          <Card>
            <CardHeader title="אפיון טכני" sub={profileFilled < 3 ? "עדיין אין מספיק אפיון כדי לקבוע התאמה ל-AKIRA או ל-ZPS. השלימו בביקור או בשיחה." : "התאמה נקבעת רק לפי האפיון שנאסף."} />
            <div className="p-4"><ProfileForm c={c} /></div>
          </Card>

          {/* היסטוריה */}
          <Card>
            <CardHeader title="היסטוריה: שיחות, ביקורים והערות" />
            <div className="border-b border-line p-3"><NoteForm companyId={c.id} /></div>
            {timeline.length === 0 ? <p className="px-4 py-4 text-sm text-ink-3">אין עדיין היסטוריה.</p> : (
              <ol className="divide-y divide-line">
                {timeline.map((t) =>
                  t.kind === "act" ? (
                    <li key={t.a.id} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={statusTone(t.a)}>{statusLabel(t.a)}</Badge>
                        <span className="text-ink-3">{t.a.starts_at ? `${formatDate(t.a.starts_at)} ${localTimeOf(t.a.starts_at)}` : formatDate(t.a.due_date)} · {who(t.a.owner_id)}</span>
                      </div>
                      {t.a.purpose && <p className="mt-1 text-ink-2">{t.a.purpose}</p>}
                      {t.a.outcome && <p className="mt-0.5">{t.a.outcome}</p>}
                      {t.a.next_step && <p className="mt-0.5 text-ink-3">הצעד הבא: {t.a.next_step}{t.a.follow_up_date ? ` (${formatDate(t.a.follow_up_date)})` : ""}</p>}
                    </li>
                  ) : (
                    <li key={t.n.id} className="px-4 py-3 text-sm">
                      <div className="text-ink-3">הערה · {formatDateTime(t.n.created_at)} · {who(t.n.created_by)}</div>
                      <p className="mt-0.5 whitespace-pre-line">{t.n.body}</p>
                    </li>
                  ),
                )}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader title="פרטי חברה" />
            <dl className="space-y-2 px-4 py-3 text-sm">
              <Row k="טלפון">{c.phone_main ? <a className="ltr tabular text-brand" href={`tel:${c.phone_main.replace(/[^\d+]/g, "")}`}>{c.phone_main}</a> : "—"}</Row>
              <Row k="פקס"><span className="ltr tabular">{c.fax ?? "—"}</span></Row>
              <Row k="אימייל">{c.email_main ? <a className="ltr text-brand" href={`mailto:${c.email_main}`}>{c.email_main}</a> : "—"}</Row>
              {c.website && <Row k="אתר"><a className="ltr text-brand" href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer">{c.website}</a></Row>}
              <Row k="התמחות">{c.specialization ?? "—"}</Row>
              {c.activity_fields && <Row k="תחומי פעילות">{c.activity_fields}</Row>}
              {c.equipment_known && <Row k="ציוד קיים">{c.equipment_known}</Row>}
              {c.notes && <Row k="הערות"><span className="whitespace-pre-line">{c.notes}</span></Row>}
            </dl>
          </Card>

          <Card>
            <CardHeader title={`אתרים (${S.length})`} action={<Modal title="אתר חדש" trigger={<Plus size={15} />} triggerClass={btnClass("ghost", "sm")}><SiteForm companyId={c.id} /></Modal>} />
            <ul className="divide-y divide-line">
              {S.length === 0 && <li className="px-4 py-3 text-sm text-ink-3">אין כתובת.</li>}
              {S.map((s) => {
                const addr = s.navigable ? [s.street, s.city].filter(Boolean).join(", ") : null;
                return (
                  <li key={s.id} className="px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{s.label || (s.is_primary ? "ראשי" : "אתר")}</p>
                        <p className="text-ink-2">{s.address_raw ?? "—"}</p>
                        <p className="text-ink-3">{regionName(s.region_code)}{!s.region_certain && <span className="text-amber-700"> · אזור לבדיקה</span>}</p>
                        {!s.navigable && <p className="text-amber-800">{s.is_po_box ? "תיבת דואר — אינה יעד ניווט" : "כתובת חלקית"}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {addr && <a className="text-brand" href={wazeLink(addr)} target="_blank" rel="noreferrer">ניווט</a>}
                        <Modal title="עריכת אתר" trigger="עריכה" triggerClass="text-sm text-ink-3 hover:text-ink"><SiteForm companyId={c.id} site={s} /></Modal>
                        <DeleteForm kind="site" id={s.id} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader title={`אנשי קשר (${C.length})`} action={<Modal title="איש קשר חדש" trigger={<Plus size={15} />} triggerClass={btnClass("ghost", "sm")}><ContactForm companyId={c.id} sites={S} /></Modal>} />
            <ul className="divide-y divide-line">
              {C.length === 0 && <li className="px-4 py-3 text-sm text-ink-3">אין אנשי קשר ידועים.</li>}
              {C.map((x) => (
                <li key={x.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{x.name}{x.is_primary ? " · ראשי" : ""}</p>
                      {x.role && <p className="text-ink-3">{x.role}</p>}
                      <div className="mt-1 flex flex-wrap gap-3">
                        {(x.mobile || x.phone) && <a className="inline-flex items-center gap-1 text-brand" href={`tel:${(x.mobile || x.phone)!.replace(/[^\d+]/g, "")}`}><PhoneIcon size={13} /><span className="ltr tabular">{x.mobile || x.phone}</span></a>}
                        {x.email && <a className="inline-flex items-center gap-1 text-brand" href={`mailto:${x.email}`}><Mail size={13} /><span className="ltr">{x.email}</span></a>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Modal title="עריכת איש קשר" trigger="עריכה" triggerClass="text-sm text-ink-3 hover:text-ink"><ContactForm companyId={c.id} contact={x} sites={S} /></Modal>
                      <DeleteForm kind="contact" id={x.id} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="מקור ואימות" action={<Modal title="מקור ואימות" trigger={<Pencil size={15} />} triggerClass={btnClass("ghost", "sm")}><SourceForm c={c} /></Modal>} />
            <dl className="space-y-2 px-4 py-3 text-sm">
              <Row k="מקור">{SOURCE_TYPE[c.source_type]}</Row>
              {c.source_url && <Row k="קישור"><a className="inline-flex items-center gap-1 text-brand" href={c.source_url} target="_blank" rel="noreferrer">פתיחה <ExternalLink size={12} /></a></Row>}
              <Row k="אימות">{VERIFICATION[c.verification_status]}{c.last_verified_at ? ` · נבדק ${formatDate(c.last_verified_at)}` : " · לא נבדק"}</Row>
              {c.source_note && <Row k="מה אומת"><span className="whitespace-pre-line">{c.source_note}</span></Row>}
              <Row k="נוצר">{formatDateTime(c.created_at)} · {who(c.created_by)}</Row>
              <Row k="עודכן">{formatDateTime(c.updated_at)} · {who(c.updated_by)}</Row>
              {(mergedFrom.data ?? []).length > 0 && <Row k="אוחדו לכאן">{(mergedFrom.data ?? []).map((m) => m.name).join(", ")}</Row>}
            </dl>
            {c.raw && (
              <details className="border-t border-line px-4 py-3 text-sm">
                <summary className="cursor-pointer text-ink-2">הנתונים המקוריים מהייבוא</summary>
                <dl className="mt-2 space-y-1">
                  {Object.entries(c.raw).map(([k, v]) => <Row key={k} k={k}><span className="whitespace-pre-line">{v ?? "—"}</span></Row>)}
                </dl>
              </details>
            )}
            {closedIssues.length > 0 && (
              <details className="border-t border-line px-4 py-3 text-sm">
                <summary className="cursor-pointer text-ink-2">פריטים שטופלו ({closedIssues.length})</summary>
                <ul className="mt-2 space-y-1 text-ink-3">{closedIssues.map((i) => <li key={i.id}>{ISSUE_KIND[i.kind] ?? i.kind}: {i.detail}</li>)}</ul>
              </details>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2">
      <dt className="text-ink-3">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
