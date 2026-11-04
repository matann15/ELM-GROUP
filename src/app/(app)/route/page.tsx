import Link from "next/link";
import { Navigation, Phone as PhoneIcon, AlertTriangle, MapPin, Clock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ACTIVITY_SELECT, listProfiles, navAddress, resolveViewedUser, type ActivityRow } from "@/lib/queries";
import { CITIES, cityCoords, estimateDriveMinutes, findCityByText, REGIONS, regionName, wazeLink, type RegionCode } from "@/lib/geo";
import { addDays, dayBoundsUtc, formatHebDate, localTimeOf, todayLocal } from "@/lib/time";
import { Badge, btnClass, Card, CardHeader, Empty, ExtLink, Notice, PageHeader } from "@/components/ui";
import { UserPicker } from "@/components/user-picker";
import { statusLabel, statusTone } from "@/components/activity/card";
import { PRIORITY } from "@/lib/labels";

export default async function RoutePage({ searchParams }: { searchParams: Promise<{ date?: string; user?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser();
  const uid = resolveViewedUser(profile, sp.user);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayLocal();
  const { from, to } = dayBoundsUtc(date);
  const [{ data }, profiles, owner] = await Promise.all([
    supabase.from("activities").select(ACTIVITY_SELECT).eq("owner_id", uid).eq("type", "visit").not("status", "in", "(cancelled,postponed)").gte("starts_at", from).lt("starts_at", to).order("starts_at"),
    profile.role === "admin" ? listProfiles(supabase) : Promise.resolve([]),
    supabase.from("profiles").select("home_base").eq("id", uid).maybeSingle(),
  ]);
  const visits = (data ?? []) as ActivityRow[];
  const home = findCityByText(owner.data?.home_base ?? "") ?? CITIES.find((c) => c.name === "קריית ביאליק")!;

  const regions = [...new Set(visits.map((v) => v.site?.region_code).filter(Boolean))] as RegionCode[];
  const nearRegions = [...new Set(regions.flatMap((r) => [r, ...REGIONS[r].neighbors]))];
  const visitedIds = visits.map((v) => v.company_id).filter(Boolean) as string[];
  const alternatives = regions.length
    ? (
        await supabase
          .from("companies")
          .select("id,name,phone_main,priority,status,company_sites!inner(street,city,region_code,navigable,region_certain)")
          .eq("owner_id", uid)
          .is("merged_into", null)
          .neq("status", "irrelevant")
          .neq("contact_status", "do_not_contact")
          .in("company_sites.region_code", nearRegions)
          .eq("company_sites.navigable", true)
          .limit(60)
      ).data ?? []
    : [];
  const prioRank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
  const alt = alternatives
    .filter((c) => !visitedIds.includes(c.id))
    .map((c) => ({ ...c, site: (c.company_sites as { street: string | null; city: string | null; region_code: string }[])[0] }))
    .sort((a, b) => Number(!regions.includes(a.site.region_code as RegionCode)) - Number(!regions.includes(b.site.region_code as RegionCode)) || prioRank[a.priority] - prioRank[b.priority])
    .slice(0, 8);

  let prev = { lat: home.lat, lng: home.lng };
  const legs = visits.map((v) => {
    const c = cityCoords(v.site?.city);
    const m = c ? estimateDriveMinutes(prev, c) : null;
    if (c) prev = c;
    return m;
  });
  const navigable = visits.map((v) => navAddress(v.site)).filter(Boolean) as string[];
  const gmaps = navigable.length
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(home.name)}&destination=${encodeURIComponent(navigable[navigable.length - 1])}${navigable.length > 1 ? `&waypoints=${encodeURIComponent(navigable.slice(0, -1).join("|"))}` : ""}&travelmode=driving`
    : null;
  const q = (d: string) => `/route?date=${d}${sp.user ? `&user=${sp.user}` : ""}`;

  return (
    <>
      <PageHeader
        title="מסלול יום שטח"
        sub={`${formatHebDate(date)} · יציאה מ${home.name}`}
        actions={
          <>
            {profile.role === "admin" && <UserPicker profiles={profiles} value={uid} />}
            <Link href={q(addDays(date, -1))} className={btnClass("ghost", "md")}>יום קודם</Link>
            <Link href={q(addDays(date, 1))} className={btnClass("ghost", "md")}>יום הבא</Link>
          </>
        }
      />
      <div className="mb-4">
        <Notice tone="blue">הסדר הוא לפי שעות הביקורים. זמני הנסיעה הם הערכה גסה לפי מרחק אווירי בין יישובים — לא חושב מסלול אופטימלי ולא נבדק מצב תנועה. לזמן נסיעה אמיתי פתחו את הניווט.</Notice>
      </div>
      {visits.length === 0 ? (
        <Empty title="אין ביקורים ביום זה">ביקורים נוספים דרך מסך התכנון או מכרטיס לקוח.</Empty>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <ol className="space-y-3">
            {visits.map((v, i) => {
              const addr = navAddress(v.site);
              const phone = v.contact?.mobile || v.contact?.phone || v.company?.phone_main;
              return (
                <li key={v.id} className="rounded-xl border border-line bg-white p-4">
                  {legs[i] !== null && <p className="mb-2 inline-flex items-center gap-1 text-xs text-ink-3"><Clock size={12} /> ~{legs[i]} דק׳ נסיעה {i === 0 ? `מ${home.name}` : "מהביקור הקודם"} (הערכה)</p>}
                  <div className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="ltr tabular font-semibold">{v.starts_at ? localTimeOf(v.starts_at) : ""}</span>
                        <Link href={`/customers/${v.company_id}`} className="font-semibold hover:text-brand">{v.company?.name}</Link>
                        <Badge tone={statusTone(v)}>{statusLabel(v)}</Badge>
                      </div>
                      <p className="mt-1 inline-flex items-center gap-1 text-sm text-ink-2"><MapPin size={14} />{addr ?? v.site?.address_raw ?? "אין כתובת"} · {regionName(v.site?.region_code)}</p>
                      {v.contact && <p className="text-sm text-ink-3">{v.contact.name}{v.contact.role ? ` · ${v.contact.role}` : ""}</p>}
                      {v.purpose && <p className="text-sm text-ink-3">{v.purpose}</p>}
                      <div className="mt-2 space-y-1">
                        {v.status === "proposed" && <p className="inline-flex items-center gap-1 text-sm text-violet-800"><AlertTriangle size={14} /> הביקור לא אושר ע״י הלקוח — לתאם לפני היציאה.</p>}
                        {!addr && <p className="inline-flex items-center gap-1 text-sm text-amber-800"><AlertTriangle size={14} /> {v.site?.is_po_box ? "תיבת דואר — אינה יעד ניווט." : "כתובת חלקית — אין יעד ניווט."}</p>}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {addr && <ExtLink href={wazeLink(addr)} variant="primary"><Navigation size={16} /> ניווט</ExtLink>}
                        {phone && <ExtLink href={`tel:${phone.replace(/[^\d+]/g, "")}`} variant="soft"><PhoneIcon size={16} /> חיוג</ExtLink>}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
            {gmaps && navigable.length > 1 && (
              <ExtLink href={gmaps} className="w-full">פתיחת כל הביקורים ב-Google Maps (בסדר הנוכחי)</ExtLink>
            )}
          </ol>
          <aside>
            <Card>
              <CardHeader title="לקוחות חלופיים באזור" sub={regions.map((r) => regionName(r)).join(", ")} />
              {alt.length === 0 ? <p className="px-4 py-4 text-sm text-ink-3">אין לקוחות נוספים עם כתובת ניווט באזור.</p> : (
                <ul className="divide-y divide-line">
                  {alt.map((c) => {
                    const a = [c.site.street, c.site.city].filter(Boolean).join(", ");
                    return (
                      <li key={c.id} className="px-4 py-3 text-sm">
                        <Link href={`/customers/${c.id}`} className="font-medium hover:text-brand">{c.name}</Link>
                        <p className="text-ink-3">{a} · עדיפות {PRIORITY[c.priority]}</p>
                        <div className="mt-1.5 flex gap-3">
                          {c.phone_main && <a className="text-brand" href={`tel:${c.phone_main.replace(/[^\d+]/g, "")}`}>חיוג</a>}
                          <a className="text-brand" href={wazeLink(a)} target="_blank" rel="noreferrer">ניווט</a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
