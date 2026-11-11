"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { registerAction, type FormState } from "./actions";

export default function RegisterPage() {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    registerAction,
    null,
  );

  return (
    <main className="mx-auto mt-24 w-full max-w-sm space-y-4 ac-card p-6">
      <h1 className="font-display text-2xl font-semibold text-ink">注册 AgileCampus</h1>
      <form ref={formRef} action={formAction} className="space-y-3">
        <input name="studentId" placeholder="学号（14 位数字，用于登录）" required pattern="[0-9]{14}" className="ac-field" />
        <input name="email" type="email" placeholder="登录邮箱" required className="ac-field" />
        <input name="password" type="password" placeholder="密码（至少 8 位）" required minLength={8} maxLength={64} className="ac-field" />
        {state?.error && <p className="text-sm text-high">{state.error}</p>}
        <button
          type="button"
          onClick={() => {
            if (formRef.current?.reportValidity()) setDetailsOpen(true);
          }}
          className="ac-btn w-full"
        >
          下一步：填写个人信息
        </button>
        {detailsOpen && (
          <div role="dialog" aria-modal="true" aria-labelledby="register-profile-title" onKeyDown={(event) => { if (event.key === "Escape") setDetailsOpen(false); }} className="fixed inset-0 z-50 flex items-start justify-center bg-ink/45 p-4 sm:items-center">
            <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg space-y-4 overflow-y-auto rounded-field bg-surface p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="register-profile-title" className="font-display text-lg font-semibold text-ink">个人信息</h2>
                  <p className="text-sm text-ink-soft">姓名始终向队友显示；其余信息由你决定是否展示。</p>
                </div>
                <button type="button" onClick={() => setDetailsOpen(false)} aria-label="关闭" className="text-xl text-ink-soft">×</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ProfileInput name="name" label="姓名" required autoFocus />
                <ProfileInput name="school" label="学校" />
                <ProfileInput name="grade" label="年级" />
                <ProfileInput name="major" label="专业" />
                <fieldset className="space-y-2 text-sm text-ink-soft">
                  <legend>性别</legend>
                  <div className="flex items-center gap-5">
                    <label className="flex items-center gap-2"><input type="radio" name="gender" value="男" required className="accent-primary" />男</label>
                    <label className="flex items-center gap-2"><input type="radio" name="gender" value="女" required className="accent-primary" />女</label>
                  </div>
                </fieldset>
                <ProfileInput name="contact" label="联系方式" />
                <ProfileInput name="personalEmail" label="个人邮箱" type="email" />
              </div>
              <fieldset className="space-y-2 border-t border-line pt-3">
                <legend className="text-sm font-medium text-ink">向群聊队友展示</legend>
                <div className="grid grid-cols-2 gap-2 text-sm text-ink-soft">
                  {([ ["school", "学校"], ["grade", "年级"], ["major", "专业"], ["gender", "性别"], ["contact", "联系方式"], ["personalEmail", "个人邮箱"] ] as const).map(([name, label]) => (
                    <label key={name} className="flex items-center gap-2"><input type="checkbox" name={`show_${name}`} className="accent-primary" />{label}</label>
                  ))}
                </div>
              </fieldset>
              {state?.error && <p className="text-sm text-high">{state.error}</p>}
              <button type="submit" disabled={pending} className="ac-btn w-full">{pending ? "注册中…" : "完成注册"}</button>
            </div>
          </div>
        )}
      </form>
      <p className="text-sm text-ink-soft">
        已有账号？<Link href="/login" className="text-primary hover:underline">去登录</Link>
      </p>
    </main>
  );
}

function ProfileInput({ name, label, type = "text", required = false, autoFocus = false }: { name: string; label: string; type?: string; required?: boolean; autoFocus?: boolean }) {
  const maxLength = name === "grade" ? 40 : name === "personalEmail" ? 254 : 100;
  return <label className="space-y-1 text-sm text-ink-soft">{label}<input name={name} type={type} required={required} autoFocus={autoFocus} maxLength={maxLength} className="ac-field" /></label>;
}
