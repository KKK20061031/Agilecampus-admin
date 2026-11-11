import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { createCourseAssignment } from "@/lib/calendar";
import { syncMyCourseReminders } from "@/lib/course-reminders";
import { AppError } from "@/lib/errors";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const assignment = await createCourseAssignment(session.user.id, await req.json());
    try { await syncMyCourseReminders(session.user.id); }
    catch (error) { console.error("[/api/calendar/assignments] 提醒同步失败:", error); }
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[/api/calendar/assignments] 新建失败:", error);
    return NextResponse.json({ error: "保存失败，请重试" }, { status: 500 });
  }
}
