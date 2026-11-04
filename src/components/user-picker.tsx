"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";

/** בחירת איש מכירות (למנהל). מעדכן את ?user= בכתובת */
export function UserPicker({ profiles, value, allowAll }: { profiles: Profile[]; value: string; allowAll?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <select
      aria-label="איש מכירות"
      className="h-10 rounded-lg border border-line bg-white px-3 text-[15px]"
      value={value}
      onChange={(e) => {
        const p = new URLSearchParams(sp.toString());
        if (e.target.value) p.set("user", e.target.value);
        else p.delete("user");
        router.push(`${pathname}?${p.toString()}`);
      }}
    >
      {allowAll && <option value="">כל אנשי המכירות</option>}
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>{p.full_name || p.email}{p.role === "admin" ? " (מנהל)" : ""}</option>
      ))}
    </select>
  );
}

/** טופס סינון GET שמתעדכן מיד בשינוי */
export function AutoSubmitSelect(props: React.ComponentProps<"select">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
