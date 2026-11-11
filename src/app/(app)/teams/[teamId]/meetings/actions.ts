"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import {
  createMeetingSchema,
  createMeetingActionItem,
  createTeamMeeting,
  deleteMeetingActionItem,
  deleteTeamMeeting,
  getMeetingTeamId,
  getTeamForMeetingAction,
  meetingActionInputSchema,
  setMeetingActionStatus,
  updateMeetingActionItem,
  updateMeetingSchema,
  updateTeamMeeting,
} from "@/lib/meeting";

export type MeetingFormState = { error: string } | { ok: true } | null;

function formError(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请重试";
}

function actionInput(formData: FormData) {
  const raw = Object.fromEntries(formData);
  return {
    ...raw,
    assigneeId: raw.assigneeId || null,
    dueDate: raw.dueDate || null,
  };
}

export async function createMeetingAction(_prev: MeetingFormState, formData: FormData): Promise<MeetingFormState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };
  const parsed = z.object({ teamId: z.uuid() }).extend(createMeetingSchema.shape).safeParse({
    ...Object.fromEntries(formData),
    location: formData.get("location") || "",
    agenda: formData.get("agenda") || "",
    minutes: formData.get("minutes") || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "请检查会议资料" };
  const { teamId, ...input } = parsed.data;
  try {
    await createTeamMeeting(session.user.id, teamId, input);
    revalidatePath(`/teams/${teamId}/meetings`);
    return { ok: true };
  } catch (error) { return { error: formError(error) }; }
}

export async function updateMeetingAction(_prev: MeetingFormState, formData: FormData): Promise<MeetingFormState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };
  const parsed = z.object({ meetingId: z.uuid() }).extend(updateMeetingSchema.shape).safeParse({
    ...Object.fromEntries(formData),
    startsAt: formData.get("startsAt") || undefined,
    timeZone: formData.get("timeZone") || undefined,
    location: formData.get("location") || "",
    agenda: formData.get("agenda") || "",
    minutes: formData.get("minutes") || "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "请检查会议资料" };
  const { meetingId, ...input } = parsed.data;
  try {
    const teamId = await getMeetingTeamId(meetingId);
    await updateTeamMeeting(session.user.id, meetingId, input);
    revalidatePath(`/teams/${teamId}/meetings`);
    return { ok: true };
  } catch (error) { return { error: formError(error) }; }
}

export async function deleteMeetingAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new AppError("请先登录");
  const parsed = z.uuid().safeParse(formData.get("meetingId"));
  if (!parsed.success) throw new AppError("会议参数无效");
  const teamId = await getMeetingTeamId(parsed.data);
  await deleteTeamMeeting(session.user.id, parsed.data);
  revalidatePath(`/teams/${teamId}/meetings`);
}

export async function createMeetingActionItemAction(_prev: MeetingFormState, formData: FormData): Promise<MeetingFormState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };
  const meetingId = z.uuid().safeParse(formData.get("meetingId"));
  if (!meetingId.success) return { error: "会议参数无效" };
  const parsed = meetingActionInputSchema.safeParse(actionInput(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "请检查行动项" };
  try {
    const teamId = await getMeetingTeamId(meetingId.data);
    await createMeetingActionItem(session.user.id, meetingId.data, parsed.data);
    revalidatePath(`/teams/${teamId}/meetings`);
    return null;
  } catch (error) { return { error: formError(error) }; }
}

export async function updateMeetingActionItemAction(_prev: MeetingFormState, formData: FormData): Promise<MeetingFormState> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };
  const itemId = z.uuid().safeParse(formData.get("actionItemId"));
  if (!itemId.success) return { error: "行动项参数无效" };
  const parsed = meetingActionInputSchema.safeParse(actionInput(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "请检查行动项" };
  try {
    const teamId = await getTeamForMeetingAction(itemId.data);
    await updateMeetingActionItem(session.user.id, itemId.data, parsed.data);
    revalidatePath(`/teams/${teamId}/meetings`);
    return null;
  } catch (error) { return { error: formError(error) }; }
}

export async function setMeetingActionStatusAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new AppError("请先登录");
  const parsed = z.object({ actionItemId: z.uuid(), status: z.enum(["open", "done"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new AppError("行动项参数无效");
  const teamId = await getTeamForMeetingAction(parsed.data.actionItemId);
  await setMeetingActionStatus(session.user.id, parsed.data.actionItemId, parsed.data.status);
  revalidatePath(`/teams/${teamId}/meetings`);
}

export async function deleteMeetingActionItemAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new AppError("请先登录");
  const parsed = z.uuid().safeParse(formData.get("actionItemId"));
  if (!parsed.success) throw new AppError("行动项参数无效");
  const teamId = await getTeamForMeetingAction(parsed.data);
  await deleteMeetingActionItem(session.user.id, parsed.data);
  revalidatePath(`/teams/${teamId}/meetings`);
}
