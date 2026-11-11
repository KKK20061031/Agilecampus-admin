import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import { courseAssignmentReminderDeliveries, courseAssignments, notifications } from "@/db/schema";

const DAY_MS = 86_400_000;

function calendarDay(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(value("year"), value("month") - 1, value("day"));
}

export function reminderStage(dueAt: Date, now: Date, enabled: number[], timeZone = "UTC"): number | null {
  if (dueAt.getTime() <= now.getTime()) return null;
  const days = (calendarDay(dueAt, timeZone) - calendarDay(now, timeZone)) / DAY_MS;
  return enabled.includes(days) ? days : null;
}

async function syncRows(userId: string | null, now: Date) {
  const upcoming = await db.select().from(courseAssignments).where(and(
    userId ? eq(courseAssignments.userId, userId) : undefined,
    gt(courseAssignments.dueAt, now),
    lte(courseAssignments.dueAt, new Date(now.getTime() + 8 * DAY_MS)),
  ));
  let sent = 0;
  for (const item of upcoming) {
    if (item.completedAt) continue;
    const stage = reminderStage(item.dueAt, now, item.remindDays, item.timeZone);
    if (stage === null) continue;
    // Unique delivery row and notification share one transaction, including across cron and page visits.
    const didSend = await db.transaction(async (tx) => {
      const [delivery] = await tx.insert(courseAssignmentReminderDeliveries)
        .values({ assignmentId: item.id, daysBefore: stage })
        .onConflictDoNothing().returning({ assignmentId: courseAssignmentReminderDeliveries.assignmentId });
      if (!delivery) return false;
      await tx.insert(notifications).values({
        userId: item.userId,
        type: "course_assignment_due",
        title: `课程作业还有 ${stage} 天截止`,
        content: `${item.courseName} · ${item.title}`,
        linkUrl: `/calendar?assignment=${item.id}`,
      });
      return true;
    });
    if (didSend) sent++;
  }
  return sent;
}

export function syncMyCourseReminders(userId: string, now = new Date()) {
  return syncRows(userId, now);
}

export function syncAllCourseReminders(now = new Date()) {
  return syncRows(null, now);
}
