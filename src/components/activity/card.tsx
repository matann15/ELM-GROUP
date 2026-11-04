import Link from "next/link";
import { Phone as PhoneIcon, Navigation, FileText, CheckCircle2, Clock, MapPin, AlertTriangle, User } from "lucide-react";
import { Modal } from "@/components/client";
import { Badge, btnClass, ExtLink } from "@/components/ui";
import { CompleteForm, RescheduleForm } from "./forms";
import { ConfirmVisitButton } from "./buttons";
import { ACTIVITY_TYPE, ACTIVITY_STATUS } from "@/lib/labels";
import { addDays, localDateOf, localTimeOf, todayLocal, formatShortDate } from "@/lib/time";
import { wazeLink } from "@/lib/geo";
import { navAddress, type ActivityRow } from "@/lib/queries";

export function statusTone(a: { type: string; status: string }) {
  if (a.status === "done") return "green" as const;
  if (a.status === "no_answer") return "amber" as const;
  if (a.status === "cancelled" || a.status === "postponed") return "neutral" as const;
  if (a.type === "visit" && a.status === "proposed") return "violet" as const;
  if (a.type === "visit" && a.status === "scheduled") return "blue" as const;
  return "neutral" as const;
}
export function statusLabel(a: { type: string; status: string }) {
  if (a.type === "visit") return { proposed: "ביקור מוצע · לא תואם", scheduled: "ביקור מתואם", done: "ביקור בוצע" }[a.status as "proposed"] ?? ACTIVITY_STATUS[a.status];
  if (a.type === "call" && a.status === "scheduled") return "שיחה מתוכננת";
  if (a.type === "call" && a.status === "proposed") return "שיחה מוצעת";
  if (a.type === "task" && a.status === "scheduled") return "פתוחה";
  return ACTIVITY_STATUS[a.status];
}

export function ActivityCard({ a, showDate, overdue }: { a: ActivityRow; showDate?: boolean; overdue?: boolean }) {
  const open = ["scheduled", "proposed"].includes(a.status);
  const phone = a.contact?.mobile || a.contact?.phone || a.company?.phone_main || null;
  const addr = navAddress(a.site);
  const date = a.starts_at ? localDateOf(a.starts_at) : a.due_date ?? todayLocal();
  const time = a.starts_at ? localTimeOf(a.starts_at) : "";
  const title = a.company?.name ?? a.title ?? "משימה";
  const isCoord = a.type === "call" && !!a.related_visit_id;
  const accent = a.type === "visit" ? (a.status === "proposed" ? "border-s-violet-400" : a.status === "done" ? "border-s-emerald-500" : "border-s-sky-500") : a.type === "call" ? "border-s-brand" : "border-s-ink-3/40";

  return (
    <article className={`rounded-xl border border-line border-s-4 ${accent} bg-white p-3.5 sm:p-4 ${!open ? "opacity-80" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="w-14 shrink-0 text-center">
          {time ? <div className="ltr tabular text-lg font-semibold leading-tight">{time}</div> : <Clock size={18} className="mx-auto mt-1 text-ink-3" />}
          {showDate && <div className="mt-0.5 text-xs text-ink-3">{formatShortDate(date)}</div>}
          <div className="mt-1 text-xs text-ink-3">{ACTIVITY_TYPE[a.type]}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-[16px] font-semibold">{a.company ? <Link href={`/customers/${a.company.id}`} className="hover:text-brand">{title}</Link> : title}</h3>
            <Badge tone={statusTone(a)}>{statusLabel(a)}</Badge>
            {overdue && <Badge tone="red">באיחור</Badge>}
            {a.plan_id && open && <Badge tone="neutral">מהתוכנית</Badge>}
          </div>
          {a.purpose && <p className="mt-0.5 text-sm text-ink-2">{a.purpose}</p>}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
            {a.contact && <span className="inline-flex items-center gap-1"><User size={14} />{a.contact.name}{a.contact.role ? ` · ${a.contact.role}` : ""}</span>}
            {phone && <span className="inline-flex items-center gap-1"><PhoneIcon size={14} /><span className="ltr tabular">{phone}</span></span>}
            {a.site && (a.type === "visit" || addr) && (
              <span className="inline-flex items-center gap-1"><MapPin size={14} />{addr ?? a.site.address_raw ?? "—"}</span>
            )}
          </div>
          {a.type === "visit" && open && !addr && (
            <p className="mt-1.5 inline-flex items-center gap-1 text-sm text-amber-800"><AlertTriangle size={14} /> {a.site?.is_po_box ? "תיבת דואר — אינה יעד ניווט. יש לברר כתובת פיזית." : "כתובת חלקית — יש לברר כתובת לפני הביקור."}</p>
          )}
          {a.status === "done" && (a.outcome || a.next_step) && (
            <p className="mt-1.5 text-sm text-ink-2">{a.outcome}{a.next_step ? <span className="text-ink-3"> · הבא: {a.next_step}</span> : null}</p>
          )}
          {a.status === "no_answer" && a.outcome && <p className="mt-1.5 text-sm text-amber-800">{a.outcome}</p>}

          {open && (
            <div className="mt-3 flex flex-wrap gap-2">
              {phone && (
                <ExtLink href={`tel:${phone.replace(/[^\d+]/g, "")}`} variant="soft" size="md" className="min-w-[88px]">
                  <PhoneIcon size={16} /> חיוג
                </ExtLink>
              )}
              {addr && (
                <ExtLink href={wazeLink(addr)} size="md">
                  <Navigation size={16} /> ניווט
                </ExtLink>
              )}
              <Modal title={`סיום: ${title}`} trigger={<><CheckCircle2 size={16} /> סיום ותיעוד</>} triggerClass={btnClass("primary", "md")}>
                <CompleteForm id={a.id} type={a.type} isCoordination={isCoord} defaultFollowDate={addDays(date, a.type === "visit" ? 7 : 3)} />
              </Modal>
              {a.type === "visit" && a.status === "proposed" && <ConfirmVisitButton id={a.id} />}
              <Modal title="העברת מועד" trigger="העברה" triggerClass={btnClass("ghost", "md")}>
                <RescheduleForm id={a.id} date={date} time={time} type={a.type} status={a.status} />
              </Modal>
              {a.company && (
                <Link href={`/customers/${a.company.id}`} className={btnClass("ghost", "md")}>
                  <FileText size={16} /> כרטיס
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
