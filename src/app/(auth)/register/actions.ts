"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createUser } from "@/lib/user";
import { AppError } from "@/lib/errors";
import { profileFromFormData } from "@/lib/profile";

const registerSchema = z.object({
  name: z.string().trim().min(1, "请填写姓名").max(100, "姓名最长 100 字"),
  studentId: z
    .string()
    .trim()
    .regex(/^\d{14}$/, "学号须为 14 位数字"),
  email: z.email("邮箱格式不正确"),
  password: z.string().min(8, "密码至少 8 位").max(64, "密码最长 64 位"),
});

export type FormState = { error: string } | null;

export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let profile;
  try {
    profile = profileFromFormData(formData);
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0].message };
    throw e;
  }

  try {
    await createUser({ ...parsed.data, profile });
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  redirect("/login?registered=1");
}
