"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { updateTask } from "@/lib/task";
import { AppError, ForbiddenError } from "@/lib/errors";

// 我的任务页勾选/取消勾选：勾选 = 标记完成，取消 = 回到待办
export async function toggleMyTaskAction(input: {
  taskId: string;
  projectId: string;
  done: boolean;
}): Promise<{ error: string } | null> {
  const session = await auth();
  if (!session?.user) return { error: "请先登录" };

  try {
    await updateTask(session.user.id, input.taskId, {
      status: input.done ? "done" : "todo",
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: "没有权限修改该任务" };
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }

  revalidatePath("/tasks");
  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/", "layout");
  return null;
}
