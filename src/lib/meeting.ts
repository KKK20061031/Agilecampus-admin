import { asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { meetingActionItems, teamMeetings, users } from "@/db/schema";
import { AppError, ForbiddenError } from "./errors";
import { getTeamMembership } from "./team";

const meetingFields = {
  title: z.string().trim().min(1, "请填写会议名称").max(140),
  startsAt: z.iso.datetime({ offset: true }),
  timeZone: z.string().trim().min(1).max(100),
  location: z.string().trim().max(160).optional().default(""),
  agenda: z.string().trim().max(5000).optional().default(""),
  minutes: z.string().trim().max(10000).optional().default(""),
};

export const createMeetingSchema = z.object(meetingFields);
export const updateMeetingSchema = z.object({
  title: meetingFields.title.optional(),
  startsAt: meetingFields.startsAt.optional(),
  timeZone: meetingFields.timeZone.optional(),
  location: meetingFields.location,
  agenda: meetingFields.agenda,
  minutes: meetingFields.minutes,
});

export const meetingActionInputSchema = z.object({
  title: z.string().trim().min(1, "请填写行动项").max(180),
  details: z.string().trim().max(3000).optional().default(""),
  assigneeId: z.uuid().nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
});

async function requireMeeting(actorId: string, meetingId: string) {
  const [meeting] = await db.select().from(teamMeetings).where(eq(teamMeetings.id, meetingId));
  if (!meeting) throw new AppError("会议不存在");
  const member = await getTeamMembership(actorId, meeting.teamId);
  if (!member) throw new ForbiddenError();
  return { meeting, member };
}

function requireMeetingManager(actorId: string, meeting: { createdById: string | null }, role: string) {
  if (meeting.createdById !== actorId && role !== "admin") throw new ForbiddenError("只有会议创建者或组长可以管理会议");
}

async function validateAssignee(teamId: string, assigneeId: string | null | undefined) {
  if (!assigneeId) return;
  if (!(await getTeamMembership(assigneeId, teamId))) throw new AppError("行动项负责人必须是团队成员");
}

function parseStartsAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError("会议时间无效");
  return date;
}

export async function listTeamMeetings(actorId: string, teamId: string) {
  if (!(await getTeamMembership(actorId, teamId))) throw new ForbiddenError();
  const rows = await db.select({
    id: teamMeetings.id,
    teamId: teamMeetings.teamId,
    createdById: teamMeetings.createdById,
    creatorName: users.name,
    title: teamMeetings.title,
    startsAt: teamMeetings.startsAt,
    timeZone: teamMeetings.timeZone,
    location: teamMeetings.location,
    agenda: teamMeetings.agenda,
    minutes: teamMeetings.minutes,
    createdAt: teamMeetings.createdAt,
    updatedAt: teamMeetings.updatedAt,
  }).from(teamMeetings)
    .leftJoin(users, eq(teamMeetings.createdById, users.id))
    .where(eq(teamMeetings.teamId, teamId))
    .orderBy(desc(teamMeetings.startsAt));
  if (rows.length === 0) return [];
  const actions = await db.select({
    id: meetingActionItems.id,
    meetingId: meetingActionItems.meetingId,
    createdById: meetingActionItems.createdById,
    assigneeId: meetingActionItems.assigneeId,
    assigneeName: users.name,
    title: meetingActionItems.title,
    details: meetingActionItems.details,
    dueDate: meetingActionItems.dueDate,
    status: meetingActionItems.status,
    createdAt: meetingActionItems.createdAt,
    updatedAt: meetingActionItems.updatedAt,
  }).from(meetingActionItems)
    .leftJoin(users, eq(meetingActionItems.assigneeId, users.id))
    .where(inArray(meetingActionItems.meetingId, rows.map((row) => row.id)))
    .orderBy(asc(meetingActionItems.dueDate), asc(meetingActionItems.createdAt));
  const actionsByMeeting = new Map<string, typeof actions>();
  for (const action of actions) actionsByMeeting.set(action.meetingId, [...(actionsByMeeting.get(action.meetingId) ?? []), action]);
  return rows.map((meeting) => ({ ...meeting, actionItems: actionsByMeeting.get(meeting.id) ?? [] }));
}

export async function createTeamMeeting(actorId: string, teamId: string, input: unknown) {
  const data = createMeetingSchema.parse(input);
  if (!(await getTeamMembership(actorId, teamId))) throw new ForbiddenError();
  const startsAt = parseStartsAt(data.startsAt);
  try { new Intl.DateTimeFormat("en-US", { timeZone: data.timeZone }); }
  catch { throw new AppError("时区无效"); }
  const [meeting] = await db.insert(teamMeetings).values({
    teamId,
    createdById: actorId,
    title: data.title,
    startsAt,
    timeZone: data.timeZone,
    location: data.location || null,
    agenda: data.agenda,
    minutes: data.minutes,
  }).returning();
  return meeting;
}

export async function updateTeamMeeting(actorId: string, meetingId: string, input: unknown) {
  const data = updateMeetingSchema.parse(input);
  const { meeting, member } = await requireMeeting(actorId, meetingId);
  requireMeetingManager(actorId, meeting, member.role);
  const timeZone = data.timeZone ?? meeting.timeZone;
  try { new Intl.DateTimeFormat("en-US", { timeZone }); }
  catch { throw new AppError("时区无效"); }
  const [updated] = await db.update(teamMeetings).set({
    ...(data.title !== undefined && { title: data.title }),
    ...(data.startsAt !== undefined && { startsAt: parseStartsAt(data.startsAt) }),
    timeZone,
    ...(data.location !== undefined && { location: data.location || null }),
    ...(data.agenda !== undefined && { agenda: data.agenda }),
    ...(data.minutes !== undefined && { minutes: data.minutes }),
    updatedAt: new Date(),
  }).where(eq(teamMeetings.id, meetingId)).returning();
  return updated;
}

export async function deleteTeamMeeting(actorId: string, meetingId: string) {
  const { meeting, member } = await requireMeeting(actorId, meetingId);
  requireMeetingManager(actorId, meeting, member.role);
  await db.delete(teamMeetings).where(eq(teamMeetings.id, meetingId));
}

export async function createMeetingActionItem(actorId: string, meetingId: string, input: unknown) {
  const data = meetingActionInputSchema.parse(input);
  const { meeting } = await requireMeeting(actorId, meetingId);
  await validateAssignee(meeting.teamId, data.assigneeId);
  const [item] = await db.insert(meetingActionItems).values({
    meetingId,
    createdById: actorId,
    assigneeId: data.assigneeId ?? null,
    title: data.title,
    details: data.details,
    dueDate: data.dueDate ?? null,
  }).returning();
  return item;
}

async function requireActionItem(actorId: string, actionItemId: string) {
  const [item] = await db.select({
    id: meetingActionItems.id,
    meetingId: meetingActionItems.meetingId,
    createdById: meetingActionItems.createdById,
    assigneeId: meetingActionItems.assigneeId,
  }).from(meetingActionItems).where(eq(meetingActionItems.id, actionItemId));
  if (!item) throw new AppError("行动项不存在");
  const { meeting, member } = await requireMeeting(actorId, item.meetingId);
  return { item, meeting, member };
}

function requireActionManager(actorId: string, item: { createdById: string | null }, meeting: { createdById: string | null }, role: string) {
  if (item.createdById !== actorId && meeting.createdById !== actorId && role !== "admin") {
    throw new ForbiddenError("只有行动项创建者、会议创建者或组长可以编辑行动项");
  }
}

export async function updateMeetingActionItem(actorId: string, actionItemId: string, input: unknown) {
  const data = meetingActionInputSchema.parse(input);
  const { item, meeting, member } = await requireActionItem(actorId, actionItemId);
  requireActionManager(actorId, item, meeting, member.role);
  await validateAssignee(meeting.teamId, data.assigneeId);
  const [updated] = await db.update(meetingActionItems).set({
    assigneeId: data.assigneeId ?? null,
    title: data.title,
    details: data.details,
    dueDate: data.dueDate ?? null,
    updatedAt: new Date(),
  }).where(eq(meetingActionItems.id, actionItemId)).returning();
  return updated;
}

export async function setMeetingActionStatus(actorId: string, actionItemId: string, status: "open" | "done") {
  const { item, meeting, member } = await requireActionItem(actorId, actionItemId);
  if (item.assigneeId !== actorId && item.createdById !== actorId && meeting.createdById !== actorId && member.role !== "admin") {
    throw new ForbiddenError("只有负责人、创建者或组长可以更新行动项状态");
  }
  const [updated] = await db.update(meetingActionItems).set({ status, updatedAt: new Date() })
    .where(eq(meetingActionItems.id, actionItemId)).returning();
  return updated;
}

export async function deleteMeetingActionItem(actorId: string, actionItemId: string) {
  const { item, meeting, member } = await requireActionItem(actorId, actionItemId);
  requireActionManager(actorId, item, meeting, member.role);
  await db.delete(meetingActionItems).where(eq(meetingActionItems.id, actionItemId));
}

export async function getMeetingTeamId(meetingId: string) {
  const [meeting] = await db.select({ teamId: teamMeetings.teamId }).from(teamMeetings).where(eq(teamMeetings.id, meetingId));
  if (!meeting) throw new AppError("会议不存在");
  return meeting.teamId;
}

export async function getTeamForMeetingAction(actionItemId: string) {
  const [row] = await db.select({ teamId: teamMeetings.teamId }).from(meetingActionItems)
    .innerJoin(teamMeetings, eq(meetingActionItems.meetingId, teamMeetings.id))
    .where(eq(meetingActionItems.id, actionItemId));
  if (!row) throw new AppError("行动项不存在");
  return row.teamId;
}
