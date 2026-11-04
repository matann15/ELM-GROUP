import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field, Input, Notice } from "@/components/ui";
import { signIn } from "@/app/actions/auth";

const ERRORS: Record<string, string> = {
  inactive: "החשבון אינו פעיל או שאין לו הזמנה. פנו למנהל המערכת.",
  link: "הקישור אינו תקף או שפג תוקפו.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="mb-5 text-xl font-bold">התחברות</h1>
      {sp.error && ERRORS[sp.error] && (
        <div className="mb-4">
          <Notice tone="red">{ERRORS[sp.error]}</Notice>
        </div>
      )}
      <ActionForm action={signIn} className="space-y-4">
        <input type="hidden" name="next" value={sp.next ?? "/"} />
        <Field label="אימייל">
          <Input name="email" type="email" autoComplete="email" required dir="ltr" className="text-left" />
        </Field>
        <Field label="סיסמה">
          <Input name="password" type="password" autoComplete="current-password" required dir="ltr" className="text-left" />
        </Field>
        <SubmitButton className="w-full" pendingText="מתחבר…">כניסה</SubmitButton>
      </ActionForm>
      <div className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-brand hover:underline">
          שכחתי סיסמה
        </Link>
      </div>
    </>
  );
}
