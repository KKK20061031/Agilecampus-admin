"use client";

// 复制文本到剪贴板（含降级）。
// navigator.clipboard 仅在安全上下文（HTTPS 或 localhost）可用；
// 局域网经 http://<内网IP>:3000 访问时该对象为 undefined，
// 直接调用会在控制台抛 unhandledRejection（Cannot read properties of undefined (reading 'writeText')）。
// 此处先走 Clipboard API，失败或不支持时降级为 execCommand('copy')。
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 权限被拒等：继续尝试降级方案
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}
