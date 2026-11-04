import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assignUniqueKeys, diffRaw, prepareRow, type Mapping, type PreparedRow, type RawRow } from "./importer";
import { findDuplicates } from "./dedupe";

/** קריאת כל השורות בעמודים של 1000 (מגבלת PostgREST) */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function prepareAll(rows: RawRow[], mapping: Mapping): PreparedRow[] {
  return assignUniqueKeys(rows.map((r, i) => prepareRow(r, mapping, i + 2)));
}

export async function existingByKey(supabase: SupabaseClient) {
  const rows = await fetchAll<{ id: string; import_key: string; raw: RawRow | null }>((f, t) =>
    supabase.from("companies").select("id,import_key,raw").not("import_key", "is", null).range(f, t),
  );
  return new Map(rows.map((r) => [r.import_key, r]));
}

export type CommitStats = { created: number; matched: number; matchedChanged: number; skipped: number; issues: number; duplicates: number };

export async function commitRows(supabase: SupabaseClient, batchId: string, prepared: PreparedRow[], ownerId: string | null): Promise<CommitStats> {
  const existing = await existingByKey(supabase);
  const stats: CommitStats = { created: 0, matched: 0, matchedChanged: 0, skipped: 0, issues: 0, duplicates: 0 };
  const importRows: { batch_id: string; row_number: number; raw: RawRow; company_id: string | null; action: string }[] = [];
  const toCreate: PreparedRow[] = [];
  const conflictIssues: { company_id: string; kind: string; detail: string }[] = [];

  for (const p of prepared) {
    if (p.skip) {
      stats.skipped++;
      importRows.push({ batch_id: batchId, row_number: p.rowNumber, raw: p.raw, company_id: null, action: "skipped_empty" });
      continue;
    }
    const ex = existing.get(p.importKey);
    if (ex) {
      const changed = diffRaw(ex.raw, p.raw);
      if (changed.length) {
        stats.matchedChanged++;
        // לא דורסים — הסתירה נכנסת לבדיקה
        conflictIssues.push({
          company_id: ex.id,
          kind: "conflict",
          detail: `ייבוא חוזר: ערכים שונים בעמודות ${changed.join(", ")}. בקובץ החדש: ${changed.map((k) => `${k}="${p.raw[k] ?? ""}"`).join("; ")}`,
        });
      } else stats.matched++;
      importRows.push({ batch_id: batchId, row_number: p.rowNumber, raw: p.raw, company_id: ex.id, action: changed.length ? "matched_changed" : "matched" });
      continue;
    }
    toCreate.push(p);
  }

  for (let i = 0; i < toCreate.length; i += 200) {
    const chunk = toCreate.slice(i, i + 200);
    const { data: created, error } = await supabase
      .from("companies")
      .insert(
        chunk.map((p) => ({
          name: p.name,
          name_normalized: p.nameNormalized,
          import_key: p.importKey,
          raw: p.raw,
          phone_main: p.phone,
          fax: p.fax,
          email_main: p.email,
          website: p.website,
          specialization: p.specialization,
          classification: p.classification.classification,
          classification_suggested: p.classification.suggested,
          classification_confirmed: false,
          status: "prospect",
          priority: p.priorHint === "not_interested" ? "low" : "medium",
          contact_status: "not_contacted",
          verification_status: "unverified",
          source_type: "original_list",
          source_note: p.otherLists ? `מקור: רשימת הלקוחות המקורית. ${p.otherLists}` : "מקור: רשימת הלקוחות המקורית",
          notes: p.notes,
          owner_id: ownerId,
        })),
      )
      .select("id,import_key");
    if (error) throw error;
    const idByKey = new Map(created.map((c) => [c.import_key, c.id]));
    const sites = [], contacts = [], issues = [];
    for (const p of chunk) {
      const id = idByKey.get(p.importKey)!;
      importRows.push({ batch_id: batchId, row_number: p.rowNumber, raw: p.raw, company_id: id, action: "created" });
      if (p.address.raw) {
        sites.push({
          company_id: id, label: "ראשי", address_raw: p.address.raw, street: p.address.street, city: p.address.city, zip: p.address.zip,
          is_po_box: p.address.isPoBox, navigable: p.address.navigable, region_code: p.address.region, region_certain: p.address.regionCertain, is_primary: true,
        });
      }
      if (p.contactName || p.contactPhone) contacts.push({ company_id: id, name: p.contactName ?? "", mobile: p.contactPhone, is_primary: true, notes: "מהקובץ המקורי" });
      for (const iss of p.issues) issues.push({ company_id: id, kind: iss.kind, detail: iss.detail });
    }
    if (sites.length) { const { error: e } = await supabase.from("company_sites").insert(sites); if (e) throw e; }
    if (contacts.length) { const { error: e } = await supabase.from("contacts").insert(contacts); if (e) throw e; }
    if (issues.length) { const { error: e } = await supabase.from("data_issues").insert(issues); if (e) throw e; }
    stats.created += chunk.length;
    stats.issues += issues.length;
  }

  for (const iss of conflictIssues) {
    const { error } = await supabase.from("data_issues").insert(iss);
    if (error && error.code !== "23505") throw error;
    if (!error) stats.issues++;
  }
  for (let i = 0; i < importRows.length; i += 500) {
    const { error } = await supabase.from("import_rows").insert(importRows.slice(i, i + 500));
    if (error) throw error;
  }
  stats.duplicates = await scanDuplicates(supabase);
  return stats;
}

/** סריקת כפילויות על כל המאגר. מוסיפה רק זוגות חדשים, לבדיקת מנהל. */
export async function scanDuplicates(supabase: SupabaseClient): Promise<number> {
  const companies = await fetchAll<{
    id: string; name_normalized: string; phone_main: string | null; email_main: string | null;
    company_sites: { address_raw: string | null }[]; contacts: { phone: string | null; mobile: string | null; email: string | null }[];
  }>((f, t) => supabase.from("companies").select("id,name_normalized,phone_main,email_main,company_sites(address_raw),contacts(phone,mobile,email)").is("merged_into", null).order("id").range(f, t));
  const pairs = findDuplicates(
    companies.map((c) => ({
      id: c.id,
      nameNormalized: c.name_normalized,
      phones: [c.phone_main, ...c.contacts.flatMap((x) => [x.phone, x.mobile])],
      emails: [c.email_main, ...c.contacts.map((x) => x.email)],
      addresses: c.company_sites.map((s) => s.address_raw),
    })),
  );
  const known = await fetchAll<{ company_a: string; company_b: string }>((f, t) => supabase.from("duplicate_candidates").select("company_a,company_b").range(f, t));
  const seen = new Set(known.map((k) => `${k.company_a}|${k.company_b}`));
  const fresh = pairs.filter((p) => !seen.has(`${p.a}|${p.b}`)).map((p) => ({ company_a: p.a, company_b: p.b, reasons: p.reasons, score: p.score }));
  for (let i = 0; i < fresh.length; i += 500) {
    const { error } = await supabase.from("duplicate_candidates").insert(fresh.slice(i, i + 500));
    if (error) throw error;
  }
  return fresh.length;
}
