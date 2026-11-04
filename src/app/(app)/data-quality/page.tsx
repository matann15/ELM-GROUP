import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { fetchAll } from "@/lib/import-server";
import { ISSUE_KIND } from "@/lib/labels";
import { Badge, Card, CardHeader, Empty, PageHeader } from "@/components/ui";
import { ResolveIssueForm } from "@/components/company/forms";
import { DuplicateActions } from "@/components/dup-actions";
import { RescanButton } from "@/components/import-forms";

type Comp = { id: string; name: string; phone_main: string | null; email_main: string | null; company_sites: { address_raw: string | null }[]; contacts: { name: string }[] };

export default async function DataQualityPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser();
  const isAdmin = profile.role === "admin";

  const all = await fetchAll<{ kind: string }>((f, t) => supabase.from("data_issues").select("kind").eq("status", "open").range(f, t));
  const counts = new Map<string, number>();
  for (const i of all) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  const kinds = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const kind = sp.kind ?? kinds.find(([k]) => k !== "missing_contact")?.[0] ?? kinds[0]?.[0];

  const { data: list } = kind
    ? await supabase.from("data_issues").select("id,kind,detail,created_at,company:companies(id,name,phone_main)").eq("status", "open").eq("kind", kind).order("created_at").limit(200)
    : { data: [] };

  let dups: { id: string; reasons: string[]; score: number; a: Comp; b: Comp }[] = [];
  if (isAdmin) {
    const sel = "id,name,phone_main,email_main,company_sites(address_raw),contacts(name)";
    const { data } = await supabase.from("duplicate_candidates").select(`id,reasons,score,a:companies!duplicate_candidates_company_a_fkey(${sel}),b:companies!duplicate_candidates_company_b_fkey(${sel})`).eq("status", "open").order("score", { ascending: false }).limit(50);
    dups = (data ?? []) as unknown as typeof dups;
  }

  return (
    <>
      <PageHeader title="איכות נתונים" sub="תור השלמות ובירורים. לא מתבצעים תיקונים, מחיקות או איחודים אוטומטיים." />
      {isAdmin && (
        <Card className="mb-5">
          <CardHeader title={`כפילויות אפשריות (${dups.length}${dups.length === 50 ? "+" : ""})`} sub="לבדיקה ידנית. שני אתרים של אותה חברה לא ייספרו כשני לקוחות אחרי הצירוף." action={<RescanButton />} />
          {dups.length === 0 ? <p className="px-4 py-4 text-sm text-ink-3">אין זוגות פתוחים לבדיקה.</p> : (
            <ul className="divide-y divide-line">
              {dups.map((d) => (
                <li key={d.id} className="px-4 py-3">
                  <div className="mb-2 flex flex-wrap gap-1">{d.reasons.map((r) => <Badge key={r} tone="amber">{r}</Badge>)}</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[d.a, d.b].map((c) => (
                      <div key={c.id} className="rounded-lg border border-line p-2.5 text-sm">
                        <Link href={`/customers/${c.id}`} className="font-medium hover:text-brand">{c.name}</Link>
                        <p className="text-ink-3"><span className="ltr tabular">{c.phone_main ?? "—"}</span> · <span className="ltr">{c.email_main ?? "—"}</span></p>
                        <p className="text-ink-3">{c.company_sites.map((s) => s.address_raw).join(" | ") || "—"}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2.5"><DuplicateActions id={d.id} nameA={d.a.name} nameB={d.b.name} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {kinds.length === 0 ? <Empty title="אין פריטים פתוחים">כל הנתונים הנגישים לכם הושלמו.</Empty> : (
        <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
          <nav className="flex flex-wrap gap-1.5 lg:flex-col">
            {kinds.map(([k, n]) => (
              <Link key={k} href={`/data-quality?kind=${k}`} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${k === kind ? "bg-brand-soft font-semibold text-brand-dark" : "bg-white text-ink-2 hover:bg-black/5"}`}>
                {ISSUE_KIND[k] ?? k}<span className="tabular text-ink-3">{n}</span>
              </Link>
            ))}
          </nav>
          <Card>
            <CardHeader title={ISSUE_KIND[kind!] ?? kind} sub={(list ?? []).length === 200 ? "מוצגים 200 הראשונים" : undefined} />
            <ul className="divide-y divide-line">
              {(list ?? []).map((i) => {
                const c = i.company as unknown as { id: string; name: string; phone_main: string | null } | null;
                return (
                  <li key={i.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <Link href={`/customers/${c?.id}`} className="font-medium hover:text-brand">{c?.name}</Link>
                      {i.detail && <p className="text-ink-3">{i.detail}</p>}
                    </div>
                    <ResolveIssueForm id={i.id} />
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
