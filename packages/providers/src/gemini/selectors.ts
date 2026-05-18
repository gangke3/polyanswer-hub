import type { ProviderSelectors } from "../base/selector.types.js";

export const geminiSelectors: ProviderSelectors = {
  promptInputCandidates: [
    "div[role='textbox'][aria-label*='Gemini']",
    "div[role='textbox'][aria-label*='提示']",
    "div[role='textbox'][aria-label*='输入']",
    "div[role='textbox'][aria-label*='prompt']",
    "div[role='textbox'][contenteditable='true']",
    "[role='textbox'][contenteditable='true']",
    "rich-textarea [contenteditable='true']",
    "rich-textarea",
    "[contenteditable='true']"
  ],
  submitButtonCandidates: [
    "button.send-button[aria-disabled='false']",
    "button[aria-label='发送'][aria-disabled='false']",
    "button[aria-label*='提交'][aria-disabled='false']",
    "button[aria-label*='Submit'][aria-disabled='false']",
    "button[aria-label*='Send']",
    "button[aria-label*='发送']",
    "button[aria-label*='submit']",
    "button.send-button",
    "button[type='submit']"
  ],
  answerContainerCandidates: [
    ".model-response-text",
    ".response-container",
    ".markdown",
    "message-content",
    "model-response"
  ],
  loggedOutMarkers: [
    "a[href*='accounts.google.com'][aria-label*='Sign in']",
    "a[href*='accounts.google.com']:has-text('Sign in')",
    "a[href*='accounts.google.com']:has-text('登录')",
    "button:has-text('Sign in')",
    "button:has-text('登录')"
  ],
  loggedInMarkers: [
    "div[role='textbox'][aria-label*='Gemini']",
    "div[role='textbox'][aria-label*='提示']",
    "div[role='textbox'][aria-label*='输入']",
    "[role='textbox']",
    "rich-textarea [contenteditable='true']",
    "rich-textarea",
    "button.send-button",
    "button[aria-label*='Send']",
    "button[aria-label*='Submit']",
    "button[aria-label*='发送']"
  ]
};
