import type { ProviderSelectors } from "../base/selector.types.js";

export const geminiSelectors: ProviderSelectors = {
  promptInputCandidates: ["[role='textbox']", "[contenteditable='true']", "rich-textarea"],
  submitButtonCandidates: ["button[aria-label*='发送']", "button[aria-label*='Send']", "button[type='submit']"],
  answerContainerCandidates: [
    ".model-response-text",
    ".response-container",
    "message-content",
    "model-response"
  ]
};
