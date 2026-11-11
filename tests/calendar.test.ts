import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { courseAssignmentReminderDeliveries, notifications } from "@/db/schema";
import { createUser } from "@/lib/user";
import { createTeam, joinTeam } from "@/lib/team";
import { createProject } from "@/lib/project";
import { createTask } from "@/lib/task";
import { createCourseAssignment, deleteCourseAssignment, listCalendarItems,
  normalizeAssignmentInput, setCourseAssignmentCompleted, updateCourseAssignment } from "@/lib/calendar";
import { reminderStage, syncMyCourseReminders } from "@/lib/course-reminders";
import { resetDb } from "./helpers";

const input = {
  courseName: "高等数学",
  title: "习题三",
  details: "第 4 页",
  dueAt: "2026-11-20T07:59:00.000Z",
  timeZone: "America/Los_Angeles",
  remindDays: [7, 3, 1],
};

describe("课程作业日期", () => {
  it("按学生当地日历日提醒，跨夏令时仍准确", () => {
    const due = new Date("2026-11-09T07:59:00Z");
    expect(reminderStage(due, new Date("2026-11-01T12:00:00Z"), [7], "America/Los_Angeles")).toBe(7);
    expect(reminderStage(due, new Date("2026-11-02T12:00:00Z"), [7], "America/Los_Angeles")).toBeNull();
    expect(reminderStage(due, due, [1], "America/Los_Angeles")).toBeNull();
  });

  it("拒绝无效时区，提醒天数去重", () => {
    expect(() => normalizeAssignmentInput({ ...input, timeZone: "invalid" })).toThrow("时区无效");
    expect(normalizeAssignmentInput({ ...input, remindDays: [1, 7, 1] }).remindDays).toEqual([7, 1]);
  });
});

describe("课程作业数据与提醒", () => {
  beforeEach(resetDb);

  it("作业仅本人可见和修改，日历包含本人被指派的小组任务", async () => {
    const owner = await createUser({ email: "calendar-owner@example.com", password: "password123", name: "甲" });
    const member = await createUser({ email: "calendar-member@example.com", password: "password123", name: "乙" });
    const team = await createTeam(owner.id, "学习小组");
    await joinTeam(member.id, team.inviteCode);
    const project = await createProject(owner.id, team.id, { name: "课程项目" });
    const task = await createTask(owner.id, project.id, { title: "提交展示", assigneeId: member.id, dueDate: "2026-11-21" });
    const assignment = await createCourseAssignment(member.id, input);

    const calendar = await listCalendarItems(member.id);
    expect(calendar.assignments.map((item) => item.id)).toEqual([assignment.id]);
    expect(calendar.tasks.map((item) => item.id)).toContain(task.id);
    expect((await listCalendarItems(owner.id)).assignments).toEqual([]);
    await expect(updateCourseAssignment(owner.id, assignment.id, input)).rejects.toThrow("作业不存在");
    await expect(setCourseAssignmentCompleted(owner.id, assignment.id, true)).rejects.toThrow("作业不存在");
    await expect(deleteCourseAssignment(owner.id, assignment.id)).rejects.toThrow("作业不存在");

    expect((await setCourseAssignmentCompleted(member.id, assignment.id, true)).completedAt).toBeInstanceOf(Date);
    expect((await setCourseAssignmentCompleted(member.id, assignment.id, false)).completedAt).toBeNull();
    await deleteCourseAssignment(member.id, assignment.id);
    expect((await listCalendarItems(member.id)).assignments).toEqual([]);
  });

  it("同一提前日期只通知一次，完成后停止提醒", async () => {
    const owner = await createUser({ email: "calendar-remind@example.com", password: "password123", name: "丙" });
    const assignment = await createCourseAssignment(owner.id, input);
    const now = new Date("2026-11-12T18:00:00Z");
    expect(await syncMyCourseReminders(owner.id, now)).toBe(1);
    expect(await syncMyCourseReminders(owner.id, now)).toBe(0);
    expect(await db.select().from(notifications).where(and(eq(notifications.userId, owner.id), eq(notifications.type, "course_assignment_due")))).toHaveLength(1);
    expect(await db.select().from(courseAssignmentReminderDeliveries).where(eq(courseAssignmentReminderDeliveries.assignmentId, assignment.id))).toHaveLength(1);
    await setCourseAssignmentCompleted(owner.id, assignment.id, true);
    expect(await syncMyCourseReminders(owner.id, new Date("2026-11-16T18:00:00Z"))).toBe(0);
  });
});
