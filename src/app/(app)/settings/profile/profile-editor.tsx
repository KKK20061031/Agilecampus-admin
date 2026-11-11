"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileState } from "./actions";

type Profile = {
  school: string | null;
  grade: string | null;
  major: string | null;
  gender: string | null;
  contact: string | null;
  personalEmail: string | null;
  visibleFields: string[];
} | null;

export function ProfileEditor({ name, initial }: { name: string; initial: Profile }) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(updateProfileAction, null);
  const visible = new Set(initial?.visibleFields ?? []);

  return (
    <form action={formAction} className="ac-card space-y-4 p-5">
      <h2 className="font-display text-lg font-semibold text-ink">基本信息</h2>
      <label className="block space-y-1 text-sm text-ink-soft">姓名（始终展示，不可在此修改）
        <input value={name} readOnly className="ac-field bg-sunken" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="school" label="学校" value={initial?.school} shown={visible.has("school")} />
        <Field name="grade" label="年级" value={initial?.grade} shown={visible.has("grade")} />
        <Field name="major" label="专业" value={initial?.major} shown={visible.has("major")} />
        <div className="space-y-1">
          <Visibility name="gender" label="性别" shown={visible.has("gender")} />
          <div className="flex items-center gap-5 py-2 text-sm text-ink">
            <label className="flex items-center gap-2"><input type="radio" name="gender" value="男" required defaultChecked={initial?.gender === "男"} className="accent-primary" />男</label>
            <label className="flex items-center gap-2"><input type="radio" name="gender" value="女" required defaultChecked={initial?.gender === "女"} className="accent-primary" />女</label>
          </div>
        </div>
        <Field name="contact" label="联系方式" value={initial?.contact} shown={visible.has("contact")} />
        <Field name="personalEmail" label="个人邮箱" type="email" value={initial?.personalEmail} shown={visible.has("personalEmail")} />
      </div>
      {state && ("error" in state ? <p className="text-sm text-high">{state.error}</p> : <p className="text-sm text-primary">已保存</p>)}
      <button type="submit" disabled={pending} className="ac-btn">{pending ? "保存中…" : "保存个人信息"}</button>
    </form>
  );
}

function Field({ name, label, value, shown, type = "text" }: { name: string; label: string; value?: string | null; shown: boolean; type?: string }) {
  return <div className="space-y-1">
    <Visibility name={name} label={label} shown={shown} />
    <input name={name} aria-label={label} type={type} maxLength={name === "grade" ? 40 : name === "personalEmail" ? 254 : 100} defaultValue={value ?? ""} className="ac-field" />
  </div>;
}

function Visibility({ name, label, shown }: { name: string; label: string; shown: boolean }) {
  return <label className="flex items-center gap-2 text-xs text-ink-soft">
    <input type="checkbox" name={`show_${name}`} defaultChecked={shown} className="accent-primary" />
    {label} · 向队友展示
  </label>;
}
