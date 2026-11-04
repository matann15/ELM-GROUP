import Link from "next/link";
import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";
const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap select-none";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark shadow-sm",
  secondary: "bg-white text-ink border border-line hover:border-ink-3/40 hover:bg-canvas",
  ghost: "text-ink-2 hover:bg-black/5",
  danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
  soft: "bg-brand-soft text-brand-dark hover:bg-brand-line/60",
};
const sizes: Record<Size, string> = { sm: "h-8 px-2.5 text-sm", md: "h-10 px-3.5 text-[15px]", lg: "h-12 px-5 text-base" };

export function btnClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return clsx(base, variants[variant], sizes[size], extra);
}
export function Button({ variant = "secondary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={btnClass(variant, size, className)} {...p} />;
}
export function LinkButton({ variant = "secondary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={btnClass(variant, size, className)} {...p} />;
}
export function ExtLink({ variant = "secondary", size = "md", className, ...p }: ComponentProps<"a"> & { variant?: Variant; size?: Size }) {
  return <a className={btnClass(variant, size, className)} target={p.href?.startsWith("tel:") ? undefined : "_blank"} rel="noreferrer" {...p} />;
}

const field =
  "w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:bg-canvas";
export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={clsx(field, "h-10", className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={clsx(field, "py-2 min-h-[80px] leading-relaxed", className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={clsx(field, "h-10 pe-8", className)} {...p} />;
}
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

type Tone = "neutral" | "brand" | "green" | "amber" | "red" | "blue" | "violet";
const tones: Record<Tone, string> = {
  neutral: "bg-black/5 text-ink-2",
  brand: "bg-brand-soft text-brand-dark",
  green: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/70",
  red: "bg-red-50 text-red-700 ring-1 ring-red-200/70",
  blue: "bg-sky-50 text-sky-800 ring-1 ring-sky-200/70",
  violet: "bg-violet-50 text-violet-800 ring-1 ring-violet-200/70",
};
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function Card({ children, className, ...p }: ComponentProps<"div">) {
  return (
    <div className={clsx("rounded-xl border border-line bg-surface", className)} {...p}>
      {children}
    </div>
  );
}
export function CardHeader({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-ink-3">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <div className="mt-1 text-[15px] text-ink-3">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-white/60 px-4 py-8 text-center">
      <p className="font-medium text-ink-2">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-3">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "red" | "blue" | "green"; children: ReactNode }) {
  const t = { amber: "bg-amber-50 border-amber-200 text-amber-900", red: "bg-red-50 border-red-200 text-red-800", blue: "bg-sky-50 border-sky-200 text-sky-900", green: "bg-emerald-50 border-emerald-200 text-emerald-900" }[tone];
  return <div className={clsx("rounded-lg border px-3 py-2 text-sm leading-relaxed", t)}>{children}</div>;
}

export function Phone({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-ink-3">—</span>;
  return <span className="ltr tabular">{value}</span>;
}
