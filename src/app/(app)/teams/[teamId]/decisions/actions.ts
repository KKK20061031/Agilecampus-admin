"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import {
  confirmTeamDecision,
  createDecisionSchema,
  createTeamDecision,
  deleteTeamDecision,
  getDecisionTeamId,
  updateDecisionSchema,
  updateTeamDecision,
} from "@/lib/decision";

export type DecisionFormState = { error: string } | { ok: true } | null;

function formError(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请重试";
}

export async function createDecisionAction(_prev: DecisionFormState, formData: FormData): Promise<DecisionFormState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };
  const parsed = z.object({ teamId: z.uuid() }).extend(createDecisionSchema.shape).safeParse({
    ...Object.fromEntries(formData),
    context: formData.get("context") || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "请检查决策记录" };
  const { teamId, ...input } = parsed.data;
  try {
    await createTeamDecision(session.user.id, teamId, input);
    revalidatePath(`/teams/${teamId}/decisions`);
    return { ok: true };
  } catch (error) { return { error: formError(error) }; }
}

export async function updateDecisionAction(_prev: DecisionFormState, formData: FormData): Promise<DecisionFormState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };
  const parsed = z.object({ decisionId: z.uuid() }).extend(updateDecisionSchema.shape).safeParse({
    ...Object.fromEntries(formData),
    context: formData.get("context") || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "请检查决策记录" };
  const { decisionId, ...input } = parsed.data;
  try {
    const teamId = await getDecisionTeamId(decisionId);
    await updateTeamDecision(session.user.id, decisionId, input);
    revalidatePath(`/teams/${teamId}/decisions`);
    return { ok: true };
  } catch (error) { return { error: formError(error) }; }
}

export async function confirmDecisionAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new AppError("请先登录");
  const parsed = z.uuid().safeParse(formData.get("decisionId"));
  if (!parsed.success) throw new AppError("决策记录参数无效");
  const teamId = await getDecisionTeamId(parsed.data);
  await confirmTeamDecision(session.user.id, parsed.data);
  revalidatePath(`/teams/${teamId}/decisions`);
}

export async function deleteDecisionAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new AppError("请先登录");
  const parsed = z.uuid().safeParse(formData.get("decisionId"));
  if (!parsed.success) throw new AppError("决策记录参数无效");
  const teamId = await getDecisionTeamId(parsed.data);
  await deleteTeamDecision(session.user.id, parsed.data);
  revalidatePath(`/teams/${teamId}/decisions`);
}
