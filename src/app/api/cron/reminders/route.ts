import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncDueSoonNotificationsForAll } from "@/lib/reminder";
import { syncAllCourseReminders } from "@/lib/course-reminders";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "定时提醒未配置" }, { status: 503 });
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = Buffer.from(secret);
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return NextResponse.json({ error: "没有权限" }, { status: 401 });
  }
  try {
    const [tasks, assignments] = await Promise.all([
      syncDueSoonNotificationsForAll(),
      syncAllCourseReminders(),
    ]);
    return NextResponse.json({ users: tasks.users, courseReminders: assignments });
  } catch (error) {
    console.error("[/api/cron/reminders] 同步失败:", error);
    return NextResponse.json({ error: "提醒同步失败" }, { status: 500 });
  }
}
