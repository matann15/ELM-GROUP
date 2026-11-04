"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnClass } from "@/components/ui";
import { confirmVisit, deleteActivity } from "@/app/actions/activities";

export function ConfirmVisitButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      className={btnClass("secondary", "md")}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("id", id);
          const r = await confirmVisit(null, fd);
          if (!r.ok) alert(r.error);
          router.refresh();
        })
      }
    >
      {pending ? "…" : "סימון כמתואם"}
    </button>
  );
}

export function DeleteActivityButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      className={btnClass("ghost", "sm", "text-red-700")}
      onClick={() => {
        if (!confirm("למחוק את הפעולה המוצעת?")) return;
        start(async () => {
          const fd = new FormData();
          fd.set("id", id);
          const r = await deleteActivity(null, fd);
          if (!r.ok) alert(r.error);
          router.refresh();
        });
      }}
    >
      מחיקה
    </button>
  );
}
