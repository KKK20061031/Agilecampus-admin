import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "@/lib/user";
import { createTeam, joinTeam } from "@/lib/team";
import { createProject } from "@/lib/project";
import { createTaskFromGroupMessage } from "@/lib/chat-task";
import { getOrCreateDmRoom, getOrCreateGroupRoom, sendMessage, listRoomMessages } from "@/lib/chat";
import { resetDb } from "./helpers";

async function makeUser(email: string) {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}

async function scene() {
  const owner = await makeUser("chat-task-owner@example.com");
  const team = await createTeam(owner.id, "设计小组");
  const member = await makeUser("chat-task-member@example.com");
  await joinTeam(member.id, team.inviteCode);
  const outsider = await makeUser("chat-task-outsider@example.com");
  const project = await createProject(owner.id, team.id, { name: "课程展示" });
  const room = await getOrCreateGroupRoom(owner.id, project.id);
  const message = await sendMessage(member.id, room.id, "下周前完成用户调研\n整理 5 份访谈记录");
  return { owner, member, outsider, project, room, message };
}

describe("chat message task conversion", () => {
  beforeEach(resetDb);

  it("creates a task with its source, assignee and due date, then exposes the link in chat", async () => {
    const { owner, member, project, room, message } = await scene();
    const task = await createTaskFromGroupMessage(owner.id, message.id, {
      title: "下周前完成用户调研",
      assigneeIds: [member.id],
      dueDate: "2026-11-20",
    });

    expect(task).toMatchObject({ projectId: project.id, sourceMessageId: message.id, assigneeId: member.id, dueDate: "2026-11-20" });
    await expect(createTaskFromGroupMessage(owner.id, message.id, { title: "重复转换" })).rejects.toThrow("已经转为任务");
    const messages = await listRoomMessages(owner.id, room.id);
    expect(messages.find((item) => item.id === message.id)).toMatchObject({ taskId: task.id, taskProjectId: project.id });
  });

  it("rejects non-members and private messages", async () => {
    const { owner, outsider, member, message } = await scene();
    await expect(createTaskFromGroupMessage(outsider.id, message.id, { title: "越权" })).rejects.toThrow("没有权限");

    const dm = await getOrCreateDmRoom(owner.id, member.id);
    const privateMessage = await sendMessage(member.id, dm.id, "私聊内容");
    await expect(createTaskFromGroupMessage(owner.id, privateMessage.id, { title: "私聊任务" })).rejects.toThrow("只能将项目群聊消息转为任务");
  });

  it("rejects an assignee who is outside the team", async () => {
    const { owner, outsider, message } = await scene();
    await expect(createTaskFromGroupMessage(owner.id, message.id, {
      title: "无效负责人",
      assigneeIds: [outsider.id],
    })).rejects.toThrow("负责人不是团队成员");
  });
});
