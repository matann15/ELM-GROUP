import { requireUser } from "@/lib/auth";
import { PageHeader, Card } from "@/components/ui";
import { MyProfileForm } from "@/components/user-forms";

export default async function ProfilePage() {
  const { profile } = await requireUser();
  return (
    <>
      <PageHeader title="הפרופיל שלי" sub={profile.email} />
      <Card><div className="p-4"><MyProfileForm p={profile} /></div></Card>
    </>
  );
}
