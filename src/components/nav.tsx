"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import {
  CalendarDays, Sun, Building2, KanbanSquare, Route, BarChart3, Upload, ShieldCheck, Search, Users, Menu, X, ClipboardList,
} from "lucide-react";

const ITEMS = [
  { href: "/", label: "היום שלי", icon: Sun, mobile: true },
  { href: "/calendar", label: "יומן", icon: CalendarDays, mobile: true },
  { href: "/plan", label: "תכנון תקופה", icon: ClipboardList },
  { href: "/customers", label: "לקוחות", icon: Building2, mobile: true },
  { href: "/opportunities", label: "הזדמנויות", icon: KanbanSquare, mobile: true },
  { href: "/route", label: "מסלול שטח", icon: Route },
  { href: "/reports", label: "דוחות", icon: BarChart3 },
  { href: "/data-quality", label: "איכות נתונים", icon: ShieldCheck },
  { href: "/research", label: "מחקר ומקורות", icon: Search },
  { href: "/import", label: "ייבוא", icon: Upload, admin: true },
  { href: "/admin/users", label: "משתמשים", icon: Users, admin: true },
];

function active(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function SideNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {ITEMS.filter((i) => !i.admin || isAdmin).map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={clsx(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[15px] transition-colors",
            active(path, i.href) ? "bg-brand-soft font-semibold text-brand-dark" : "text-ink-2 hover:bg-black/5",
          )}
        >
          <i.icon size={18} strokeWidth={active(path, i.href) ? 2.2 : 1.8} />
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const main = ITEMS.filter((i) => i.mobile);
  const more = ITEMS.filter((i) => !i.mobile && (!i.admin || isAdmin));
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-0 bottom-16 rounded-t-2xl border-t border-line bg-white p-3 pb-4" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-2">
              {more.map((i) => (
                <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className={clsx("flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-sm", active(path, i.href) ? "bg-brand-soft text-brand-dark" : "text-ink-2 bg-canvas")}>
                  <i.icon size={20} />
                  {i.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-50 grid h-16 grid-cols-5 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {main.map((i) => (
          <Link key={i.href} href={i.href} className={clsx("flex flex-col items-center justify-center gap-0.5 text-[11px]", active(path, i.href) ? "text-brand font-semibold" : "text-ink-3")}>
            <i.icon size={21} />
            {i.label}
          </Link>
        ))}
        <button type="button" onClick={() => setOpen((o) => !o)} className={clsx("flex flex-col items-center justify-center gap-0.5 text-[11px]", open ? "text-brand" : "text-ink-3")}>
          {open ? <X size={21} /> : <Menu size={21} />}
          עוד
        </button>
      </nav>
    </>
  );
}
