import { describe, expect, it } from "vitest";
import { profileFromFormData, selectVisibleProfile } from "@/lib/profile";

describe("个人信息可见性", () => {
  it("默认仅公开姓名，登录邮箱不参与公开资料", () => {
    const form = new FormData();
    form.set("school", "厦门大学");
    form.set("contact", "123456789");
    form.set("gender", "男");
    const input = profileFromFormData(form);
    expect(input.visibleFields).toEqual([]);
    expect(selectVisibleProfile({ name: "小明", ...input })).toEqual({
      name: "小明", school: null, grade: null, major: null,
      gender: null, contact: null, personalEmail: null,
    });
  });

  it("只返回主动勾选的字段", () => {
    const form = new FormData();
    form.set("school", "厦门大学");
    form.set("contact", "123456789");
    form.set("gender", "女");
    form.set("personalEmail", "name@example.com");
    form.set("show_school", "on");
    form.set("show_personalEmail", "on");
    const input = profileFromFormData(form);
    expect(selectVisibleProfile({ name: "小明", ...input })).toMatchObject({
      name: "小明", school: "厦门大学", contact: null, personalEmail: "name@example.com",
    });
  });

  it("个人邮箱格式不正确时拒绝保存", () => {
    const form = new FormData();
    form.set("gender", "男");
    form.set("personalEmail", "invalid-address");
    expect(() => profileFromFormData(form)).toThrow();
  });

  it("只接受男或女", () => {
    const form = new FormData();
    form.set("gender", "其他");
    expect(() => profileFromFormData(form)).toThrow("请选择性别");
  });
});
