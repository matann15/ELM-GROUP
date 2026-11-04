import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listProfiles } from "@/lib/queries";
import { STAGES, formatMoney } from "@/lib/labels";
import { formatShortDate, todayLocal } from "@/lib/time";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { StageSelect } from "@/components/opportunity/forms";
import { UserPicker } from "@/components/user-picker";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ user?: string; closed?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser();
  const isAdmin = profile.role === "admin";
  let q = supabase.from("opportunities").select("*, company:companies(id,name)").order("next_step_date", { ascending: true, nullsFirst: true });
  if (isAdmin && sp.user) q = q.eq("owner_id", sp.user);
  const [{ data }, profiles] = await Promise.all([q, isAdmin ? listProfiles(supabase) : Promise.resolve([])]);
  const opps = data ?? [];
  const today = todayLocal();
  const showClosed = sp.closed === "1";
  const stages = STAGES.filter((s) => showClosed || !["won", "lost"].includes(s.key));
  const name = (id: string | null) => profiles.find((p) => p.id === id)?.full_name;

  // סכומים מוצגים לפי מטבע ורק כשידועים — ללא המרה וללא סיכויי סגירה משוערים
  const totals = (key: string) => {
    const t: Record<string, number> = {};
    let unknown = 0;
    for (const o of opps.filter((o) => o.stage === key)) {
      if (o.amount === null) unknown++;
      else t[o.currency] = (t[o.currency] ?? 0) + Number(o.amount);
    }
    return { t, unknown };
  };

  return (
    <>
      <PageHeader
        title="הזדמנויות מכירה"
        sub="יצירת הזדמנות נעשית מתוך כרטיס הלקוח. סכומים מוצגים רק כשהם ידועים."
        actions={
          <>
            {isAdmin && <UserPicker profiles={profiles} value={sp.user ?? ""} allowAll />}
            <Link className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-3 text-[15px]" href={`/opportunities?${new URLSearchParams({ ...(sp.user ? { user: sp.user } : {}), ...(showClosed ? {} : { closed: "1" }) })}`}>
              {showClosed ? "הסתרת סגורות" : "הצגת סגורות"}
            </Link>
          </>
        }
      />
      {opps.length === 0 ? (
        <Empty title="אין עדיין הזדמנויות">פתחו כרטיס לקוח ← &quot;הזדמנויות&quot; ← &quot;חדשה&quot;.</Empty>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
          <div className="flex gap-3" style={{ minWidth: `${stages.length * 260}px` }}>
            {stages.map((st) => {
              const items = opps.filter((o) => o.stage === st.key);
              const { t, unknown } = totals(st.key);
              return (
                <section key={st.key} className="w-[260px] shrink-0 rounded-xl bg-black/[0.03] p-2">
                  <header className="mb-2 px-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <h2 className="font-semibold">{st.label}</h2>
                      <span className="text-sm text-ink-3">{items.length}</span>
                    </div>
                    <p className="text-xs text-ink-3">
                      {Object.entries(t).map(([cur, v]) => formatMoney(v, cur)).join(" · ") || (items.length ? "" : "—")}
                      {unknown ? `${Object.keys(t).length ? " · " : ""}${unknown} ללא סכום` : ""}
                    </p>
                  </header>
                  <div className="space-y-2">
                    {items.map((o) => {
                      const comp = o.company as { id: string; name: string } | null;
                      const late = o.next_step_date && o.next_step_date < today;
                      return (
                        <article key={o.id} className="rounded-lg border border-line bg-white p-3 text-sm">
                          <Link href={`/customers/${comp?.id}#opps`} className="block font-semibold hover:text-brand">{comp?.name}</Link>
                          <p className="text-ink-2">{o.title}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {o.brand && <Badge tone="neutral">{o.brand}{o.model ? ` · ${o.model}` : ""}</Badge>}
                            <Badge tone="neutral">{formatMoney(o.amount, o.currency)}</Badge>
                          </div>
                          {o.next_step ? (
                            <p className={`mt-1.5 ${late ? "text-red-700" : "text-ink-3"}`}>הבא: {o.next_step}{o.next_step_date ? ` · ${formatShortDate(o.next_step_date)}` : ""}</p>
                          ) : !["won", "lost"].includes(o.stage) ? (
                            <p className="mt-1.5 text-amber-800">אין צעד הבא</p>
                          ) : null}
                          {o.loss_reason && <p className="mt-1 text-ink-3">סיבה: {o.loss_reason}</p>}
                          {o.hold_reason && <p className="mt-1 text-ink-3">מושהה: {o.hold_reason}</p>}
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-ink-3">{isAdmin ? name(o.owner_id) ?? "" : ""}</span>
                            <StageSelect id={o.id} stage={o.stage} />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
