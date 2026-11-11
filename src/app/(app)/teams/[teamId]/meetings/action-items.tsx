"use client";

import { useActionState } from "react";
import { createMeetingActionItemAction, deleteMeetingActionItemAction,
  setMeetingActionStatusAction, updateMeetingActionItemAction, type MeetingFormState } from "./actions";

type Member = { id: string; name: string };
type ActionItem = {
  id: string;
  createdById: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  title: string;
  details: string;
  dueDate: string | null;
  status: "open" | "done";
};

export function CreateActionItemForm({ meetingId, members }: { meetingId: string; members: Member[] }) {
  const [state, action, pending] = useActionState<MeetingFormState, FormData>(createMeetingActionItemAction, null);
  return <form action={action} className="grid gap-2 rounded border border-line bg-surface p-3 sm:grid-cols-2">
    <input type="hidden" name="meetingId" value={meetingId} />
    <label className="space-y-1 text-xs text-ink-soft sm:col-span-2">行动项
      <input name="title" required maxLength={180} className="ac-field" placeholder="例如：整理用户访谈结果" />
    </label>
    <label className="space-y-1 text-xs text-ink-soft">负责人
      <select name="assigneeId" defaultValue="" className="ac-field"><option value="">暂不指定</option>
        {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select>
    </label>
    <label className="space-y-1 text-xs text-ink-soft">截止日期
      <input type="date" name="dueDate" className="ac-field" />
    </label>
    <label className="space-y-1 text-xs text-ink-soft sm:col-span-2">说明
      <textarea name="details" maxLength={3000} rows={2} className="ac-field" />
    </label>
    {state && "error" in state && <p role="alert" className="text-sm text-high sm:col-span-2">{state.error}</p>}
    {state && "ok" in state && <p role="status" className="text-sm text-done sm:col-span-2">行动项已添加</p>}
    <button disabled={pending} className="ac-btn sm:col-span-2 sm:justify-self-end">{pending ? "添加中…" : "添加行动项"}</button>
  </form>;
}

export function ActionItemCard({ item, members, canManage, canToggle }: {
  item: ActionItem;
  members: Member[];
  canManage: boolean;
  canToggle: boolean;
}) {
  const [state, action, pending] = useActionState<MeetingFormState, FormData>(updateMeetingActionItemAction, null);
  const nextStatus = item.status === "done" ? "open" : "done";
  return <li className={`rounded border border-line p-3 ${item.status === "done" ? "bg-sunken/60" : "bg-surface"}`}>
    <div className="flex flex-wrap items-start gap-3">
      {canToggle && <form action={setMeetingActionStatusAction}>
        <input type="hidden" name="actionItemId" value={item.id} />
        <input type="hidden" name="status" value={nextStatus} />
        <button aria-label={item.status === "done" ? "重新打开行动项" : "标记行动项完成"} title={item.status === "done" ? "重新打开" : "标记完成"}
          className={`grid h-6 w-6 place-items-center rounded-full border text-xs ${item.status === "done" ? "border-done bg-done text-white" : "border-line-strong text-ink-soft hover:border-primary"}`}>
          {item.status === "done" ? "✓" : ""}
        </button>
      </form>}
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${item.status === "done" ? "text-ink-faint line-through" : "text-ink"}`}>{item.title}</p>
        {(item.assigneeName || item.dueDate || item.details) && <p className="mt-1 whitespace-pre-wrap text-xs text-ink-soft">
          {[item.assigneeName ? `负责人：${item.assigneeName}` : "未指定负责人", item.dueDate ? `截止：${item.dueDate}` : ""].filter(Boolean).join(" · ")}
          {item.details ? `\n${item.details}` : ""}
        </p>}
      </div>
      {canManage && <details className="w-full">
        <summary className="cursor-pointer text-right text-xs text-primary">编辑</summary>
        <form action={action} className="mt-2 grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
          <input type="hidden" name="actionItemId" value={item.id} />
          <label className="space-y-1 text-xs text-ink-soft sm:col-span-2">行动项
            <input name="title" required maxLength={180} defaultValue={item.title} className="ac-field" />
          </label>
          <label className="space-y-1 text-xs text-ink-soft">负责人
            <select name="assigneeId" defaultValue={item.assigneeId ?? ""} className="ac-field"><option value="">暂不指定</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-ink-soft">截止日期
            <input type="date" name="dueDate" defaultValue={item.dueDate ?? ""} className="ac-field" />
          </label>
          <label className="space-y-1 text-xs text-ink-soft sm:col-span-2">说明
            <textarea name="details" maxLength={3000} rows={2} defaultValue={item.details} className="ac-field" />
          </label>
          {state && "error" in state && <p role="alert" className="text-sm text-high sm:col-span-2">{state.error}</p>}
          {state && "ok" in state && <p role="status" className="text-sm text-done sm:col-span-2">已保存</p>}
          <button disabled={pending} className="ac-btn sm:justify-self-end">{pending ? "保存中…" : "保存"}</button>
        </form>
        <form action={deleteMeetingActionItemAction} className="mt-2 flex justify-end">
          <input type="hidden" name="actionItemId" value={item.id} />
          <button className="text-xs text-high hover:underline">删除行动项</button>
        </form>
      </details>}
    </div>
  </li>;
}
