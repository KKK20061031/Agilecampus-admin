import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages, chatRooms, tasks } from "@/db/schema";
import { AppError, ForbiddenError, isUniqueViolation } from "@/lib/errors";
import { getRoomMeta } from "@/lib/chat";
import { createTask, requireTaskWrite } from "@/lib/task";

/** Turn a group message into a project task, preserving a unique link to its source. */
export async function createTaskFromGroupMessage(
  actorId: string,
  messageId: string,
  input: { title: string; assigneeIds?: string[]; dueDate?: string },
) {
  const [source] = await db
    .select({ id: chatMessages.id, roomId: chatRooms.id, content: chatMessages.content, projectId: chatRooms.projectId, type: chatRooms.type })
    .from(chatMessages)
    .innerJoin(chatRooms, eq(chatMessages.roomId, chatRooms.id))
    .where(eq(chatMessages.id, messageId));

  if (!source) throw new AppError("消息不存在");
  const room = await getRoomMeta(actorId, source.roomId);
  if (room.type !== "group" || source.type !== "group" || !source.projectId) throw new AppError("只能将项目群聊消息转为任务");
  await requireTaskWrite(actorId, source.projectId);

  const [existing] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.sourceMessageId, messageId));
  if (existing) throw new AppError("这条消息已经转为任务");

  try {
    const task = await createTask(actorId, source.projectId, {
      title: input.title,
      description: `来源群聊消息：\n${source.content}`,
      assigneeIds: input.assigneeIds,
      dueDate: input.dueDate,
      sourceMessageId: messageId,
    });
    return task;
  } catch (error) {
    // The database constraint also closes the race when two requests convert together.
    if (isUniqueViolation(error)) {
      const [created] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.sourceMessageId, messageId));
      if (created) throw new AppError("这条消息已经转为任务");
    }
    if (error instanceof ForbiddenError) throw error;
    throw error;
  }
}
