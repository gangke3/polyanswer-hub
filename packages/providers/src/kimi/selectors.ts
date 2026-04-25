import type { ProviderSelectors } from "../base/selector.types.js";

export const kimiSelectors: ProviderSelectors = {
  promptInputCandidates: ["[contenteditable='true']", "textarea"],
  submitButtonCandidates: ["button[type='submit']", "button:has-text('发送')"],
  answerContainerCandidates: [
    ".segment.segment-assistant .markdown",
    ".segment.segment-assistant .markdown-container",
    ".chat-content-item-assistant",
    ".segment.segment-assistant",
    ".chat-content-list"
  ],
  loggedOutMarkers: [".phone-login-action", "button:has-text('发送验证码')", "button:has-text('登录')"]
};
