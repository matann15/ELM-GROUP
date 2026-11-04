import { redirect } from "next/navigation";
import { ActionForm, SubmitButton, Logo } from "@/components/client";
import { Field, Input } from "@/components/ui";
import { setPassword } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?error=link");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo className="h-12 w-auto" /></div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-xl font-bold">הגדרת סיסמה</h1>
          <p className="mb-5 text-sm text-ink-3 ltr">{data.user.email}</p>
          <ActionForm action={setPassword} className="space-y-4">
            <Field label="סיסמה חדשה" hint="לפחות 10 תווים">
              <Input name="password" type="password" autoComplete="new-password" required minLength={10} dir="ltr" />
            </Field>
            <Field label="אימות סיסמה">
              <Input name="password2" type="password" autoComplete="new-password" required dir="ltr" />
            </Field>
            <SubmitButton className="w-full">שמירה וכניסה</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </main>
  );
}
