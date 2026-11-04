import { Logo } from "@/components/client";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <Logo className="h-12 w-auto" />
          <p className="text-sm text-ink-3">מערכת עבודה למכירות · AKIRA SEIKI · TAJMAC-ZPS</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">{children}</div>
        <p className="mt-6 text-center text-xs text-ink-3">גישה למשתמשים מוזמנים בלבד</p>
      </div>
    </main>
  );
}
