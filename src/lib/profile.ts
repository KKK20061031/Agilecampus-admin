import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { userProfiles, users } from "@/db/schema";

export const profileFields = ["school", "grade", "major", "gender", "contact", "personalEmail"] as const;
export type ProfileField = (typeof profileFields)[number];

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

export const profileSchema = z.object({
  school: optionalText(100),
  grade: optionalText(40),
  major: optionalText(100),
  gender: z.enum(["男", "女"], { error: "请选择性别" }),
  contact: optionalText(100),
  personalEmail: z.preprocess(
    (value) => typeof value === "string" ? value.trim() : value,
    z.union([z.literal(""), z.email("个人邮箱格式不正确")]).default(""),
  ),
  visibleFields: z.array(z.enum(profileFields)).default([]),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export function profileFromFormData(formData: FormData): ProfileInput {
  return profileSchema.parse({
    ...Object.fromEntries(profileFields.map((field) => [field, formData.get(field) ?? ""])),
    visibleFields: profileFields.filter((field) => formData.get(`show_${field}`) === "on"),
  });
}

export async function getMyProfile(userId: string) {
  const [row] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  return row ?? null;
}

export async function updateMyProfile(userId: string, input: ProfileInput) {
  const data = profileSchema.parse(input);
  await db.insert(userProfiles).values({ userId, ...data }).onConflictDoUpdate({
    target: userProfiles.userId,
    set: { ...data, updatedAt: new Date() },
  });
}

export async function getVisibleProfile(userId: string) {
  const [row] = await db
    .select({
      name: users.name,
      school: userProfiles.school,
      grade: userProfiles.grade,
      major: userProfiles.major,
      gender: userProfiles.gender,
      contact: userProfiles.contact,
      personalEmail: userProfiles.personalEmail,
      visibleFields: userProfiles.visibleFields,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId));
  if (!row) return null;

  return selectVisibleProfile(row);
}

export function selectVisibleProfile(row: {
  name: string;
  visibleFields: string[] | null;
} & Record<ProfileField, string | null>) {
  const visible = new Set(row.visibleFields ?? []);
  return {
    name: row.name,
    ...Object.fromEntries(profileFields.map((field) => [field, visible.has(field) ? row[field] : null])),
  } as { name: string } & Record<ProfileField, string | null>;
}
