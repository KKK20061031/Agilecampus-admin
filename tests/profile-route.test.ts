import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getRoomMeta: vi.fn(),
  listRoomMembers: vi.fn(),
  getVisibleProfile: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/chat", () => ({ getRoomMeta: mocks.getRoomMeta, listRoomMembers: mocks.listRoomMembers }));
vi.mock("@/lib/profile", () => ({ getVisibleProfile: mocks.getVisibleProfile }));

import { GET } from "@/app/api/messages/profile/route";

const ROOM = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-000000000002";

function request() {
  return new Request(`http://localhost/api/messages/profile?roomId=${ROOM}&userId=${USER}`);
}

describe("群聊成员资料接口", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "viewer" } });
    mocks.getRoomMeta.mockResolvedValue({ type: "group" });
    mocks.listRoomMembers.mockResolvedValue([{ id: USER, name: "队友" }]);
    mocks.getVisibleProfile.mockResolvedValue({ name: "队友", contact: null });
  });

  it("未登录不读取任何资料", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.getVisibleProfile).not.toHaveBeenCalled();
  });

  it("私聊会话不能用作查看资料的凭据", async () => {
    mocks.getRoomMeta.mockResolvedValue({ type: "dm" });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.getVisibleProfile).not.toHaveBeenCalled();
  });

  it("被查看者不在群聊中时拒绝", async () => {
    mocks.listRoomMembers.mockResolvedValue([]);
    expect((await GET(request())).status).toBe(403);
    expect(mocks.getVisibleProfile).not.toHaveBeenCalled();
  });

  it("只返回经可见性过滤的资料", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profile: { name: "队友", contact: null } });
    expect(mocks.getVisibleProfile).toHaveBeenCalledWith(USER);
  });
});
