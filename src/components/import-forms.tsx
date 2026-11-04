"use client";
import { useActionState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import { btnClass } from "@/components/ui";
import { uploadImport, rescanDuplicates } from "@/app/actions/import";
import type { ActionResult } from "@/lib/types";

export function UploadForm() {
  return (
    <ActionForm action={uploadImport} className="flex flex-wrap items-center gap-3">
      <input type="file" name="file" accept=".xlsx,.csv" required className="block text-sm file:me-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-brand-dark" />
      <SubmitButton pendingText="קורא את הקובץ…">העלאה ותצוגה מקדימה</SubmitButton>
    </ActionForm>
  );
}

export function RescanButton() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async () => rescanDuplicates(), null);
  return (
    <form action={action} className="flex items-center gap-2">
      <button className={btnClass("secondary", "sm")} disabled={pending}>{pending ? "סורק…" : "סריקת כפילויות"}</button>
      {state && <span className="text-sm text-ink-3">{state.ok ? state.message : state.error}</span>}
    </form>
  );
}
