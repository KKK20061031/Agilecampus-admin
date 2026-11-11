import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { courseAssignmentReminderDeliveries, courseAssignments, projects, tasks, teams } from "@/db/schema";
import { AppError } from "./errors";
import { isAssigneeOf } from "./task";
import { getWorkbenchScope } from "./workbench";

export const assignmentInputSchema = z.object({
  courseName: z.string().trim().min(1, "请填写课程名称").max(80),
  title: z.string().trim().min(1, "请填写作业名称").max(160),
  details: z.string().trim().max(2000).default(""),
  dueAt: z.iso.datetime({ offset: true }),
  timeZone: z.string().min(1).max(100),
  remindDays: z.array(z.union([z.literal(1), z.literal(3), z.literal(7)])).max(3).default([]),
});

export function normalizeAssignmentInput(input: unknown) {
  const parsed = assignmentInputSchema.parse(input);
  const dueAt = new Date(parsed.dueAt);
  if (Number.isNaN(dueAt.getTime())) throw new AppError("截止时间无效");
  try { new Intl.DateTimeFormat("en-US", { timeZone: parsed.timeZone }); }
  catch { throw new AppError("时区无效"); }
  return {
    courseName: parsed.courseName,
    title: parsed.title,
    details: parsed.details || null,
    dueAt,
    timeZone: parsed.timeZone,
    remindDays: [...new Set(parsed.remindDays)].sort((a, b) => b - a),
  };
}

export async function listCalendarItems(userId: string, teamId?: string | null) {
  const scope = await getWorkbenchScope(userId, teamId);
  const [own, projectTasks] = await Promise.all([
    db.select().from(courseAssignments).where(eq(courseAssignments.userId, userId)).orderBy(asc(courseAssignments.dueAt)),
    scope.projectIds.length === 0 ? Promise.resolve([]) : db
      .select({ id: tasks.id, title: tasks.title, date: tasks.dueDate, status: tasks.status,
        projectId: projects.id, projectName: projects.name, teamName: teams.name })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .innerJoin(teams, eq(projects.teamId, teams.id))
      .where(and(inArray(tasks.projectId, scope.projectIds), isAssigneeOf(userId), isNotNull(tasks.dueDate)))
      .orderBy(asc(tasks.dueDate)),
  ]);
  return {
    assignments: own.map((item) => ({ ...item, dueAt: item.dueAt.toISOString(),
      completedAt: item.completedAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString() })),
    tasks: projectTasks,
    teams: scope.teams.map((team) => ({ id: team.id, name: team.name })),
  };
}

export async function createCourseAssignment(userId: string, input: unknown) {
  const [row] = await db.insert(courseAssignments).values({ userId, ...normalizeAssignmentInput(input) }).returning();
  return row;
}

export async function updateCourseAssignment(userId: string, id: string, input: unknown) {
  const data = normalizeAssignmentInput(input);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: courseAssignments.id, dueAt: courseAssignments.dueAt,
      remindDays: courseAssignments.remindDays, timeZone: courseAssignments.timeZone }).from(courseAssignments)
      .where(and(eq(courseAssignments.id, id), eq(courseAssignments.userId, userId)));
    if (!existing) throw new AppError("作业不存在");
    const [row] = await tx.update(courseAssignments).set({ ...data, updatedAt: new Date() })
      .where(and(eq(courseAssignments.id, id), eq(courseAssignments.userId, userId))).returning();
    if (existing.dueAt.getTime() !== data.dueAt.getTime() ||
      existing.remindDays.join(",") !== data.remindDays.join(",") || existing.timeZone !== data.timeZone) {
      await tx.delete(courseAssignmentReminderDeliveries).where(eq(courseAssignmentReminderDeliveries.assignmentId, id));
    }
    return row;
  });
}

export async function setCourseAssignmentCompleted(userId: string, id: string, completed: boolean) {
  const [row] = await db.update(courseAssignments).set({ completedAt: completed ? new Date() : null,
    updatedAt: new Date() }).where(and(eq(courseAssignments.id, id), eq(courseAssignments.userId, userId))).returning();
  if (!row) throw new AppError("作业不存在");
  return row;
}

export async function deleteCourseAssignment(userId: string, id: string) {
  const [row] = await db.delete(courseAssignments)
    .where(and(eq(courseAssignments.id, id), eq(courseAssignments.userId, userId)))
    .returning({ id: courseAssignments.id });
  if (!row) throw new AppError("作业不存在");
}
