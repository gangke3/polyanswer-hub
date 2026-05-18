import type { ProviderSelectors } from "../base/selector.types.js";

export const grokSelectors: ProviderSelectors = {
  promptInputCandidates: [
    "textarea[placeholder*='Ask']",
    "textarea[placeholder*='anything']",
    "textarea[placeholder*='message']",
    "div[role='textbox'][contenteditable='true']",
    "[contenteditable='true']",
    "textarea"
  ],
  submitButtonCandidates: [
    "button[aria-label*='Send']",
    "button[aria-label*='send']",
    "button[aria-label*='Submit']",
    "button[type='submit']",
    "button:has(svg)"
  ],
  answerContainerCandidates: [
    ".markdown-content",
    ".message-bubble",
    "[class*='markdown']",
    "[class*='response']",
    "[class*='message-content']",
    "[class*='assistant']",
    ".prose"
  ],
  loggedOutMarkers: [
    "button:has-text('Sign in')",
    "button:has-text('Log in')",
    "a:has-text('Sign in')",
    "a:has-text('Log in')",
    "button:has-text('Sign up')"
  ],
  loggedInMarkers: [
    "textarea",
    "[contenteditable='true']",
    "div[role='textbox']"
  ]
};
