// בדיקות אינטגרציה מול Supabase אמיתי (או מקומי). רצות רק אם הוגדרו משתני הסביבה:
// IT_SUPABASE_URL, IT_ANON_KEY, IT_SERVICE_KEY ומשתמשי הבדיקה admin/dana/yossi/intruder@elm.test
import { beforeAll, describe, expect, test } from "vitest";
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseXlsx, suggestMapping } from "@/lib/importer";
import { commitRows, prepareAll, scanDuplicates } from "@/lib/import-server";
import { loadPlanContext, persistPlan, type PlanInput } from "@/lib/plan-data";
import { buildPlan } from "@/lib/planner";
import { localDateOf, weekdayOf } from "@/lib/time";

const URL = process.env.IT_SUPABASE_URL;
const ANON = process.env.IT_ANON_KEY!;
const PASS = "Test-Password-123";
const run = URL && fs.existsSync("tests/fixture-customers.xlsx") ? describe : describe.skip;

async function login(email: string): Promise<SupabaseClient> {
  const c = createClient(URL!, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASS });
  if (error) throw error;
  return c;
}

run("permissions, import and planning against a live database", () => {
  let admin: SupabaseClient, dana: SupabaseClient, yossi: SupabaseClient, intruder: SupabaseClient, anon: SupabaseClient;
  let ids: Record<string, string> = {};
  let rows: Awaited<ReturnType<typeof parseXlsx>>;

  beforeAll(async () => {
    anon = createClient(URL!, ANON, { auth: { persistSession: false } });
    [admin, dana, yossi, intruder] = await Promise.all(["admin", "dana", "yossi", "intruder"].map((u) => login(`${u}@elm.test`)));
    const { data } = await admin.from("profiles").select("id,email");
    ids = Object.fromEntries((data ?? []).map((p) => [p.email.split("@")[0], p.id]));
    const buf = fs.readFileSync("tests/fixture-customers.xlsx");
    rows = await parseXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  });

  test("public signup is disabled", async () => {
    const { error } = await anon.auth.signUp({ email: "stranger@elm.test", password: PASS });
    expect(error).toBeTruthy();
  });

  test("import: creates all companies once, keeps raw data and phones as text", async () => {
    const { data: batch } = await admin.from("import_batches").insert({ filename: "test.xlsx", headers: rows.headers, rows: [], mapping: {} }).select("id").single();
    const prepared = prepareAll(rows.rows, suggestMapping(rows.headers));
    const stats = await commitRows(admin, batch!.id, prepared, null);
    expect(stats.created).toBe(prepared.filter((p) => !p.skip).length);
    expect(stats.duplicates).toBeGreaterThan(0);
    const { data: c } = await admin.from("companies").select("phone_main,raw,status,verification_status").eq("name", 'א. אברהם בע"מ').single();
    expect(c!.phone_main).toBe("04-9893253");
    expect(c!.raw!["כתובת"]).toBe("ת.ד.169,א.ת. יקנעם,20692");
    expect(c!.status).toBe("prospect");
    expect(c!.verification_status).toBe("unverified");
    const { count } = await admin.from("data_issues").select("id", { count: "exact", head: true }).eq("kind", "po_box");
    expect(count).toBeGreaterThan(100);
  });

  test("re-import does not create duplicates; changed values go to review, not overwritten", async () => {
    const { count: before } = await admin.from("companies").select("id", { count: "exact", head: true });
    const changed = rows.rows.map((r, i) => (i === 0 ? { ...r, "טלפון": "04-0000000" } : i === 1 ? { ...r, "דואר אלקטרוני": "new@example.com" } : r));
    const { data: batch } = await admin.from("import_batches").insert({ filename: "again.xlsx", headers: rows.headers, rows: [], mapping: {} }).select("id").single();
    const stats = await commitRows(admin, batch!.id, prepareAll(changed, suggestMapping(rows.headers)), null);
    const { count: after } = await admin.from("companies").select("id", { count: "exact", head: true });
    // השורה הראשונה עם טלפון חדש מקבלת מפתח חדש (שם+טלפון) → רשומה אחת חדשה בלבד, שתזוהה ככפילות אפשרית
    expect(after! - before!).toBe(1);
    expect(stats.matched).toBe(rows.rows.length - 2 - stats.skipped);
    expect(stats.matchedChanged).toBe(1);
    const { data: second } = await admin.from("companies").select("id,email_main").eq("name", rows.rows[1]["שם חברה"]!).single();
    expect(second!.email_main).not.toBe("new@example.com"); // לא נדרס
    const { data: conflict } = await admin.from("data_issues").select("detail").eq("company_id", second!.id).eq("kind", "conflict");
    expect(conflict![0].detail).toContain("new@example.com");
    const { data: orig } = await admin.from("companies").select("phone_main").eq("name", 'א. אברהם בע"מ').eq("phone_main", "04-9893253");
    expect(orig!.length).toBe(1);
    const { data: dup } = await admin.from("companies").select("id").eq("phone_main", "04-0000000").single();
    const { data: cand } = await admin.from("duplicate_candidates").select("id,reasons").or(`company_a.eq.${dup!.id},company_b.eq.${dup!.id}`);
    expect(cand!.length).toBeGreaterThan(0);
  });

  test("admin assigns companies; sales see only their own", async () => {
    const { data: all } = await admin.from("companies").select("id").is("merged_into", null).order("name").limit(1000);
    const half = Math.floor(all!.length / 2);
    await admin.from("companies").update({ owner_id: ids.dana }).in("id", all!.slice(0, half).map((c) => c.id));
    await admin.from("companies").update({ owner_id: ids.yossi }).in("id", all!.slice(half, half + 50).map((c) => c.id));
    const { count: d } = await dana.from("companies").select("id", { count: "exact", head: true });
    const { count: y } = await yossi.from("companies").select("id", { count: "exact", head: true });
    expect(d).toBe(half);
    expect(y).toBe(50);
    const { data: yc } = await yossi.from("companies").select("id").limit(1);
    const { data: seen } = await dana.from("companies").select("id").eq("id", yc![0].id);
    expect(seen!.length).toBe(0);
    const { data: sites } = await dana.from("company_sites").select("company_id").eq("company_id", yc![0].id);
    expect(sites!.length).toBe(0);
  });

  test("sales cannot modify someone else's record, reassign, or escalate role", async () => {
    const { data: yc } = await yossi.from("companies").select("id").limit(1);
    const { data: upd } = await dana.from("companies").update({ name: "hacked" }).eq("id", yc![0].id).select("id");
    expect(upd!.length).toBe(0);
    const { data: dc } = await dana.from("companies").select("id").limit(1);
    const { error: e1 } = await dana.from("companies").update({ owner_id: ids.yossi }).eq("id", dc![0].id);
    expect(e1).toBeTruthy();
    const { error: e2 } = await dana.from("profiles").update({ role: "admin" }).eq("id", ids.dana);
    expect(e2).toBeTruthy();
    const { error: e3 } = await dana.from("activities").insert({ type: "call", status: "scheduled", owner_id: ids.yossi, company_id: dc![0].id });
    expect(e3).toBeTruthy();
    const { data: aud } = await dana.from("audit_log").select("id").limit(1);
    expect(aud!.length).toBe(0);
    const { data: imp } = await dana.from("import_batches").select("id").limit(1);
    expect(imp!.length).toBe(0);
    const { error: e4 } = await dana.rpc("merge_companies", { keep_id: dc![0].id, drop_id: yc![0].id, candidate_id: dc![0].id, as_sites: false });
    expect(e4).toBeTruthy();
  });

  test("uninvited and anonymous users read nothing", async () => {
    const { data: a, error } = await anon.from("companies").select("id").limit(1);
    expect(error || (a ?? []).length === 0).toBeTruthy();
    for (const t of ["companies", "contacts", "activities", "opportunities", "company_sites", "data_issues"]) {
      const { data } = await intruder.from(t).select("id").limit(1);
      expect(data ?? []).toEqual([]);
    }
    const { error: ie } = await intruder.from("companies").insert({ name: "x", owner_id: ids.intruder });
    expect(ie).toBeTruthy();
  });

  test("audit trail records who changed what", async () => {
    const { data: dc } = await dana.from("companies").select("id").limit(1);
    await dana.from("companies").update({ notes: "בדיקת תיעוד" }).eq("id", dc![0].id);
    const { data: c } = await admin.from("companies").select("updated_by,created_by").eq("id", dc![0].id).single();
    expect(c!.updated_by).toBe(ids.dana);
    const { data: log } = await admin.from("audit_log").select("changed_by,action").eq("record_id", dc![0].id).order("changed_at", { ascending: false }).limit(1);
    expect(log![0].changed_by).toBe(ids.dana);
  });

  test("manual merge keeps the dropped record (marked) and moves its data", async () => {
    await scanDuplicates(admin);
    const { data: cand } = await admin.from("duplicate_candidates").select("*").eq("status", "open").limit(1).single();
    const { error } = await admin.rpc("merge_companies", { keep_id: cand.company_a, drop_id: cand.company_b, candidate_id: cand.id, as_sites: true });
    expect(error).toBeNull();
    const { data: dropped } = await admin.from("companies").select("merged_into,status").eq("id", cand.company_b).single();
    expect(dropped!.merged_into).toBe(cand.company_a);
    expect(dropped!.status).toBe("irrelevant");
    const { data: sites } = await admin.from("company_sites").select("id").eq("company_id", cand.company_a);
    expect(sites!.length).toBeGreaterThanOrEqual(2);
  });

  const input = (): PlanInput => ({ ownerId: ids.dana, periodStart: "2026-11-01", periodEnd: "2026-11-30", homeBase: "קריית ביאליק", fieldDaysPerFullWeek: 3, callsPerDay: 3, minVisits: 2, maxVisits: 3, replacePrevious: false });

  test("weekly plan follows rules on real data; preview saves nothing", async () => {
    const { count: before } = await dana.from("activities").select("id", { count: "exact", head: true });
    const ctx = await loadPlanContext(dana, input());
    const plan = buildPlan(ctx.settings, ctx.candidates, ctx.existing, ctx.blockedDays, ctx.recurring);
    const { count: after } = await dana.from("activities").select("id", { count: "exact", head: true });
    expect(after).toBe(before);
    const visits = plan.proposals.filter((p) => p.type === "visit");
    const calls = plan.proposals.filter((p) => p.type === "call");
    expect(visits.length).toBeGreaterThan(10);
    for (const v of visits) expect(weekdayOf(v.date)).toBeLessThanOrEqual(4);
    const byDay = new Map<string, Set<string>>();
    for (const c of calls) byDay.set(c.date, (byDay.get(c.date) ?? new Set()).add(c.companyId));
    for (const [d, set] of byDay) {
      expect(set.size).toBeGreaterThanOrEqual(3);
      for (const v of visits.filter((v) => v.date === d)) expect(set.has(v.companyId)).toBe(false);
    }
    const lastWeek = plan.weeks.find((w) => w.weekStart === "2026-11-29")!;
    expect(lastWeek.isPartial).toBe(true);
    expect(lastWeek.explanation).toMatch(/שבוע חלקי/);
  });

  test("saving a plan persists; regenerating never overwrites scheduled visits", async () => {
    const r = await persistPlan(dana, input(), "all");
    if ("error" in r) throw new Error(r.error);
    expect(r.visits).toBeGreaterThan(0);
    // הלקוח אישר ביקור אחד
    const { data: v } = await dana.from("activities").select("id,starts_at,company_id").eq("plan_id", r.planId).eq("type", "visit").order("starts_at").limit(1).single();
    await dana.from("activities").update({ status: "scheduled", customer_confirmed: true }).eq("id", v!.id);
    // שמירה נוספת עם החלפת הצעות קודמות
    const r2 = await persistPlan(dana, { ...input(), replacePrevious: true }, "all");
    if ("error" in r2) throw new Error(r2.error);
    const { data: still } = await dana.from("activities").select("id,status,starts_at").eq("id", v!.id).single();
    expect(still!.status).toBe("scheduled");
    expect(still!.starts_at).toBe(v!.starts_at);
    // אין שני ביקורים לאותה חברה באותו יום
    const { data: allVisits } = await dana.from("activities").select("company_id,starts_at").eq("type", "visit").neq("status", "cancelled");
    const keys = allVisits!.map((a) => `${a.company_id}|${localDateOf(a.starts_at)}`);
    expect(new Set(keys).size).toBe(keys.length);
    // נתונים נשמרים גם בכניסה מחדש
    const fresh = await login("dana@elm.test");
    const { data: again } = await fresh.from("activities").select("id").eq("id", v!.id);
    expect(again!.length).toBe(1);
  });

  test("completing a call with 'no answer' is not a held call; follow-up task is created", async () => {
    const { data: call } = await dana.from("activities").select("id,company_id").eq("type", "call").eq("status", "scheduled").limit(1).single();
    await dana.from("activities").update({ status: "no_answer", completed_at: new Date().toISOString() }).eq("id", call!.id);
    const { count } = await dana.from("activities").select("id", { count: "exact", head: true }).eq("type", "call").eq("status", "done");
    expect(count).toBe(0);
    const { error } = await dana.from("activities").insert({ type: "task", status: "scheduled", owner_id: ids.dana, company_id: call!.company_id, title: "המשך", due_date: "2026-11-09" });
    expect(error).toBeNull();
  });
});
