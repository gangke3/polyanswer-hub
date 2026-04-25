import type { ProviderSelectors } from "../base/selector.types.js";

export const doubaoSelectors: ProviderSelectors = {
  promptInputCandidates: ["textarea", "[contenteditable='true']"],
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
  loggedOutMarkers: ["text=登录以解锁更多功能", "text=抖音一键登录"]
};
