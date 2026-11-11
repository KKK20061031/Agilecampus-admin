import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetingActionItems } from "@/db/schema";
import { createUser } from "@/lib/user";
import { createTeam, joinTeam } from "@/lib/team";
import { createMeetingActionItem, createTeamMeeting, deleteMeetingActionItem, deleteTeamMeeting,
  listTeamMeetings, setMeetingActionStatus, updateMeetingActionItem, updateTeamMeeting } from "@/lib/meeting";
import { resetDb } from "./helpers";

async function makeUser(email: string) {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}

async function scene() {
  const admin = await makeUser("meeting-admin@example.com");
  const creator = await makeUser("meeting-creator@example.com");
  const assignee = await makeUser("meeting-assignee@example.com");
  const member = await makeUser("meeting-member@example.com");
  const outsider = await makeUser("meeting-outsider@example.com");
  const team = await createTeam(admin.id, "设计小组");
  await joinTeam(creator.id, team.inviteCode);
  await joinTeam(assignee.id, team.inviteCode);
  await joinTeam(member.id, team.inviteCode);
  const meeting = await createTeamMeeting(creator.id, team.id, {
    title: "原型评审",
    startsAt: "2026-11-15T18:00:00.000Z",
    timeZone: "America/Los_Angeles",
    location: "线上会议",
    agenda: "检查注册流程",
    minutes: "确认需要补充错误提示",
  });
  return { admin, creator, assignee, member, outsider, team, meeting };
}

describe("团队会议", () => {
  beforeEach(resetDb);

  it("团队成员可创建和查看会议，非成员无法访问", async () => {
    const { admin, creator, outsider, team, meeting } = await scene();
    const listed = await listTeamMeetings(admin.id, team.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: meeting.id, title: "原型评审", creatorName: "meeting-creator" });
    await expect(listTeamMeetings(outsider.id, team.id)).rejects.toThrow("没有权限");
    await expect(createTeamMeeting(outsider.id, team.id, {
      title: "越权会议", startsAt: "2026-11-16T10:00:00.000Z", timeZone: "UTC",
    })).rejects.toThrow("没有权限");
    await expect(updateTeamMeeting(outsider.id, meeting.id, { title: "被改写" })).rejects.toThrow("没有权限");
    expect(creator.id).not.toBe(outsider.id);
  });

  it("仅会议创建者或组长可编辑和删除会议，行动项随会议删除", async () => {
    const { admin, creator, member, team, meeting } = await scene();
    await expect(updateTeamMeeting(member.id, meeting.id, { title: "越权编辑" })).rejects.toThrow("会议创建者或组长");
    const updated = await updateTeamMeeting(admin.id, meeting.id, {
      title: "原型评审第二轮", startsAt: "2026-11-16T19:30:00.000Z", timeZone: "America/Los_Angeles",
      location: "创新实验室", agenda: "复核注册流程", minutes: "确定验收标准",
    });
    expect(updated.title).toBe("原型评审第二轮");
    const item = await createMeetingActionItem(creator.id, meeting.id, { title: "补充错误提示", assigneeId: member.id });
    await expect(deleteTeamMeeting(member.id, meeting.id)).rejects.toThrow("会议创建者或组长");
    await deleteTeamMeeting(admin.id, meeting.id);
    expect(await db.select().from(meetingActionItems).where(eq(meetingActionItems.id, item.id))).toHaveLength(0);
    expect(await listTeamMeetings(admin.id, team.id)).toHaveLength(0);
  });

  it("行动项负责人可更新状态，创建者可编辑，负责人必须属于团队", async () => {
    const { admin, creator, assignee, member, outsider, team, meeting } = await scene();
    await expect(createMeetingActionItem(outsider.id, meeting.id, { title: "无权创建" })).rejects.toThrow("没有权限");
    await expect(createMeetingActionItem(creator.id, meeting.id, { title: "错派", assigneeId: outsider.id })).rejects.toThrow("必须是团队成员");

    const action = await createMeetingActionItem(creator.id, meeting.id, {
      title: "整理访谈结论", details: "汇总三位同学的反馈", assigneeId: assignee.id, dueDate: "2026-11-20",
    });
    await expect(setMeetingActionStatus(member.id, action.id, "done")).rejects.toThrow("负责人、创建者或组长");
    const completed = await setMeetingActionStatus(assignee.id, action.id, "done");
    expect(completed.status).toBe("done");
    await expect(updateMeetingActionItem(member.id, action.id, { title: "越权编辑" })).rejects.toThrow("行动项创建者");

    const revised = await updateMeetingActionItem(creator.id, action.id, {
      title: "整理并分享访谈结论", details: "发到团队文档", assigneeId: assignee.id, dueDate: "2026-11-21",
    });
    expect(revised.dueDate).toBe("2026-11-21");
    expect((await listTeamMeetings(admin.id, team.id))[0].actionItems[0].title).toBe("整理并分享访谈结论");
    await deleteMeetingActionItem(creator.id, action.id);
    expect((await listTeamMeetings(admin.id, team.id))[0].actionItems).toHaveLength(0);
  });
});
