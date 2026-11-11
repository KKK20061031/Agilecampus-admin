import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createTaskFromGroupMessage } from "@/lib/chat-task";
import { AppError, ForbiddenError } from "@/lib/errors";

const schema = z.object({
  messageId: z.uuid(),
  title: z.string().trim().min(1, "请填写任务标题").max(180, "任务标题不能超过 180 个字符"),
  assigneeIds: z.array(z.uuid()).max(10).optional().default([]),
  dueDate: z.iso.date().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  try {
    const task = await createTaskFromGroupMessage(session.user.id, parsed.data.messageId, {
      title: parsed.data.title,
      assigneeIds: parsed.data.assigneeIds,
      dueDate: parsed.data.dueDate || undefined,
    });
    return NextResponse.json({ task: { id: task.id, title: task.title, projectId: task.projectId } }, { status: 201 });
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "没有权限创建此项目任务" }, { status: 403 });
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[/api/messages/convert-to-task] 转换失败:", error);
    return NextResponse.json({ error: "转换失败，请重试" }, { status: 500 });
  }
}
