import { describe, expect, test } from "vitest";
import fs from "node:fs";
import { parseAddress } from "@/lib/geo";
import { classify, cleanPhone, phoneDigits, isPlausibleIsraeliPhone, importKey } from "@/lib/normalize";
import { parseXlsx, parseCsv, suggestMapping, prepareRow, assignUniqueKeys } from "@/lib/importer";
import { findDuplicates } from "@/lib/dedupe";
import { buildPlan, validatePlan, DEFAULT_SETTINGS, type PlanCandidate, type PlanSettings } from "@/lib/planner";
import { REGIONS, CITIES } from "@/lib/geo";
import { toUtc, localDateOf, localTimeOf, weekdayOf } from "@/lib/time";

describe("phones are strings and keep leading zeros", () => {
  test("numeric phone from Excel gets its leading 0 back", () => {
    expect(cleanPhone(48768382)).toBe("048768382");
    expect(cleanPhone("04-9525333/4")).toBe("04-9525333/4");
    expect(phoneDigits("04-9525333/4")).toBe("049525333");
    expect(isPlausibleIsraeliPhone("052-2441510")).toBe(true);
    expect(isPlausibleIsraeliPhone("2")).toBe(false);
  });
});

describe("address parsing", () => {
  test("PO box is not navigable", () => {
    const a = parseAddress("ת.ד.169,א.ת. יקנעם,20692");
    expect(a.isPoBox).toBe(true);
    expect(a.navigable).toBe(false);
    expect(a.city).toBe("יקנעם");
    expect(a.region).toBe("valleys");
    expect(a.zip).toBe("20692");
  });
  test("street address with abbreviation", () => {
    const a = parseAddress('בר כוכבא 75,פ"ת,79220');
    expect(a.city).toBe("פתח תקווה");
    expect(a.navigable).toBe(true);
    expect(a.street).toBe("בר כוכבא 75");
  });
  test("conflicting cities are flagged, not guessed silently", () => {
    const a = parseAddress("ת.ד. 489 א.ת. יבנה,81224 קרית גת");
    expect(a.regionCertain).toBe(false);
  });
  test("PO box number is not mistaken for zip", () => {
    expect(parseAddress("ת.ד. 13310,א.ת. צפוני יבנה").zip).toBeNull();
  });
});

describe("conservative classification", () => {
  test("suppliers, plastics, services are never auto-machining", () => {
    expect(classify("אספקה טכנית לעשיה,ציוד לעיבוד נתונים", "גלובוס ציוד טכני").classification).toBe("unclassified");
    expect(classify('ייצור שקיות "פסגור",פתרונות אריזה', "גרופית מפעל הפלסטיק").suggested).toBe("plastic");
    expect(classify("ציוד וכלים פנאומטיים,כלי עבודה", "דינמיקס").classification).toBe("unclassified");
  });
  test("clear machining shop", () => {
    const c = classify("עיבוד שבבי מדויק,חריטה,כרסום CNC", "x");
    expect(c.classification).toBe("machining");
    expect(c.needsReview).toBe(false);
  });
});

describe.skipIf(!fs.existsSync("tests/fixture-customers.xlsx"))("import of the original file (requires tests/fixture-customers.xlsx — not in git)", async () => {
  const buf = fs.readFileSync("tests/fixture-customers.xlsx");
  const { headers, rows } = await parseXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  const mapping = suggestMapping(headers);
  const prepared = assignUniqueKeys(rows.map((r, i) => prepareRow(r, mapping, i + 2)));
  test("mapping treats the 'אזור' column as zip", () => {
    expect(mapping.name).toBe("שם חברה");
    expect(mapping.zip).toBe("אזור");
    expect(mapping.phone).toBe("טלפון");
  });
  test("all rows parsed, raw kept, keys unique", () => {
    expect(rows.length).toBe(479);
    expect(new Set(prepared.map((p) => p.importKey)).size).toBe(prepared.length);
    expect(prepared[0].raw["שם חברה"]).toBe('א. אברהם בע"מ');
  });
  test("call outcomes written in the email column become notes + issues", () => {
    const p = prepared.find((x) => x.raw["דואר אלקטרוני"] === "מספר שגוי")!;
    expect(p.email).toBeNull();
    expect(p.notes).toContain("מספר שגוי");
    expect(p.issues.map((i) => i.kind)).toContain("phone_invalid");
  });
  test("phones are strings with leading zero", () => {
    expect(prepared.filter((p) => p.phone).every((p) => typeof p.phone === "string" && p.phone.startsWith("0"))).toBe(true);
  });
  test("duplicates suggested, not merged", () => {
    const d = findDuplicates(prepared.map((p, i) => ({ id: String(i).padStart(4, "0"), nameNormalized: p.nameNormalized, phones: [p.phone], emails: [p.email], addresses: [p.address.raw] })));
    expect(d.length).toBeGreaterThan(5);
  });
  test("same row → same key (re-import is idempotent)", () => {
    expect(importKey('א. אברהם בע"מ', "04-9893253")).toBe(importKey('א. אברהם בע"מ', "049893253"));
  });
});

test("csv parsing keeps phones as text", () => {
  const { rows } = parseCsv("שם חברה,טלפון\nאבג,04-1234567\n");
  expect(rows[0]["טלפון"]).toBe("04-1234567");
});

test("timezone helpers use Asia/Jerusalem", () => {
  const d = toUtc("2026-11-04", "09:00");
  expect(d.toISOString()).toBe("2026-11-04T07:00:00.000Z"); // UTC+2 in winter
  expect(localTimeOf(d)).toBe("09:00");
  expect(localDateOf("2026-11-04T22:30:00Z")).toBe("2026-11-05");
  expect(weekdayOf("2026-11-01")).toBe(0);
});

describe("planner", () => {
  const home = CITIES.find((c) => c.name === "קריית ביאליק")!;
  const settings: PlanSettings = { ...DEFAULT_SETTINGS, periodStart: "2026-11-01", periodEnd: "2026-11-30", today: "2026-11-01", homeBaseName: home.name, homeBaseCoords: { lat: home.lat, lng: home.lng } };
  const mk = (i: number, region: keyof typeof REGIONS, extra: Partial<PlanCandidate> = {}): PlanCandidate => ({
    companyId: `c${String(i).padStart(3, "0")}`, name: `חברה ${i}`, siteId: `s${i}`, region, regionCertain: true, navigable: true,
    coords: { lat: REGIONS[region].lat, lng: REGIONS[region].lng }, phoneOk: true, priority: "medium", status: "prospect",
    classification: "machining", contactStatus: "not_contacted", lastContactAt: null, hasOpenOpportunity: false, hasFutureVisit: false, ...extra,
  });
  const candidates = [
    ...Array.from({ length: 30 }, (_, i) => mk(i, "haifa_krayot")),
    ...Array.from({ length: 15 }, (_, i) => mk(100 + i, "west_galilee")),
    ...Array.from({ length: 15 }, (_, i) => mk(200 + i, "gush_dan")),
    ...Array.from({ length: 40 }, (_, i) => mk(300 + i, "haifa_krayot", { navigable: false })), // ת.ד. — שיחות בלבד
    mk(900, "haifa_krayot", { status: "irrelevant" }),
    mk(901, "haifa_krayot", { classification: "supplier" }),
  ];
  const existing = [{ id: "e1", type: "visit" as const, status: "scheduled", companyId: "c000", date: "2026-11-10", start: "10:00", end: "11:15", title: "חברה 0" }];
  const plan = buildPlan(settings, candidates, existing, [{ day: "2026-11-19", kind: "vacation" }], [{ weekday: 0, start: "08:00", end: "09:00", title: "ישיבת צוות" }]);
  const visits = plan.proposals.filter((p) => p.type === "visit");
  const calls = plan.proposals.filter((p) => p.type === "call");

  test("full weeks get 3 field days; partial weeks are explained", () => {
    const full = plan.weeks.find((w) => w.weekStart === "2026-11-01")!;
    expect(full.fieldDays.length).toBe(3);
    const partial = plan.weeks.find((w) => w.weekStart === "2026-11-29")!;
    expect(partial.isPartial).toBe(true);
    expect(partial.explanation).toContain("שבוע חלקי");
    const vacation = plan.weeks.find((w) => w.weekStart === "2026-11-15")!;
    expect(vacation.isPartial).toBe(true);
    expect(vacation.workingDays).not.toContain("2026-11-19");
  });
  test("visits per field day 2-3, only Sun-Thu, never on vacation, never irrelevant/supplier, never PO box", () => {
    const byDay = new Map<string, number>();
    visits.forEach((v) => byDay.set(v.date, (byDay.get(v.date) ?? 0) + 1));
    for (const [d, n] of byDay) {
      expect(weekdayOf(d)).toBeLessThanOrEqual(4);
      expect(d).not.toBe("2026-11-19");
      expect(n + existing.filter((e) => e.date === d).length).toBeLessThanOrEqual(3);
    }
    expect(visits.some((v) => ["c900", "c901"].includes(v.companyId))).toBe(false);
    expect(visits.some((v) => Number(v.companyId.slice(1)) >= 300)).toBe(false);
    expect(visits.some((v) => v.companyId === "c000")).toBe(false); // already has a scheduled visit
  });
  test("each working day ≥3 calls to distinct companies not visited that day", () => {
    const days = [...new Set(calls.map((c) => c.date))];
    for (const d of days) {
      const dayCalls = calls.filter((c) => c.date === d);
      const companies = new Set(dayCalls.map((c) => c.companyId));
      expect(companies.size).toBe(dayCalls.length);
      const visited = new Set([...visits.filter((v) => v.date === d).map((v) => v.companyId), ...existing.filter((e) => e.date === d).map((e) => e.companyId)]);
      for (const c of companies) expect(visited.has(c)).toBe(false);
      expect(companies.size).toBeGreaterThanOrEqual(3);
    }
  });
  test("every proposed visit gets a coordination call on an earlier day", () => {
    for (const v of visits) {
      const coord = calls.find((c) => c.relatedVisitKey === v.key);
      expect(coord, v.key).toBeTruthy();
      expect(coord!.date < v.date).toBe(true);
    }
  });
  test("recurring meeting slot is respected and existing activity not overwritten", () => {
    for (const p of plan.proposals.filter((p) => weekdayOf(p.date) === 0)) expect(p.start >= "09:00" || p.end <= "08:00").toBe(true);
    expect(plan.proposals.some((p) => p.date === "2026-11-10" && p.start < "11:15" && p.end > "10:00")).toBe(false);
  });
  test("shortage reported instead of inventing records", () => {
    const tiny = buildPlan(settings, [mk(1, "south")], [], [], []);
    expect(tiny.shortages.length).toBeGreaterThan(0);
    expect(tiny.proposals.filter((p) => p.type === "visit").length).toBeLessThanOrEqual(1);
  });
  test("validator catches violations", () => {
    const issues = validatePlan({ ...settings, today: "2026-11-01" }, [
      { id: "a", type: "call", status: "scheduled", companyId: "x", date: "2026-11-02", start: "09:00", end: "09:15", title: "X" },
      { id: "b", type: "visit", status: "scheduled", companyId: "x", date: "2026-11-02", start: "09:00", end: "10:00", title: "X" },
      { id: "c", type: "call", status: "scheduled", companyId: "y", date: "2026-11-07", start: "09:00", end: "09:15", title: "Y" },
    ], [], []);
    const msgs = issues.map((i) => i.message).join("\n");
    expect(msgs).toMatch(/התנגשות/);
    expect(msgs).toMatch(/שמבקרים בה באותו יום/);
    expect(msgs).toMatch(/אינו יום עבודה/);
    expect(msgs).toMatch(/שיחות לחברות שונות/);
  });
});
