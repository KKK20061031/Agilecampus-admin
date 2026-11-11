import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { teamDecisions, users } from "@/db/schema";
import { AppError, ForbiddenError } from "./errors";
import { getTeamMembership } from "./team";

// 小组决策记录：记录“最终采用哪个方案、谁确认、何时确认”。
// 权限口径与会议模块一致：
// - 所有成员可查看、可创建决策记录；
// - 编辑 / 删除 / 确认限“创建者本人或组长”，确认人落在 confirmedById，确认时间落在 confirmedAt。
const decisionFields = {
  title: z.string().trim().min(1, "请填写决策主题").max(140),
  context: z.string().trim().max(5000).optional().default(""),
  finalOption: z.string().trim().min(1, "请填写最终采用的方案").max(2000),
};

export const createDecisionSchema = z.object(decisionFields);
export const updateDecisionSchema = z.object({
  title: decisionFields.title.optional(),
  context: decisionFields.context,
  finalOption: decisionFields.finalOption.optional(),
});

async function requireDecision(actorId: string, decisionId: string) {
  const [decision] = await db.select().from(teamDecisions).where(eq(teamDecisions.id, decisionId));
  if (!decision) throw new AppError("决策记录不存在");
  const member = await getTeamMembership(actorId, decision.teamId);
  if (!member) throw new ForbiddenError();
  return { decision, member };
}

function requireDecisionManager(actorId: string, decision: { createdById: string | null }, role: string) {
  if (decision.createdById !== actorId && role !== "admin") {
    throw new ForbiddenError("只有决策记录创建者或组长可以管理该记录");
  }
}

export async function listTeamDecisions(actorId: string, teamId: string) {
  if (!(await getTeamMembership(actorId, teamId))) throw new ForbiddenError();
  return db.select({
    id: teamDecisions.id,
    teamId: teamDecisions.teamId,
    createdById: teamDecisions.createdById,
    creatorName: users.name,
    title: teamDecisions.title,
    context: teamDecisions.context,
    finalOption: teamDecisions.finalOption,
    status: teamDecisions.status,
    confirmedById: teamDecisions.confirmedById,
    confirmedAt: teamDecisions.confirmedAt,
    createdAt: teamDecisions.createdAt,
    updatedAt: teamDecisions.updatedAt,
  }).from(teamDecisions)
    .leftJoin(users, eq(teamDecisions.createdById, users.id))
    .where(eq(teamDecisions.teamId, teamId))
    .orderBy(desc(teamDecisions.createdAt));
}

export async function createTeamDecision(actorId: string, teamId: string, input: unknown) {
  const data = createDecisionSchema.parse(input);
  if (!(await getTeamMembership(actorId, teamId))) throw new ForbiddenError();
  const [decision] = await db.insert(teamDecisions).values({
    teamId,
    createdById: actorId,
    title: data.title,
    context: data.context,
    finalOption: data.finalOption,
  }).returning();
  return decision;
}

export async function updateTeamDecision(actorId: string, decisionId: string, input: unknown) {
  const data = updateDecisionSchema.parse(input);
  const { decision, member } = await requireDecision(actorId, decisionId);
  requireDecisionManager(actorId, decision, member.role);
  const [updated] = await db.update(teamDecisions).set({
    ...(data.title !== undefined && { title: data.title }),
    ...(data.context !== undefined && { context: data.context }),
    ...(data.finalOption !== undefined && { finalOption: data.finalOption }),
    updatedAt: new Date(),
  }).where(eq(teamDecisions.id, decisionId)).returning();
  return updated;
}

// 确认决策：写入“谁确认（confirmedById）、何时确认（confirmedAt）”。
export async function confirmTeamDecision(actorId: string, decisionId: string) {
  const { decision, member } = await requireDecision(actorId, decisionId);
  requireDecisionManager(actorId, decision, member.role);
  if (decision.status === "confirmed") throw new AppError("该决策已确认，无需重复确认");
  const [updated] = await db.update(teamDecisions).set({
    status: "confirmed",
    confirmedById: actorId,
    confirmedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(teamDecisions.id, decisionId)).returning();
  return updated;
}

export async function deleteTeamDecision(actorId: string, decisionId: string) {
  const { decision, member } = await requireDecision(actorId, decisionId);
  requireDecisionManager(actorId, decision, member.role);
  await db.delete(teamDecisions).where(eq(teamDecisions.id, decisionId));
}

export async function getDecisionTeamId(decisionId: string) {
  const [decision] = await db.select({ teamId: teamDecisions.teamId }).from(teamDecisions).where(eq(teamDecisions.id, decisionId));
  if (!decision) throw new AppError("决策记录不存在");
  return decision.teamId;
}
