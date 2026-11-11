import { eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { teams, users } from "@/db/schema";
import { getTeamMembership } from "@/lib/team";
import { listTeamDecisions } from "@/lib/decision";
import { BackButton } from "@/components/back-button";
import { DecisionForm } from "./decision-form";
import { confirmDecisionAction, deleteDecisionAction } from "./actions";

function formatDecisionTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function TeamDecisionsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!z.uuid().safeParse(teamId).success) notFound();
  const membership = await getTeamMembership(session.user.id, teamId);
  if (!membership) notFound();

  const [[team], decisions] = await Promise.all([
    db.select().from(teams).where(eq(teams.id, teamId)),
    listTeamDecisions(session.user.id, teamId),
  ]);
  if (!team) notFound();

  // 确认人姓名：按 confirmedById 精确查询
  const confirmedByIds = [...new Set(decisions.map((d) => d.confirmedById).filter((id): id is string => Boolean(id)))];
  const confirmerMap = new Map<string, string>();
  if (confirmedByIds.length > 0) {
    const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, confirmedByIds));
    for (const row of rows) confirmerMap.set(row.id, row.name);
  }

  return <main className="mx-auto max-w-4xl space-y-6">
    <header className="space-y-3">
      <BackButton fallbackHref={`/teams/${teamId}`} label="返回团队" />
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{team.name} · 决策记录</h1>
        <p className="mt-1 text-sm text-ink-soft">记录每个决策最终采用哪个方案、谁确认、何时确认。</p>
      </div>
    </header>

    <section className="ac-card p-4 sm:p-5">
      <h2 className="mb-4 font-display text-lg font-semibold text-ink">新增决策记录</h2>
      <DecisionForm teamId={teamId} />
    </section>

    <section className="space-y-4" aria-label="决策记录列表">
      <h2 className="font-display text-lg font-semibold text-ink">决策记录（{decisions.length}）</h2>
      {decisions.length === 0 ? <div className="ac-card p-8 text-center text-sm text-ink-soft">还没有决策记录，把小组敲定的第一个决策记下来吧。</div> :
        decisions.map((decision) => {
          const canManage = decision.createdById === session.user.id || membership.role === "admin";
          const confirmed = decision.status === "confirmed";
          return <article key={decision.id} className="ac-card space-y-4 p-4 sm:p-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-lg font-semibold text-ink">{decision.title}</h3>
                <p className="mt-1 text-sm text-ink-soft">记录人：{decision.creatorName ?? "已退出的成员"} · {formatDecisionTime(decision.createdAt)}</p>
              </div>
              <span className={confirmed
                ? "rounded-full bg-done/10 px-3 py-1 text-xs font-medium text-done"
                : "rounded-full bg-sunken px-3 py-1 text-xs font-medium text-ink-soft"}>
                {confirmed ? "已确认" : "待确认"}
              </span>
            </header>

            {decision.context && <section className="rounded bg-sunken/60 p-3">
              <h4 className="mb-1 text-xs font-semibold text-ink-soft">背景与候选方案</h4>
              <p className="whitespace-pre-wrap text-sm text-ink">{decision.context}</p>
            </section>}

            <section className="rounded bg-primary/5 p-3">
              <h4 className="mb-1 text-xs font-semibold text-ink-soft">最终采用的方案</h4>
              <p className="whitespace-pre-wrap text-sm font-medium text-ink">{decision.finalOption}</p>
            </section>

            <section className="rounded bg-sunken/60 p-3 text-sm">
              {confirmed
                ? <p className="text-ink">确认人：<span className="font-medium">{confirmerMap.get(decision.confirmedById ?? "") ?? "已退出的成员"}</span> · 确认时间：{decision.confirmedAt ? formatDecisionTime(decision.confirmedAt) : "—"}</p>
                : <p className="text-ink-soft">尚无人确认此决策。</p>}
            </section>

            {canManage && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
              {!confirmed && <form action={confirmDecisionAction}>
                <input type="hidden" name="decisionId" value={decision.id} />
                <button className="ac-btn">确认此决策</button>
              </form>}
              {confirmed
                ? <span className="text-xs text-ink-faint">确认后记录不可再确认；如需修改方案请编辑后说明。</span>
                : null}
              <details className="w-full">
                <summary className="cursor-pointer text-right text-sm text-primary">编辑或删除…</summary>
                <div className="mt-2 min-w-[min(24rem,calc(100vw-3rem))] rounded border border-line bg-surface p-3">
                  <DecisionForm teamId={teamId} decision={{
                    id: decision.id,
                    title: decision.title,
                    context: decision.context,
                    finalOption: decision.finalOption,
                  }} />
                  <details className="mt-3 border-t border-line pt-3">
                    <summary className="cursor-pointer text-right text-xs text-high">删除该决策记录…</summary>
                    <form action={deleteDecisionAction} className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <input type="hidden" name="decisionId" value={decision.id} />
                      <span className="text-ink-soft">删除后不可恢复。</span>
                      <button className="ac-btn-ghost text-high">确认删除</button>
                    </form>
                  </details>
                </div>
              </details>
            </footer>}
          </article>;
        })}
    </section>
  </main>;
}
