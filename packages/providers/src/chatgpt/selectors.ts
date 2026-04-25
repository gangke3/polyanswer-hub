import type { ProviderSelectors } from "../base/selector.types.js";

export const chatgptSelectors: ProviderSelectors = {
  promptInputCandidates: ["#prompt-textarea", "textarea", "[contenteditable='true']"],
  submitButtonCandidates: ["button[data-testid='send-button']", "button[type='submit']"],
  answerContainerCandidates: ["[data-message-author-role='assistant']", "article"],
  loggedInMarkers: ["#prompt-textarea", "textarea", "[data-testid='send-button']"],
  loggedOutMarkers: [
    "button[data-testid='login-button']",
    "a[href*='auth/login']",
    "input[type='email']",
    "button:has-text('登录')",
    "button:has-text('免费注册')"
  ],
  challengeMarkers: [
    "script[src*='challenge-platform']",
    "input[name='cf-turnstile-response']",
    "#challenge-error-text"
  ]
};
