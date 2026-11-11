import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getRoomMeta, listRoomMembers } from "@/lib/chat";
import { getVisibleProfile } from "@/lib/profile";
import { AppError, ForbiddenError } from "@/lib/errors";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const url = new URL(req.url);
  const roomId = url.searchParams.get("roomId");
  const userId = url.searchParams.get("userId");
  if (!z.uuid().safeParse(roomId).success || !z.uuid().safeParse(userId).success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  try {
    const room = await getRoomMeta(session.user.id, roomId!);
    if (room.type !== "group") return NextResponse.json({ error: "没有权限" }, { status: 403 });
    const members = await listRoomMembers(session.user.id, roomId!);
    if (!members.some((member) => member.id === userId)) {
      return NextResponse.json({ error: "没有权限" }, { status: 403 });
    }
    const profile = await getVisibleProfile(userId!);
    if (!profile) return NextResponse.json({ error: "成员不存在" }, { status: 404 });
    return NextResponse.json({ profile });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: "没有权限" }, { status: 403 });
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: 404 });
    console.error("[/api/messages/profile] 查询失败:", e);
    return NextResponse.json({ error: "加载失败，请重试" }, { status: 500 });
  }
}
