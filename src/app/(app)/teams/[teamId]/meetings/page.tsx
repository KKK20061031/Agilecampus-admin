import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { getTeamMembership, listTeamMembers } from "@/lib/team";
import { listTeamMeetings } from "@/lib/meeting";
import { BackButton } from "@/components/back-button";
import { MeetingForm } from "./meeting-form";
import { ActionItemCard, CreateActionItemForm } from "./action-items";
import { deleteMeetingAction } from "./actions";

function formatMeetingTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function TeamMeetingsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!z.uuid().safeParse(teamId).success) notFound();
  const membership = await getTeamMembership(session.user.id, teamId);
  if (!membership) notFound();

  const [[team], members, meetings] = await Promise.all([
    db.select().from(teams).where(eq(teams.id, teamId)),
    listTeamMembers(teamId),
    listTeamMeetings(session.user.id, teamId),
  ]);
  if (!team) notFound();
  const actionMembers = members.map(({ id, name }) => ({ id, name }));

  return <main className="mx-auto max-w-4xl space-y-6">
    <header className="space-y-3">
      <BackButton fallbackHref={`/teams/${teamId}`} label="返回团队" />
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{team.name} · 会议与行动项</h1>
        <p className="mt-1 text-sm text-ink-soft">记录议程与会议结论，把后续任务分配给成员并跟踪完成情况。</p>
      </div>
    </header>

    <section className="ac-card p-4 sm:p-5">
      <h2 className="mb-4 font-display text-lg font-semibold text-ink">安排会议</h2>
      <MeetingForm teamId={teamId} />
    </section>

    <section className="space-y-4" aria-label="会议记录">
      <h2 className="font-display text-lg font-semibold text-ink">会议记录（{meetings.length}）</h2>
      {meetings.length === 0 ? <div className="ac-card p-8 text-center text-sm text-ink-soft">还没有会议记录，安排第一次团队会议吧。</div> :
        meetings.map((meeting) => {
          const canManageMeeting = meeting.createdById === session.user.id || membership.role === "admin";
          const openCount = meeting.actionItems.filter((item) => item.status === "open").length;
          return <article key={meeting.id} className="ac-card space-y-4 p-4 sm:p-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-lg font-semibold text-ink">{meeting.title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{formatMeetingTime(meeting.startsAt, meeting.timeZone)} · {meeting.creatorName ?? "已退出的成员"}</p>
                {meeting.location && <p className="mt-1 break-all text-sm text-ink-soft">地点 / 链接：{meeting.location}</p>}
                <p className="mt-1 text-xs text-ink-faint">{meeting.actionItems.length} 项行动 · {openCount} 项待完成</p>
              </div>
              {canManageMeeting && <details className="shrink-0">
                <summary className="cursor-pointer text-sm text-primary">管理会议</summary>
                <div className="mt-2 min-w-[min(24rem,calc(100vw-3rem))] rounded border border-line bg-surface p-3">
                  <MeetingForm teamId={teamId} meeting={meeting} />
                  <details className="mt-3 border-t border-line pt-3">
                    <summary className="cursor-pointer text-right text-xs text-high">删除会议及其行动项…</summary>
                    <form action={deleteMeetingAction} className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <input type="hidden" name="meetingId" value={meeting.id} />
                      <span className="text-ink-soft">此操作会一并删除会议下的行动项。</span>
                      <button className="ac-btn-ghost text-high">确认删除</button>
                    </form>
                  </details>
                </div>
              </details>}
            </header>

            <div className="grid gap-3 sm:grid-cols-2">
              <section className="rounded bg-sunken/60 p-3">
                <h4 className="mb-1 text-xs font-semibold text-ink-soft">议程</h4>
                <p className="whitespace-pre-wrap text-sm text-ink">{meeting.agenda || "暂无议程"}</p>
              </section>
              <section className="rounded bg-sunken/60 p-3">
                <h4 className="mb-1 text-xs font-semibold text-ink-soft">会议纪要</h4>
                <p className="whitespace-pre-wrap text-sm text-ink">{meeting.minutes || "暂无纪要"}</p>
              </section>
            </div>

            <section className="space-y-3 border-t border-line pt-4">
              <h4 className="text-sm font-semibold text-ink">行动项</h4>
              {meeting.actionItems.length > 0 && <ul className="space-y-2">
                {meeting.actionItems.map((item) => <ActionItemCard key={item.id} item={item} members={actionMembers}
                  canManage={item.createdById === session.user.id || canManageMeeting || membership.role === "admin"}
                  canToggle={item.assigneeId === session.user.id || item.createdById === session.user.id || canManageMeeting || membership.role === "admin"} />)}
              </ul>}
              <CreateActionItemForm meetingId={meeting.id} members={actionMembers} />
            </section>
          </article>;
        })}
    </section>
  </main>;
}
