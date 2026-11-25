"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleMyTaskAction } from "./actions";

// 我的任务页的勾选框：勾选 = 标记完成（任务随即从未完成列表消失），取消勾选 = 回到待办。
// updateTask 内部会写 task_events 并通知任务参与者，与看板拖拽完成同一链路。
export function TaskCheck({
  taskId,
  projectId,
  status,
}: {
  taskId: string;
  projectId: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const done = status === "done";

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="checkbox"
        aria-label={done ? "取消完成该任务" : "标记该任务为完成"}
        checked={done}
        disabled={pending}
        title={done ? "取消完成" : "标记完成"}
        className="h-4 w-4 shrink-0 accent-primary"
        onChange={() => {
          setError(null);
          startTransition(async () => {
            const res = await toggleMyTaskAction({ taskId, projectId, done: !done });
            if (res?.error) setError(res.error);
            else router.refresh();
          });
        }}
      />
      {error && <span className="text-xs text-high">{error}</span>}
    </span>
  );
}
