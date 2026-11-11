import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { auth } from "@/lib/auth";
import { deleteCourseAssignment, setCourseAssignmentCompleted, updateCourseAssignment } from "@/lib/calendar";
import { syncMyCourseReminders } from "@/lib/course-reminders";
import { AppError } from "@/lib/errors";

type Context = { params: Promise<{ assignmentId: string }> };

async function identity(context: Context) {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: "请先登录" }, { status: 401 }) };
  const { assignmentId } = await context.params;
  if (!z.uuid().safeParse(assignmentId).success) {
    return { error: NextResponse.json({ error: "参数无效" }, { status: 400 }) };
  }
  return { userId: session.user.id, assignmentId };
}

function failure(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
  if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: 404 });
  console.error("[/api/calendar/assignments/:id] 操作失败:", error);
  return NextResponse.json({ error: "操作失败，请重试" }, { status: 500 });
}

export async function PATCH(req: Request, context: Context) {
  const actor = await identity(context);
  if (actor.error) return actor.error;
  try {
    const body: unknown = await req.json();
    const command = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("complete"), completed: z.boolean() }),
      z.object({ kind: z.literal("edit"), courseName: z.unknown(), title: z.unknown(),
        details: z.unknown(), dueAt: z.unknown(), timeZone: z.unknown(), remindDays: z.unknown() }),
    ]).parse(body);
    const assignment = command.kind === "complete"
      ? await setCourseAssignmentCompleted(actor.userId!, actor.assignmentId!, command.completed)
      : await updateCourseAssignment(actor.userId!, actor.assignmentId!, command);
    if (command.kind === "edit" || (command.kind === "complete" && !command.completed)) {
      try { await syncMyCourseReminders(actor.userId!); }
      catch (error) { console.error("[/api/calendar/assignments/:id] 提醒同步失败:", error); }
    }
    return NextResponse.json({ assignment });
  } catch (error) { return failure(error); }
}

export async function DELETE(_req: Request, context: Context) {
  const actor = await identity(context);
  if (actor.error) return actor.error;
  try {
    await deleteCourseAssignment(actor.userId!, actor.assignmentId!);
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
}
