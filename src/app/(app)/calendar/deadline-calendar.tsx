"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { listCalendarItems } from "@/lib/calendar";
import { scopedHref } from "@/lib/workbench-navigation";

type CalendarData = Awaited<ReturnType<typeof listCalendarItems>>;
type Assignment = CalendarData["assignments"][number];
type Item = { id: string; kind: "course" | "project"; date: string; time: string;
  title: string; source: string; completed: boolean; projectId?: string; assignment?: Assignment };
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const subscribe = () => () => {};

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function localDate(key: string) { return new Date(`${key}T12:00:00`); }
function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function dateTimeInput(date: string) {
  const d = new Date(date);
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function gridDays(selected: string, mode: "month" | "week") {
  const day = localDate(selected);
  const start = new Date(day);
  if (mode === "month") start.setDate(1);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const count = mode === "week" ? 7 : Math.ceil((new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate() +
    (new Date(day.getFullYear(), day.getMonth(), 1).getDay() + 6) % 7) / 7) * 7;
  return Array.from({ length: count }, (_, i) => dayKey(addDays(start, i)));
}

export function DeadlineCalendar({ initial, teamId, focusedAssignment }: {
  initial: CalendarData; teamId: string | null; focusedAssignment: string | null;
}) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [assignments, setAssignments] = useState(initial.assignments);
  const [mode, setMode] = useState<"month" | "week">("month");
  const [selected, setSelected] = useState(() => {
    const focused = initial.assignments.find((item) => item.id === focusedAssignment);
    return focused ? dayKey(new Date(focused.dueAt)) : dayKey(new Date());
  });
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Assignment | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = dayKey(new Date());

  const items = useMemo<Item[]>(() => [
    ...assignments.map((assignment) => {
      const due = new Date(assignment.dueAt);
      return { id: assignment.id, kind: "course" as const, date: dayKey(due),
        time: due.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
        title: assignment.title, source: assignment.courseName,
        completed: !!assignment.completedAt, assignment };
    }),
    ...initial.tasks.filter((task) => task.date).map((task) => ({
      id: task.id, kind: "project" as const, date: task.date!, time: "当天",
      title: task.title, source: `${task.teamName} / ${task.projectName}`,
      completed: task.status === "done", projectId: task.projectId,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)), [assignments, initial.tasks]);
  const courses = [...new Set(assignments.map((item) => item.courseName))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const visible = items.filter((item) => filter === "all" ||
    (filter === "project" ? item.kind === "project" : item.kind === "course" && item.source === filter));
  const byDay = new Map<string, Item[]>();
  for (const item of visible) byDay.set(item.date, [...(byDay.get(item.date) ?? []), item]);
  const days = gridDays(selected, mode);
  const selectedItems = byDay.get(selected) ?? [];
  const overdue = visible.filter((item) => !item.completed && item.date < today).length;
  const coming = visible.filter((item) => !item.completed && item.date >= today && item.date <= dayKey(addDays(localDate(today), 7))).length;

  function move(direction: number) {
    const current = localDate(selected);
    if (mode === "month") {
      const day = current.getDate();
      current.setDate(1);
      current.setMonth(current.getMonth() + direction);
      current.setDate(Math.min(day, new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()));
      setSelected(dayKey(current));
    } else setSelected(dayKey(addDays(current, direction * 7)));
  }

  async function save(form: HTMLFormElement) {
    const data = new FormData(form);
    const rawDate = String(data.get("dueAt") ?? "");
    const due = new Date(rawDate);
    if (!rawDate || Number.isNaN(due.getTime())) { setError("请选择有效的截止时间"); return; }
    const body = { courseName: data.get("courseName"), title: data.get("title"), details: data.get("details"),
      dueAt: due.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      remindDays: [7, 3, 1].filter((n) => data.get(`remind${n}`) === "on") };
    setBusy(true); setError(null);
    try {
      const current = editing;
      const res = await fetch(current === "new" ? "/api/calendar/assignments" : `/api/calendar/assignments/${current?.id}`, {
        method: current === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current === "new" ? body : { kind: "edit", ...body }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "保存失败");
      const next = result.assignment as Assignment;
      setAssignments((list) => current === "new" ? [...list, next] : list.map((item) => item.id === next.id ? next : item));
      setSelected(dayKey(new Date(next.dueAt)));
      setEditing(null);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "网络异常，请重试"); }
    finally { setBusy(false); }
  }

  async function change(assignment: Assignment, action: "complete" | "delete") {
    if (action === "delete" && !window.confirm(`删除作业“${assignment.title}”？`)) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/calendar/assignments/${assignment.id}`, action === "delete"
        ? { method: "DELETE" }
        : { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "complete", completed: !assignment.completedAt }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "操作失败");
      setAssignments((list) => action === "delete" ? list.filter((item) => item.id !== assignment.id)
        : list.map((item) => item.id === assignment.id ? result.assignment : item));
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "网络异常，请重试"); }
    finally { setBusy(false); }
  }

  if (!hydrated) return <main className="mx-auto max-w-6xl" aria-busy="true" />;

  return <main className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-display text-2xl font-semibold text-ink">截止日历</h1>
        <p className="mt-1 text-sm text-ink-soft">{coming} 项未来 7 天到期 · {overdue} 项已逾期</p></div>
      <button type="button" onClick={() => { setEditing("new"); setError(null); }} className="ac-btn">添加课程作业</button>
    </header>

    <nav aria-label="小组筛选" className="flex flex-wrap gap-2 text-sm">
      <Link href="/calendar" aria-current={!teamId ? "page" : undefined} className={!teamId ? "font-semibold text-primary" : "text-ink-soft hover:text-primary"}>全部小组</Link>
      {initial.teams.map((team) => <Link key={team.id} href={`/calendar?team=${team.id}`}
        aria-current={teamId === team.id ? "page" : undefined}
        className={teamId === team.id ? "font-semibold text-primary" : "text-ink-soft hover:text-primary"}>{team.name}</Link>)}
    </nav>

    <div className="flex flex-wrap items-center gap-2 border-y border-line py-3">
      <label htmlFor="calendar-filter" className="text-sm text-ink-soft">查看</label>
      <select id="calendar-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="ac-field w-auto min-w-32 text-sm">
        <option value="all">全部截止</option><option value="project">小组任务</option>
        {courses.map((course) => <option key={course} value={course}>{course}</option>)}
      </select>
      <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={() => move(-1)} aria-label="上一页" title="上一页" className="grid h-9 w-9 place-items-center rounded border border-line text-ink hover:bg-sunken">‹</button>
        <button type="button" onClick={() => setSelected(today)} className="px-2 text-sm text-primary">今天</button>
        <button type="button" onClick={() => move(1)} aria-label="下一页" title="下一页" className="grid h-9 w-9 place-items-center rounded border border-line text-ink hover:bg-sunken">›</button>
      </div>
      <div className="flex rounded border border-line p-0.5 text-sm">
        {(["month", "week"] as const).map((value) => <button key={value} type="button" onClick={() => setMode(value)}
          aria-pressed={mode === value} className={`min-w-11 rounded px-2 py-1 ${mode === value ? "bg-primary text-white" : "text-ink-soft"}`}>{value === "month" ? "月" : "周"}</button>)}
      </div>
    </div>

    <div className="text-base font-semibold text-ink">{localDate(selected).toLocaleDateString("zh-CN", { year: "numeric", month: "long" })}</div>
    <section aria-label="截止日历" className="overflow-hidden border border-line">
      <div className="grid grid-cols-7 bg-sunken text-center text-xs text-ink-soft">{WEEKDAYS.map((day) => <div key={day} className="py-2">周{day}</div>)}</div>
      <div className="grid grid-cols-7">
        {days.map((date) => {
          const dayItems = byDay.get(date) ?? [];
          const otherMonth = mode === "month" && localDate(date).getMonth() !== localDate(selected).getMonth();
          return <button key={date} type="button" onClick={() => setSelected(date)}
            aria-label={`${date}，${dayItems.length} 项截止`} aria-pressed={date === selected}
            className={`min-h-16 min-w-0 border-r border-t border-line p-1 text-left align-top transition-colors hover:bg-primary-soft sm:min-h-24 sm:p-2 ${date === selected ? "bg-primary-soft" : ""} ${otherMonth ? "bg-sunken/50 text-ink-faint" : ""}`}>
            <span className={`inline-grid h-6 w-6 place-items-center rounded-full text-xs ${date === today ? "bg-primary text-white" : ""}`}>{Number(date.slice(8))}</span>
            <span className="mt-1 flex gap-0.5 sm:hidden">{dayItems.slice(0, 3).map((item) => <i key={`${item.kind}-${item.id}`} className={`h-1.5 w-1.5 rounded-full ${item.completed ? "bg-line-strong" : item.kind === "course" ? "bg-accent" : "bg-primary"}`} />)}</span>
            <span className="hidden space-y-0.5 sm:block">{dayItems.slice(0, 2).map((item) => <span key={`${item.kind}-${item.id}`} className={`block truncate rounded px-1 text-[11px] ${item.completed ? "bg-sunken text-ink-faint line-through" : item.kind === "course" ? "bg-accent-soft text-accent" : "bg-primary-soft text-primary"}`}>{item.title}</span>)}
              {dayItems.length > 2 && <span className="block text-[10px] text-ink-soft">+{dayItems.length - 2} 项</span>}</span>
          </button>;
        })}
      </div>
    </section>

    <section className="space-y-3" aria-label="当日截止事项">
      <h2 className="text-base font-semibold text-ink">{localDate(selected).toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })} · {selectedItems.length} 项</h2>
      {selectedItems.length === 0 ? <p className="py-6 text-sm text-ink-soft">这一天没有截止事项</p> :
        <ul className="divide-y divide-line border-y border-line">{selectedItems.map((item) => <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center gap-3 py-3">
          <span className={`h-2 w-2 shrink-0 rounded-full ${item.completed ? "bg-line-strong" : item.kind === "course" ? "bg-accent" : "bg-primary"}`} />
          <div className="min-w-0 flex-1"><div className={`font-medium ${item.completed ? "text-ink-faint line-through" : "text-ink"}`}>{item.title}</div>
            <p className="text-xs text-ink-soft">{item.kind === "course" ? "课程" : "项目"} · {item.source} · {item.time}</p></div>
          {item.kind === "project" ? <Link className="text-sm text-primary" href={scopedHref(`/projects/${item.projectId}?task=${item.id}`, teamId)}>查看任务</Link> :
            <div className="flex items-center gap-3 text-sm">
              <button disabled={busy} onClick={() => void change(item.assignment!, "complete")} className="text-primary">{item.completed ? "取消完成" : "完成"}</button>
              <button onClick={() => { setEditing(item.assignment!); setError(null); }} className="text-ink-soft">编辑</button>
              <button disabled={busy} onClick={() => void change(item.assignment!, "delete")} className="text-high">删除</button>
            </div>}
        </li>)}</ul>}
    </section>

    {error && !editing && <p role="alert" className="text-sm text-high">{error}</p>}
    {editing && <div role="dialog" aria-modal="true" aria-labelledby="assignment-dialog-title" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 p-4 sm:items-center">
      <form key={editing === "new" ? "new" : editing.id} onSubmit={(event) => { event.preventDefault(); void save(event.currentTarget); }} className="w-full max-w-md space-y-4 rounded bg-surface p-5 shadow-xl">
        <div className="flex items-center justify-between"><h2 id="assignment-dialog-title" className="text-lg font-semibold text-ink">{editing === "new" ? "添加课程作业" : "编辑课程作业"}</h2>
          <button type="button" aria-label="关闭" onClick={() => setEditing(null)} className="text-xl text-ink-soft">×</button></div>
        <label className="block space-y-1 text-sm text-ink-soft">课程名称<input name="courseName" required maxLength={80} defaultValue={editing === "new" ? "" : editing.courseName} className="ac-field" /></label>
        <label className="block space-y-1 text-sm text-ink-soft">作业名称<input name="title" required maxLength={160} defaultValue={editing === "new" ? "" : editing.title} className="ac-field" /></label>
        <label className="block space-y-1 text-sm text-ink-soft">截止时间<input name="dueAt" type="datetime-local" required defaultValue={editing === "new" ? `${selected}T23:59` : dateTimeInput(editing.dueAt)} className="ac-field" /></label>
        <label className="block space-y-1 text-sm text-ink-soft">备注<textarea name="details" maxLength={2000} rows={2} defaultValue={editing === "new" ? "" : editing.details ?? ""} className="ac-field" /></label>
        <fieldset className="space-y-2"><legend className="text-sm text-ink-soft">站内提醒</legend><div className="flex flex-wrap gap-4 text-sm text-ink">
          {[7, 3, 1].map((days) => <label key={days} className="flex items-center gap-1.5"><input type="checkbox" name={`remind${days}`} defaultChecked={editing === "new" || editing.remindDays.includes(days)} className="accent-primary" />提前 {days} 天</label>)}
        </div></fieldset>
        {error && <p role="alert" className="text-sm text-high">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="ac-btn-ghost">取消</button><button disabled={busy} className="ac-btn">{busy ? "保存中…" : "保存"}</button></div>
      </form>
    </div>}
  </main>;
}
