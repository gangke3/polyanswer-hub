import type { ProviderSelectors } from "../base/selector.types.js";

export const doubaoSelectors: ProviderSelectors = {
  promptInputCandidates: ["textarea[placeholder*='发消息']", "textarea", "[contenteditable='true']"],
  submitButtonCandidates: [
    "button[class*='send-msg-btn']",
    "button[class*='send']",
    "button[type='submit']"
  ],
  answerContainerCandidates: [
    ".flow-markdown-body",
    ".markdown",
    ".message-content",
    "[class*='message']",
    ".v_list_row .select-none"
  ],
  loggedOutMarkers: ["text=登录以解锁更多功能", "text=抖音一键登录", "text=完成验证后继续"],
  loggedInMarkers: ["textarea", "[contenteditable='true']"]
};
