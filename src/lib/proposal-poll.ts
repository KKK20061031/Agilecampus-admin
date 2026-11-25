import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  proposalComments,
  proposalOptions,
  proposalPolls,
  proposalVotes,
  users,
  type ProposalCategory,
  type ProposalPollStatus,
} from "@/db/schema";
import { AppError, ForbiddenError } from "./errors";
import { getTeamMembership } from "./team";
import { notifyTeamMembers } from "./notification";

export const PROPOSAL_CATEGORY_LABELS: Record<ProposalCategory, string> = {
  topic: "选题",
  design: "设计稿",
  technical: "技术方案",
};

const referenceUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => !value || /^https?:\/\//i.test(value), "参考链接必须以 http:// 或 https:// 开头");

const proposalOptionSchema = z.object({
  label: z.string().trim().min(1, "请填写选项名称").max(100),
  description: z.string().trim().max(500).optional().default(""),
});

export const createProposalPollSchema = z.object({
  title: z.string().trim().min(1, "请填写投票主题").max(140),
  category: z.enum(["topic", "design", "technical"]),
  description: z.string().trim().max(5000).optional().default(""),
  referenceUrl: referenceUrlSchema.optional().default(""),
  closesAt: z.iso.datetime({ offset: true }).nullable().optional(),
  options: z.array(proposalOptionSchema).min(2, "至少提供两个选项").max(8, "最多提供八个选项"),
});

export const castProposalVoteSchema = z.object({
  optionId: z.uuid(),
});

export const closeProposalPollSchema = z.object({
  finalOptionId: z.uuid().nullable().optional(),
});

export const proposalCommentSchema = z.object({
  content: z.string().trim().min(1, "请填写评审意见").max(2000),
});

type PollState = {
  status: ProposalPollStatus;
  closesAt: Date | null;
};

export function isProposalPollOpen(poll: PollState, now = new Date()) {
  return poll.status === "open" && (!poll.closesAt || poll.closesAt.getTime() > now.getTime());
}

function assertPollOpen(poll: PollState) {
  if (poll.status !== "open") throw new AppError("该投票已结束");
  if (poll.closesAt && poll.closesAt.getTime() <= Date.now()) {
    throw new AppError("该投票已截止");
  }
}

async function requireProposalPoll(actorId: string, pollId: string) {
  const [poll] = await db.select().from(proposalPolls).where(eq(proposalPolls.id, pollId));
  if (!poll) throw new AppError("投票不存在");
  const member = await getTeamMembership(actorId, poll.teamId);
  if (!member) throw new ForbiddenError();
  return { poll, member };
}

function assertPollManager(actorId: string, poll: { createdById: string | null }, role: string) {
  if (poll.createdById !== actorId && role !== "admin") {
    throw new ForbiddenError("只有投票发起人或组长可以管理该投票");
  }
}

export async function listTeamProposalPolls(actorId: string, teamId: string) {
  if (!(await getTeamMembership(actorId, teamId))) throw new ForbiddenError();

  const polls = await db
    .select({
      id: proposalPolls.id,
      teamId: proposalPolls.teamId,
      createdById: proposalPolls.createdById,
      creatorName: users.name,
      title: proposalPolls.title,
      category: proposalPolls.category,
      description: proposalPolls.description,
      referenceUrl: proposalPolls.referenceUrl,
      closesAt: proposalPolls.closesAt,
      status: proposalPolls.status,
      finalOptionId: proposalPolls.finalOptionId,
      finalOptionLabel: proposalPolls.finalOptionLabel,
      decidedById: proposalPolls.decidedById,
      decidedAt: proposalPolls.decidedAt,
      createdAt: proposalPolls.createdAt,
      updatedAt: proposalPolls.updatedAt,
    })
    .from(proposalPolls)
    .leftJoin(users, eq(proposalPolls.createdById, users.id))
    .where(eq(proposalPolls.teamId, teamId))
    .orderBy(
      sql`case when ${proposalPolls.status} = 'open' then 0 else 1 end`,
      asc(proposalPolls.closesAt),
      desc(proposalPolls.createdAt),
    );

  if (polls.length === 0) return [];
  const pollIds = polls.map((poll) => poll.id);
  const [options, votes, comments] = await Promise.all([
    db
      .select({
        id: proposalOptions.id,
        pollId: proposalOptions.pollId,
        label: proposalOptions.label,
        description: proposalOptions.description,
        position: proposalOptions.position,
      })
      .from(proposalOptions)
      .where(inArray(proposalOptions.pollId, pollIds))
      .orderBy(asc(proposalOptions.position)),
    db
      .select({
        pollId: proposalVotes.pollId,
        optionId: proposalVotes.optionId,
        voterId: proposalVotes.voterId,
      })
      .from(proposalVotes)
      .where(inArray(proposalVotes.pollId, pollIds)),
    db
      .select({
        id: proposalComments.id,
        pollId: proposalComments.pollId,
        authorId: proposalComments.authorId,
        authorName: users.name,
        content: proposalComments.content,
        createdAt: proposalComments.createdAt,
      })
      .from(proposalComments)
      .leftJoin(users, eq(proposalComments.authorId, users.id))
      .where(inArray(proposalComments.pollId, pollIds))
      .orderBy(asc(proposalComments.createdAt)),
  ]);

  const optionsByPoll = new Map<string, typeof options>();
  for (const option of options) {
    optionsByPoll.set(option.pollId, [...(optionsByPoll.get(option.pollId) ?? []), option]);
  }
  const commentsByPoll = new Map<string, typeof comments>();
  for (const comment of comments) {
    commentsByPoll.set(comment.pollId, [
      ...(commentsByPoll.get(comment.pollId) ?? []),
      comment,
    ]);
  }
  const voteCountByOption = new Map<string, number>();
  const myVoteByPoll = new Map<string, string>();
  for (const vote of votes) {
    voteCountByOption.set(vote.optionId, (voteCountByOption.get(vote.optionId) ?? 0) + 1);
    if (vote.voterId === actorId) myVoteByPoll.set(vote.pollId, vote.optionId);
  }

  return polls.map((poll) => {
    const pollOptions = (optionsByPoll.get(poll.id) ?? []).map((option) => ({
      ...option,
      voteCount: voteCountByOption.get(option.id) ?? 0,
    }));
    return {
      ...poll,
      effectiveOpen: isProposalPollOpen(poll),
      myOptionId: myVoteByPoll.get(poll.id) ?? null,
      totalVotes: pollOptions.reduce((total, option) => total + option.voteCount, 0),
      options: pollOptions,
      comments: commentsByPoll.get(poll.id) ?? [],
    };
  });
}

export async function createProposalPoll(actorId: string, teamId: string, input: unknown) {
  const data = createProposalPollSchema.parse(input);
  if (!(await getTeamMembership(actorId, teamId))) throw new ForbiddenError();

  const closesAt = data.closesAt ? new Date(data.closesAt) : null;
  if (closesAt && Number.isNaN(closesAt.getTime())) throw new AppError("截止时间无效");
  if (closesAt && closesAt.getTime() <= Date.now()) {
    throw new AppError("截止时间必须晚于当前时间");
  }

  const normalizedOptions = data.options.map((option) => ({
    label: option.label.trim(),
    description: option.description?.trim() ?? "",
  }));
  const labels = normalizedOptions.map((option) => option.label.toLocaleLowerCase());
  if (new Set(labels).size !== labels.length) throw new AppError("选项名称不能重复");

  const result = await db.transaction(async (tx) => {
    const [poll] = await tx
      .insert(proposalPolls)
      .values({
        teamId,
        createdById: actorId,
        title: data.title,
        category: data.category,
        description: data.description,
        referenceUrl: data.referenceUrl || null,
        closesAt,
      })
      .returning();
    const options = await tx
      .insert(proposalOptions)
      .values(
        normalizedOptions.map((option, position) => ({
          pollId: poll.id,
          label: option.label,
          description: option.description,
          position,
        })),
      )
      .returning();
    return { poll, options };
  });

  // 投票发布 → 通知团队全员（截至时间若有则一并提示），发起人本人已读
  const [actor] = await db.select({ name: users.name }).from(users).where(eq(users.id, actorId));
  await notifyTeamMembers({
    teamId,
    actorId,
    title: "新群投票",
    content: `${actor?.name ?? "有人"} 发起了${PROPOSAL_CATEGORY_LABELS[data.category]}投票「${data.title}」${
      closesAt ? `，截止 ${closesAt.toLocaleString("zh-CN")}` : ""
    }`,
    type: "poll_created",
    linkUrl: `/teams/${teamId}/votes`,
  });

  return result;
}

export async function castProposalVote(actorId: string, pollId: string, input: unknown) {
  const data = castProposalVoteSchema.parse(input);
  const { poll } = await requireProposalPoll(actorId, pollId);
  assertPollOpen(poll);

  const [option] = await db
    .select({ id: proposalOptions.id })
    .from(proposalOptions)
    .where(and(eq(proposalOptions.id, data.optionId), eq(proposalOptions.pollId, pollId)));
  if (!option) throw new AppError("所选选项不属于该投票");

  const [vote] = await db
    .insert(proposalVotes)
    .values({ pollId, optionId: data.optionId, voterId: actorId })
    .onConflictDoUpdate({
      target: [proposalVotes.pollId, proposalVotes.voterId],
      set: { optionId: data.optionId, updatedAt: new Date() },
    })
    .returning();
  return vote;
}

export async function closeProposalPoll(actorId: string, pollId: string, input: unknown) {
  const data = closeProposalPollSchema.parse(input);
  const { poll, member } = await requireProposalPoll(actorId, pollId);
  assertPollManager(actorId, poll, member.role);
  if (poll.status === "closed") throw new AppError("该投票已经结束");

  let finalOptionLabel: string | null = null;
  if (data.finalOptionId) {
    const [option] = await db
      .select({ label: proposalOptions.label })
      .from(proposalOptions)
      .where(and(eq(proposalOptions.id, data.finalOptionId), eq(proposalOptions.pollId, pollId)));
    if (!option) throw new AppError("最终方案不属于该投票");
    finalOptionLabel = option.label;
  }

  const now = new Date();
  const [updated] = await db
    .update(proposalPolls)
    .set({
      status: "closed",
      finalOptionId: data.finalOptionId ?? null,
      finalOptionLabel,
      decidedById: actorId,
      decidedAt: now,
      updatedAt: now,
    })
    .where(eq(proposalPolls.id, pollId))
    .returning();
  return updated;
}

export async function deleteProposalPoll(actorId: string, pollId: string) {
  const { poll, member } = await requireProposalPoll(actorId, pollId);
  assertPollManager(actorId, poll, member.role);
  await db.delete(proposalPolls).where(eq(proposalPolls.id, pollId));
}

export async function addProposalComment(actorId: string, pollId: string, input: unknown) {
  const data = proposalCommentSchema.parse(input);
  await requireProposalPoll(actorId, pollId);
  const [comment] = await db
    .insert(proposalComments)
    .values({ pollId, authorId: actorId, content: data.content })
    .returning();
  return comment;
}

export async function deleteProposalComment(actorId: string, commentId: string) {
  const [comment] = await db
    .select({
      id: proposalComments.id,
      pollId: proposalComments.pollId,
      authorId: proposalComments.authorId,
    })
    .from(proposalComments)
    .where(eq(proposalComments.id, commentId));
  if (!comment) throw new AppError("评审意见不存在");
  const { poll, member } = await requireProposalPoll(actorId, comment.pollId);
  if (
    comment.authorId !== actorId
    && poll.createdById !== actorId
    && member.role !== "admin"
  ) {
    throw new ForbiddenError("只有意见作者、投票发起人或组长可以删除该意见");
  }
  await db.delete(proposalComments).where(eq(proposalComments.id, commentId));
}

export async function getProposalPollTeamId(pollId: string) {
  const [poll] = await db
    .select({ teamId: proposalPolls.teamId })
    .from(proposalPolls)
    .where(eq(proposalPolls.id, pollId));
  if (!poll) throw new AppError("投票不存在");
  return poll.teamId;
}

export async function getProposalCommentPollId(commentId: string) {
  const [comment] = await db
    .select({ pollId: proposalComments.pollId })
    .from(proposalComments)
    .where(eq(proposalComments.id, commentId));
  if (!comment) throw new AppError("评审意见不存在");
  return comment.pollId;
}
