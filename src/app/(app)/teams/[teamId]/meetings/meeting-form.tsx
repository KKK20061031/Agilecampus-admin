"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { createMeetingAction, updateMeetingAction, type MeetingFormState } from "./actions";

type Meeting = {
  id: string;
  title: string;
  startsAt: Date;
  timeZone: string;
  location: string | null;
  agenda: string;
  minutes: string;
};

const subscribe = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const localInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function MeetingForm({ teamId, meeting }: {
  teamId: string;
  meeting?: Meeting;
}) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [state, action, pending] = useActionState<MeetingFormState, FormData>(
    meeting ? updateMeetingAction : createMeetingAction,
    null,
  );
  const [startsAt, setStartsAt] = useState(() => meeting ? localInputValue(new Date(meeting.startsAt)) : "");
  const timeZone = useSyncExternalStore(subscribe, browserTimeZone, () => "UTC");

  if (!hydrated) return <div className="min-h-32" aria-hidden="true" />;

  const startsAtIso = startsAt ? new Date(startsAt).toISOString() : "";
  return <form action={action} className="space-y-3">
    {meeting && <input type="hidden" name="meetingId" value={meeting.id} />}
    {!meeting && <input type="hidden" name="teamId" value={teamId} />}
    <input type="hidden" name="startsAt" value={startsAtIso} />
    <input type="hidden" name="timeZone" value={timeZone} />
    <label className="block space-y-1 text-sm text-ink-soft">会议名称
      <input name="title" required maxLength={140} defaultValue={meeting?.title ?? ""} className="ac-field" />
    </label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block space-y-1 text-sm text-ink-soft">日期与时间
        <input type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="ac-field" />
      </label>
      <label className="block space-y-1 text-sm text-ink-soft">地点或会议链接
        <input name="location" maxLength={160} defaultValue={meeting?.location ?? ""} className="ac-field" placeholder="教室、腾讯会议链接等" />
      </label>
    </div>
    <label className="block space-y-1 text-sm text-ink-soft">议程
      <textarea name="agenda" maxLength={5000} rows={3} defaultValue={meeting?.agenda ?? ""} className="ac-field" placeholder="讨论主题、准备事项" />
    </label>
    <label className="block space-y-1 text-sm text-ink-soft">会议纪要
      <textarea name="minutes" maxLength={10000} rows={4} defaultValue={meeting?.minutes ?? ""} className="ac-field" placeholder="讨论结论与决定" />
    </label>
    {state && "error" in state && <p role="alert" className="text-sm text-high">{state.error}</p>}
    {state && "ok" in state && <p role="status" className="text-sm text-done">{meeting ? "会议资料已保存" : "会议已创建"}</p>}
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button disabled={pending || !startsAtIso} className="ac-btn">{pending ? "保存中…" : meeting ? "保存会议" : "创建会议"}</button>
    </div>
  </form>;
}
