"use client";
import { ActionForm } from "@/components/client";
import { btnClass } from "@/components/ui";
import { resolveDuplicate } from "@/app/actions/import";

export function DuplicateActions({ id, nameA, nameB }: { id: string; nameA: string; nameB: string }) {
  const btn = (decision: string, label: string, confirmText?: string, variant: "secondary" | "ghost" = "secondary") => (
    <ActionForm action={resolveDuplicate} closeOnSuccess={false}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <button type="submit" className={btnClass(variant, "sm")} onClick={(e) => { if (confirmText && !confirm(confirmText)) e.preventDefault(); }}>{label}</button>
    </ActionForm>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {btn("sites_into_a", `אתרים של "${nameA}"`, `לצרף את "${nameB}" כאתר נוסף של "${nameA}"? אנשי הקשר, ההיסטוריה וההזדמנויות יועברו. הרשומה השנייה תסומן כמאוחדת ולא תימחק.`)}
      {btn("merge_into_a", `אותה חברה — לשמור את "${nameA}"`, `לאחד את "${nameB}" לתוך "${nameA}"? הרשומה השנייה תסומן כמאוחדת ולא תימחק.`)}
      {btn("merge_into_b", `לשמור את "${nameB}"`, `לאחד את "${nameA}" לתוך "${nameB}"?`)}
      {btn("not_duplicate", "לא כפילות", undefined, "ghost")}
    </div>
  );
}
