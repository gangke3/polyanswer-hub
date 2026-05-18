import type { ProviderSelectors } from "../base/selector.types.js";

export const claudeSelectors: ProviderSelectors = {
  promptInputCandidates: [
    "[role='textbox'][aria-label*='Claude']",
    "[contenteditable='true'][aria-label='Send a message']",
    "[contenteditable='true'][aria-label='Enter your turn']",
    ".ProseMirror[contenteditable='true']",
    ".tiptap[contenteditable='true']",
    "div[data-placeholder][contenteditable='true']",
    "[contenteditable='true'][aria-label*='message']",
    "[contenteditable='true']"
  ],
  submitButtonCandidates: [
    "button[data-testid='send-button']",
    "button[aria-label*='Send message']",
    "button[aria-label='Send']",
    "button[type='submit']"
  ],
  answerContainerCandidates: [
    "[data-test-render-count]:has([data-is-streaming]) .font-claude-message",
    "[data-test-render-count]:has([data-is-streaming])",
    ".font-claude-message",
    "[data-is-streaming]"
  ],
  loggedInMarkers: [
    "[role='textbox'][aria-label*='Claude']",
    "[contenteditable='true'][aria-label='Send a message']",
    "[contenteditable='true'][aria-label='Enter your turn']",
    "button[data-testid='send-button']"
  ],
  loggedOutMarkers: [
    "a[href*='/login']",
    "button:has-text('Log in')",
    "text=Log in",
    "text=Sign up"
  ],
  challengeMarkers: [
    "iframe[title*='challenge']",
    "input[name='cf-turnstile-response']",
    "#challenge-stage"
  ]
};
