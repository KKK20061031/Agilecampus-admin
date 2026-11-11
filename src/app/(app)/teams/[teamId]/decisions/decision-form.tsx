"use client";

import { useActionState } from "react";
import { createDecisionAction, updateDecisionAction, type DecisionFormState } from "./actions";

type Decision = {
  id: string;
  title: string;
  context: string;
  finalOption: string;
};

export function DecisionForm({ teamId, decision }: {
  teamId: string;
  decision?: Decision;
}) {
  const [state, action, pending] = useActionState<DecisionFormState, FormData>(
    decision ? updateDecisionAction : createDecisionAction,
    null,
  );

  return <form action={action} className="space-y-3">
    {decision && <input type="hidden" name="decisionId" value={decision.id} />}
    {!decision && <input type="hidden" name="teamId" value={teamId} />}
    <label className="block space-y-1 text-sm text-ink-soft">决策主题
      <input name="title" required maxLength={140} defaultValue={decision?.title ?? ""} className="ac-field" placeholder="例如：技术选型 / 答辩选题" />
    </label>
    <label className="block space-y-1 text-sm text-ink-soft">背景与候选方案
      <textarea name="context" maxLength={5000} rows={3} defaultValue={decision?.context ?? ""} className="ac-field" placeholder="讨论背景、候选方案与取舍理由（可选）" />
    </label>
    <label className="block space-y-1 text-sm text-ink-soft">最终采用的方案
      <textarea name="finalOption" required maxLength={2000} rows={2} defaultValue={decision?.finalOption ?? ""} className="ac-field" placeholder="最终确定采用哪个方案" />
    </label>
    {state && "error" in state && <p role="alert" className="text-sm text-high">{state.error}</p>}
    {state && "ok" in state && <p role="status" className="text-sm text-done">{decision ? "决策记录已保存" : "决策记录已创建"}</p>}
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button disabled={pending} className="ac-btn">{pending ? "保存中…" : decision ? "保存决策" : "创建决策记录"}</button>
    </div>
  </form>;
}
