import { requireUser } from "@/lib/auth";
import { SideNav, BottomNav } from "@/components/nav";
import { Logo } from "@/components/client";
import { signOut } from "@/app/actions/auth";
import { LogOut } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();
  const isAdmin = profile.role === "admin";
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-e border-line bg-white px-3 py-4 lg:flex">
        <Link href="/" className="mb-6 px-2"><Logo className="h-9 w-auto" /></Link>
        <SideNav isAdmin={isAdmin} />
        <div className="mt-auto border-t border-line px-2 pt-3">
          <Link href="/profile" className="block truncate text-sm font-medium hover:text-brand">{profile.full_name || profile.email}</Link>
          <p className="text-xs text-ink-3">{isAdmin ? "מנהל" : "איש מכירות"}</p>
          <form action={signOut} className="mt-2">
            <button className="flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink"><LogOut size={15} /> יציאה</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur lg:hidden">
          <Link href="/"><Logo className="h-7 w-auto" /></Link>
          <form action={signOut}>
            <button aria-label="יציאה" className="p-2 text-ink-3"><LogOut size={18} /></button>
          </form>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
      </div>
      <BottomNav isAdmin={isAdmin} />
    </div>
  );
}
