import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teamDecisions } from "@/db/schema";
import { createUser } from "@/lib/user";
import { createTeam, joinTeam } from "@/lib/team";
import {
  confirmTeamDecision,
  createTeamDecision,
  deleteTeamDecision,
  listTeamDecisions,
  updateTeamDecision,
} from "@/lib/decision";
import { AppError, ForbiddenError } from "@/lib/errors";
import { resetDb } from "./helpers";

async function makeUser(label: string) {
  return createUser({
    email: `${label}-${crypto.randomUUID()}@test.dev`,
    password: "Password123!",
    name: label,
  });
}

async function scene() {
  const admin = await makeUser("组长");
  const member = await makeUser("成员");
  const outsider = await makeUser("路人");
  const team = await createTeam(admin.id, "决策记录测试组");
  await joinTeam(member.id, team.inviteCode);
  const decision = await createTeamDecision(member.id, team.id, {
    title: "课题技术选型",
    context: "候选 A：自研实现；候选 B：采用现成框架",
    finalOption: "采用方案 B，理由是开发周期更短",
  });
  return { admin, member, outsider, team, decision };
}

describe("小组决策记录", () => {
  beforeEach(resetDb);

  it("成员可创建决策记录，默认待确认；组内成员可查看，非成员不能访问", async () => {
    const { member, outsider, team, decision } = await scene();
    expect(decision.status).toBe("pending");
    expect(decision.confirmedById).toBeNull();
    expect(decision.confirmedAt).toBeNull();

    const list = await listTeamDecisions(member.id, team.id);
    expect(list).toHaveLength(1);
    expect(list[0].finalOption).toContain("方案 B");

    await expect(listTeamDecisions(outsider.id, team.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("确认决策会记录“谁确认、何时确认”", async () => {
    const { admin, decision } = await scene();
    const confirmed = await confirmTeamDecision(admin.id, decision.id);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmedById).toBe(admin.id);
    expect(confirmed.confirmedAt).toBeInstanceOf(Date);
  });

  it("重复确认报错；普通成员不能确认他人的记录，组长可以", async () => {
    const { admin, member, decision } = await scene();
    await expect(confirmTeamDecision(member.id, decision.id)).rejects.toBeInstanceOf(ForbiddenError);
    await confirmTeamDecision(admin.id, decision.id);
    await expect(confirmTeamDecision(admin.id, decision.id)).rejects.toBeInstanceOf(AppError);
  });

  it("非成员无法创建、更新、确认或删除决策记录", async () => {
    const { outsider, team, decision } = await scene();
    await expect(createTeamDecision(outsider.id, team.id, { title: "x", finalOption: "y" }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateTeamDecision(outsider.id, decision.id, { finalOption: "改" }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(confirmTeamDecision(outsider.id, decision.id))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteTeamDecision(outsider.id, decision.id))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it("创建者可编辑最终方案，组长可删除记录", async () => {
    const { admin, member, decision } = await scene();
    const updated = await updateTeamDecision(member.id, decision.id, { finalOption: "改为采用方案 A" });
    expect(updated.finalOption).toBe("改为采用方案 A");

    await expect(updateTeamDecision(admin.id, decision.id, { title: "组长改标题" })).resolves.toBeTruthy();
    await expect(updateTeamDecision(member.id, decision.id, { context: undefined })).resolves.toBeTruthy();

    await deleteTeamDecision(admin.id, decision.id);
    const [gone] = await db.select().from(teamDecisions).where(eq(teamDecisions.id, decision.id));
    expect(gone).toBeUndefined();
  });
});
