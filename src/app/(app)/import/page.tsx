import { requireAdmin } from "@/lib/auth";
import { listProfiles } from "@/lib/queries";
import { TARGET_FIELDS, type Mapping, type RawRow } from "@/lib/importer";
import { existingByKey, prepareAll } from "@/lib/import-server";
import { CLASSIFICATION, ISSUE_KIND } from "@/lib/labels";
import { regionName } from "@/lib/geo";
import { formatDateTime } from "@/lib/time";
import { Badge, Card, CardHeader, Notice, PageHeader, Select } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/client";
import { UploadForm } from "@/components/import-forms";
import { cancelImport, commitImport, setMapping } from "@/app/actions/import";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const profiles = await listProfiles(supabase);

  if (sp.batch) {
    const { data: batch } = await supabase.from("import_batches").select("*").eq("id", sp.batch).maybeSingle();
    if (batch && batch.status === "preview") {
      const headers = batch.headers as string[];
      const mapping = batch.mapping as Mapping;
      const rows = batch.rows as RawRow[];
      const prepared = mapping.name ? prepareAll(rows, mapping) : [];
      const existing = await existingByKey(supabase);
      const isNew = prepared.filter((p) => !p.skip && !existing.has(p.importKey)).length;
      const isExisting = prepared.filter((p) => !p.skip && existing.has(p.importKey)).length;
      const skipped = prepared.filter((p) => p.skip).length;
      const count = (f: (p: (typeof prepared)[number]) => string[]) => {
        const m: Record<string, number> = {};
        prepared.filter((p) => !p.skip).forEach((p) => f(p).forEach((k) => (m[k] = (m[k] ?? 0) + 1)));
        return Object.entries(m).sort((a, b) => b[1] - a[1]);
      };
      const issueCounts = count((p) => p.issues.map((i) => i.kind));
      const clsCounts = count((p) => [p.classification.classification === "unclassified" && p.classification.suggested !== "unclassified" ? `unclassified:${p.classification.suggested}` : p.classification.classification]);
      const regionCounts = count((p) => [p.address.region ? (p.address.regionCertain ? p.address.region : `${p.address.region}?`) : "none"]);
      const navigable = prepared.filter((p) => !p.skip && p.address.navigable).length;

      return (
        <>
          <PageHeader title="ייבוא — תצוגה מקדימה" sub={`${batch.filename} · ${rows.length} שורות`} />
          <div className="space-y-5">
            <Card>
              <CardHeader title="1. מיפוי עמודות" sub="המערכת הציעה מיפוי. בדקו ותקנו לפי הצורך. הנתונים המקוריים נשמרים תמיד לצד השדות המנוקים." />
              <ActionForm action={setMapping} closeOnSuccess={false} className="p-4">
                <input type="hidden" name="batch_id" value={batch.id} />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(Object.keys(TARGET_FIELDS) as (keyof typeof TARGET_FIELDS)[]).map((k) => (
                    <label key={k} className="block text-sm">
                      <span className="mb-1 block font-medium text-ink-2">{TARGET_FIELDS[k]}</span>
                      <Select name={`map_${k}`} defaultValue={mapping[k] ?? ""}>
                        <option value="">— לא ממופה —</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </Select>
                    </label>
                  ))}
                </div>
                <p className="mt-3 text-xs text-ink-3">עמודת &quot;אזור&quot; בקובץ המקורי מכילה מיקודים, לכן היא ממופה כמיקוד. האזור נגזר מהיישוב שבכתובת.</p>
                <div className="mt-3"><SubmitButton variant="secondary">עדכון מיפוי ותצוגה מקדימה</SubmitButton></div>
              </ActionForm>
            </Card>

            {prepared.length > 0 && (
              <Card>
                <CardHeader title="2. מה ייקרה בייבוא" />
                <div className="grid gap-4 p-4 sm:grid-cols-3">
                  <Stat n={isNew} label="לקוחות חדשים ייווצרו" />
                  <Stat n={isExisting} label="כבר קיימים (ייבוא חוזר) — לא ייווצרו שוב; הבדלים ייכנסו לבדיקה" />
                  <Stat n={skipped} label="שורות ריקות שידולגו" />
                </div>
                <div className="grid gap-4 border-t border-line p-4 text-sm md:grid-cols-3">
                  <div>
                    <h3 className="mb-1 font-semibold">תור השלמות</h3>
                    <ul className="space-y-0.5 text-ink-2">{issueCounts.map(([k, v]) => <li key={k}>{ISSUE_KIND[k] ?? k}: {v}</li>)}</ul>
                  </div>
                  <div>
                    <h3 className="mb-1 font-semibold">סיווג אוטומטי (שמרני)</h3>
                    <ul className="space-y-0.5 text-ink-2">{clsCounts.map(([k, v]) => <li key={k}>{k.startsWith("unclassified:") ? `לא מסווג — הצעה: ${CLASSIFICATION[k.split(":")[1]]}` : CLASSIFICATION[k]}: {v}</li>)}</ul>
                    <p className="mt-1 text-xs text-ink-3">ספקים, שירותים ופלסטיק לעולם אינם מסווגים אוטומטית כעיבוד שבבי.</p>
                  </div>
                  <div>
                    <h3 className="mb-1 font-semibold">אזורים</h3>
                    <ul className="space-y-0.5 text-ink-2">{regionCounts.map(([k, v]) => <li key={k}>{k === "none" ? "לא זוהה" : regionName(k.replace("?", "")) + (k.endsWith("?") ? " (לא ודאי)" : "")}: {v}</li>)}</ul>
                    <p className="mt-1 text-xs text-ink-3">{navigable} עם כתובת ניווט · השאר ת.ד. או כתובת חלקית</p>
                  </div>
                </div>
                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-canvas text-ink-3"><tr><th className="px-3 py-2 text-start font-normal">שורה</th><th className="px-3 py-2 text-start font-normal">שם</th><th className="px-3 py-2 text-start font-normal">טלפון</th><th className="px-3 py-2 text-start font-normal">יישוב / אזור</th><th className="px-3 py-2 text-start font-normal">סיווג</th><th className="px-3 py-2 text-start font-normal">הערות</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {prepared.slice(0, 25).map((p) => (
                        <tr key={p.rowNumber} className={p.skip ? "opacity-50" : ""}>
                          <td className="px-3 py-2 tabular text-ink-3">{p.rowNumber}</td>
                          <td className="px-3 py-2">{p.name} {existing.has(p.importKey) && <Badge tone="blue">קיים</Badge>}</td>
                          <td className="px-3 py-2"><span className="ltr tabular">{p.phone ?? "—"}</span></td>
                          <td className="px-3 py-2">{p.address.city ?? "—"} · {regionName(p.address.region)}{p.address.region && !p.address.regionCertain ? " (?)" : ""}{p.address.isPoBox && !p.address.navigable ? " · ת.ד." : ""}</td>
                          <td className="px-3 py-2">{CLASSIFICATION[p.classification.classification]}</td>
                          <td className="px-3 py-2 text-ink-3">{p.issues.filter((i) => i.kind !== "missing_contact").map((i) => ISSUE_KIND[i.kind]).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {prepared.length > 25 && <p className="px-3 py-2 text-xs text-ink-3">מוצגות 25 השורות הראשונות.</p>}
                </div>
              </Card>
            )}

            {prepared.length > 0 && (
              <Card>
                <CardHeader title="3. אישור ייבוא" />
                <div className="p-4">
                  <ActionForm action={commitImport} closeOnSuccess={false} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="batch_id" value={batch.id} />
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-ink-2">שיוך הלקוחות החדשים לאיש מכירות</span>
                      <Select name="owner_id" defaultValue="">
                        <option value="">ללא שיוך (המנהל ישייך אחר כך)</option>
                        {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                      </Select>
                    </label>
                    <SubmitButton pendingText="מייבא…">ייבוא {isNew} לקוחות</SubmitButton>
                  </ActionForm>
                  <ActionForm action={cancelImport} closeOnSuccess={false} className="mt-3"><input type="hidden" name="batch_id" value={batch.id} /><button className="text-sm text-ink-3 hover:underline">ביטול</button></ActionForm>
                  <p className="mt-3 text-xs text-ink-3">כל הלקוחות ייובאו כ&quot;פוטנציאלי · לא מאומת&quot;. לא מתבצע איחוד כפילויות אוטומטי — זוגות חשודים יופיעו במסך איכות הנתונים.</p>
                </div>
              </Card>
            )}
          </div>
        </>
      );
    }
  }

  const { data: batches } = await supabase.from("import_batches").select("id,filename,status,stats,created_at,committed_at").order("created_at", { ascending: false }).limit(20);
  return (
    <>
      <PageHeader title="ייבוא לקוחות" sub="XLSX או CSV. העלאה פותחת תצוגה מקדימה עם מיפוי עמודות — שום דבר לא נשמר עד האישור." />
      <Card className="mb-5"><div className="p-4"><UploadForm /></div></Card>
      <Notice tone="blue">ייבוא חוזר של אותו קובץ מזהה רשומות קיימות לפי שם וטלפון, ולא יוצר אותן שוב. ערכים ששונו בקובץ לא דורסים את המערכת — הם נכנסים לתור הבדיקה.</Notice>
      <Card className="mt-5">
        <CardHeader title="היסטוריית ייבוא" />
        <ul className="divide-y divide-line text-sm">
          {(batches ?? []).length === 0 && <li className="px-4 py-3 text-ink-3">עדיין לא בוצע ייבוא.</li>}
          {(batches ?? []).map((b) => (
            <li key={b.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{b.filename}</span>
                <Badge tone={b.status === "committed" ? "green" : b.status === "cancelled" ? "neutral" : "amber"}>{{ committed: "יובא", cancelled: "בוטל", preview: "ממתין לאישור" }[b.status as "preview"]}</Badge>
                <span className="text-ink-3">{formatDateTime(b.committed_at ?? b.created_at)}</span>
                {b.status === "preview" && <a className="text-brand" href={`/import?batch=${b.id}`}>המשך</a>}
              </div>
              {b.status === "committed" && b.stats && (
                <p className="text-ink-3">נוצרו {b.stats.created} · קיימים {b.stats.matched} · עם הבדלים {b.stats.matchedChanged} · דולגו {b.stats.skipped} · כפילויות אפשריות {b.stats.duplicates}</p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="tabular text-2xl font-bold">{n}</div>
      <div className="text-sm text-ink-3">{label}</div>
    </div>
  );
}
