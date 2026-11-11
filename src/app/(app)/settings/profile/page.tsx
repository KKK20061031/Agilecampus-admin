import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { SkillTagsEditor } from "./skill-tags-editor";
import { StudentIdForm } from "./student-id-form";
import { getMyProfile } from "@/lib/profile";
import { ProfileEditor } from "./profile-editor";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [[me], profile] = await Promise.all([
    db.select({ name: users.name, skillTags: users.skillTags, studentId: users.studentId })
      .from(users).where(eq(users.id, session.user.id)),
    getMyProfile(session.user.id),
  ]);

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold text-ink">个人资料</h1>
        <p className="text-sm text-ink-soft">管理向群聊队友展示的个人信息。</p>
      </header>
      <ProfileEditor name={me?.name ?? session.user.name ?? ""} initial={profile} />
      <StudentIdForm initial={me?.studentId ?? null} />
      <SkillTagsEditor initialTags={me?.skillTags ?? []} />
    </main>
  );
}
