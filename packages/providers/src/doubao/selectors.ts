import type { ProviderSelectors } from "../base/selector.types.js";

export const doubaoSelectors: ProviderSelectors = {
  promptInputCandidates: ["textarea[placeholder*='发消息']", "textarea", "[contenteditable='true']"],
  submitButtonCandidates: [
    "button[class*='send-msg-btn']",
    "button[class*='send']",
    "button[id*='send']",
    "button[type='submit']"
  ],
  answerContainerCandidates: [
    "[data-copy-telemetry='right_click_copy'] .flow-markdown-body",
    ".flow-markdown-body",
    "[data-plugin-identifier*='block_type:10000'] .flow-markdown-body",
    "[data-container-type*='block'] .flow-markdown-body",
    "[data-render-engine='node'] > div"
  ],
  loggedOutMarkers: ["text=登录以解锁更多功能", "text=抖音一键登录", "text=完成验证后继续"],
  loggedInMarkers: ["textarea", "[contenteditable='true']"]
};
