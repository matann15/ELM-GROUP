"use client";
import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { btnClass } from "./ui";
import type { ActionResult } from "@/lib/types";

const ModalCtx = createContext<{ close: () => void } | null>(null);
export const useModal = () => useContext(ModalCtx);

export function Modal({
  trigger,
  triggerClass,
  title,
  children,
  wide,
  defaultOpen,
}: {
  trigger: ReactNode;
  triggerClass?: string;
  title: string;
  children: ReactNode;
  wide?: boolean;
  defaultOpen?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(!!defaultOpen);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <>
      <button type="button" className={triggerClass ?? btnClass("secondary", "md")} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && setOpen(false)}
        className={`m-auto w-[calc(100%-1.5rem)] ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl border border-line bg-white p-0 text-ink shadow-xl`}
      >
        {open && (
          <ModalCtx.Provider value={{ close: () => setOpen(false) }}>
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button type="button" aria-label="סגירה" className={btnClass("ghost", "sm")} onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[78vh] overflow-y-auto px-5 py-4">{children}</div>
          </ModalCtx.Provider>
        )}
      </dialog>
    </>
  );
}

export function SubmitButton({ children, variant = "primary", className, pendingText }: { children: ReactNode; variant?: "primary" | "secondary" | "danger" | "soft"; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={btnClass(variant, "md", className)}>
      {pending ? pendingText ?? "שומר…" : children}
    </button>
  );
}

type Act = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** טופס שמריץ פעולת שרת, מציג שגיאה/הצלחה וסוגר את החלון בהצלחה */
export function ActionForm({
  action,
  children,
  className,
  closeOnSuccess = true,
  resetOnSuccess,
  redirectTo,
}: {
  action: Act;
  children: ReactNode;
  className?: string;
  closeOnSuccess?: boolean;
  resetOnSuccess?: boolean;
  redirectTo?: (id?: string) => string;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(action, null);
  const modal = useModal();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      if (redirectTo) router.push(redirectTo(state.id));
      else router.refresh();
      if (closeOnSuccess && modal) modal.close();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      {state && !state.ok && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && state.message && !closeOnSuccess && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>}
    </form>
  );
}

export function Logo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={`font-bold tracking-wide text-ink ${className ?? ""}`}>ELM GROUP</span>;
  // הלוגו הרשמי של ELM GROUP (public/logo.jpg)
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.jpg" alt="ELM GROUP" className={className ?? "h-8 w-auto"} onError={() => setFailed(true)} />;
}

export function ConfirmButton({ children, message, className }: { children: ReactNode; message: string; className?: string }) {
  return (
    <button
      type="submit"
      className={className ?? btnClass("danger", "sm")}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
