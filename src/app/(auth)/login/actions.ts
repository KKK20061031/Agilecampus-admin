"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

export type FormState = { error: string } | null;

// 仅接受站内相对路径（以单个 / 开头），防开放重定向
function safeRedirectTarget(raw: FormData | null): string {
  const v = raw?.get("redirectTo");
  if (typeof v !== "string") return "/teams";
  if (!v.startsWith("/") || v.startsWith("//")) return "/teams";
  return v;
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeRedirectTarget(formData),
    });
    return null;
  } catch (e) {
    if (e instanceof AuthError) return { error: "账号（邮箱/学号）或密码不正确" };
    // signIn 成功时 next-auth 抛 NEXT_REDIRECT 错误，必须继续上抛让框架完成跳转
    if (
      typeof e === "object"
      && e !== null
      && "digest" in e
      && typeof (e as { digest: unknown }).digest === "string"
      && (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw e;
    }
    // 其余异常（数据库连接失败、连接池耗尽等）不再上抛：上抛会触发整页错误甚至白屏，
    // 改为返回友好提示，同时服务端记录原始错误便于排查。
    console.error("[login] 登录过程发生异常", e);
    return { error: "登录失败，请稍后重试或联系管理员" };
  }
}
