import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/import-server";
import { COMPANY_STATUS, CLASSIFICATION, CONTACT_STATUS, VERIFICATION } from "@/lib/labels";
import { regionName } from "@/lib/geo";

export const dynamic = "force-dynamic";

// ייצוא CSV של הלקוחות שהמשתמש רשאי לראות (RLS חל — איש מכירות מקבל רק את שלו)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("active").eq("id", user.id).maybeSingle();
  if (!profile?.active) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const rows = await fetchAll<Record<string, unknown>>((f, t) =>
    supabase.from("companies").select("name,status,classification,contact_status,verification_status,phone_main,email_main,specialization,company_sites(address_raw,city,region_code,is_primary),contacts(name,mobile,phone)").is("merged_into", null).order("name").range(f, t),
  );
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["שם", "מצב", "סיווג", "מצב קשר", "אימות", "טלפון", "אימייל", "התמחות", "כתובת", "יישוב", "אזור", "איש קשר", "טלפון איש קשר"];
  const lines = rows.map((r) => {
    const sites = (r.company_sites as { address_raw: string; city: string; region_code: string; is_primary: boolean }[]) ?? [];
    const s = sites.find((x) => x.is_primary) ?? sites[0];
    const c = ((r.contacts as { name: string; mobile: string; phone: string }[]) ?? [])[0];
    return [r.name, COMPANY_STATUS[r.status as string], CLASSIFICATION[r.classification as string], CONTACT_STATUS[r.contact_status as string], VERIFICATION[r.verification_status as string], r.phone_main, r.email_main, r.specialization, s?.address_raw, s?.city, regionName(s?.region_code), c?.name, c?.mobile ?? c?.phone].map(esc).join(",");
  });
  const body = "﻿" + [header.map(esc).join(","), ...lines].join("\r\n");
  return new NextResponse(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="customers.csv"`, "Cache-Control": "no-store" },
  });
}
