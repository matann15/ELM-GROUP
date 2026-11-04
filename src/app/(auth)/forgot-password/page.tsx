import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field, Input } from "@/components/ui";
import { requestPasswordReset } from "@/app/actions/auth";

export default function ForgotPage() {
  return (
    <>
      <h1 className="mb-2 text-xl font-bold">איפוס סיסמה</h1>
      <p className="mb-5 text-sm text-ink-3">נשלח קישור לאיפוס לכתובת האימייל של החשבון.</p>
      <ActionForm action={requestPasswordReset} closeOnSuccess={false} className="space-y-4">
        <Field label="אימייל">
          <Input name="email" type="email" required dir="ltr" className="text-left" />
        </Field>
        <SubmitButton className="w-full">שליחת קישור</SubmitButton>
      </ActionForm>
      <div className="mt-4 text-center text-sm">
        <Link href="/login" className="text-brand hover:underline">חזרה להתחברות</Link>
      </div>
    </>
  );
}
