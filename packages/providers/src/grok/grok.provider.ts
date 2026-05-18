import {
  firstAttachedLocator,
  firstVisibleLocator,
  waitForNetworkSettled
} from "@multi-ai/browser-runner";
import { createId, nowIso, type ProviderAnswer } from "@multi-ai/shared";
import { AbstractProviderAdapter } from "../base/AbstractProviderAdapter.js";
import type { ProviderContext } from "../base/ProviderContext.js";
import { normalizeAnswerText } from "../shared/extraction.js";
import { sleep } from "../shared/timing.js";
import { grokSelectors } from "./selectors.js";

export class GrokProvider extends AbstractProviderAdapter {
  private readonly preferredAnswerSelectors = [
    ".markdown-content",
    ".message-bubble",
    "[class*='markdown']",
    "[class*='response']",
    "[class*='message-content']",
    "[class*='assistant']",
    ".prose"
  ];

  private readonly quietPeriodMs = 800;    // 原 8000ms → 2000ms → 800ms
  private readonly finalDomSettleMs = 200;  // 原 1500ms → 500ms → 200ms

  constructor() {
    super("grok", "Grok", "https://grok.com/", "https://grok.com/");
  }

  protected override getSelectors() {
    return grokSelectors;
  }

  async checkLogin(ctx: ProviderContext): Promise<boolean> {
    const session = this.getSession(ctx);
    await session.page.goto(this.homepage, { waitUntil: "domcontentloaded" });
    await waitForNetworkSettled(session.page);

    const currentUrl = session.page.url();

    // Redirected to login or auth page
    if (currentUrl.includes("/login") || currentUrl.includes("/auth") || currentUrl.includes("accounts.")) {
      return false;
    }

    const bodyText = await session.page.locator("body").innerText().catch(() => "");
    if (this.isLoginRequired(currentUrl, bodyText)) {
      return false;
    }

    const loggedOutMarker = await firstAttachedLocator(
      session.page,
      grokSelectors.loggedOutMarkers ?? [],
      1500
    );

    if (loggedOutMarker) {
      return false;
    }

    const promptInput = await firstVisibleLocator(
      session.page,
      grokSelectors.loggedInMarkers ?? grokSelectors.promptInputCandidates,
      3000
    );

    return Boolean(promptInput);
  }

  async ask(ctx: ProviderContext, prompt: string): Promise<void> {
    const session = this.getSession(ctx);
    const input = await firstVisibleLocator(session.page, grokSelectors.promptInputCandidates, 15000);

    if (!input) {
      throw new Error("Grok prompt input not found");
    }

    await input.click({ force: true }).catch(() => undefined);
    await session.page.keyboard.press("Control+A").catch(() => undefined);
    await session.page.keyboard.press("Meta+A").catch(() => undefined);
    await session.page.keyboard.press("Backspace").catch(() => undefined);

    try {
      await input.fill(prompt);
    } catch {
      // Grok may use a rich contenteditable editor; fall back to keyboard-based input
      await session.page.keyboard.insertText(prompt);
    }

    await sleep(400);

    const sendButton = await this.waitForReadySendButton(ctx);
    if (sendButton) {
      await sendButton.click({ force: true }).catch(() => undefined);
      return;
    }

    await session.page.keyboard.press("Enter");
  }

  async waitForAnswerComplete(ctx: ProviderContext): Promise<void> {
    const session = this.getSession(ctx);
    const deadline = Date.now() + ctx.timeoutMs;
    const baselineText = await this.readLatestAnswerText(ctx);
    let previousText = "";
    let lastChangeAt = Date.now();
    let sawFreshAnswer = !baselineText;
    let loopCount = 0;

    while (Date.now() < deadline) {
      loopCount += 1;

      // login 检查改为低频（每 6 次一次），避免每次都做昂贵的 body.innerText()
      if (loopCount % 6 === 1) {
        const currentUrl = session.page.url();
        const bodyText = await session.page.locator("body").innerText().catch(() => "");
        if (this.isLoginRequired(currentUrl, bodyText)) {
          throw new Error("Grok requires login before it can return an answer");
        }
      }

      const latestText = await this.readLatestAnswerText(ctx);
      if (!latestText) {
        await sleep(200);
        continue;
      }

      if (!sawFreshAnswer) {
        if (latestText === baselineText) {
          await sleep(200);
          continue;
        }

        sawFreshAnswer = true;
      }

      if (latestText !== previousText) {
        previousText = latestText;
        lastChangeAt = Date.now();
      }

      if (await this.isStillGenerating(ctx)) {
        await sleep(200);
        continue;
      }

      if (Date.now() - lastChangeAt >= this.quietPeriodMs) {
        await sleep(this.finalDomSettleMs);
        return;
      }

      await sleep(200);
    }

    throw new Error("Timed out while waiting for Grok answer completion");
  }

  async extractAnswer(ctx: ProviderContext, prompt: string): Promise<ProviderAnswer> {
    const artifacts = await this.captureArtifacts(ctx, `${ctx.taskId}-${this.id}`);
    const answerText = await this.readLatestAnswerText(ctx);

    if (!answerText) {
      throw new Error("Grok answer text is empty");
    }

    return {
      id: createId("answer"),
      taskProviderId: createId("tp"),
      providerId: ctx.providerId,
      question: prompt,
      answerText,
      rawText: answerText,
      rawHtmlPath: artifacts.rawHtmlPath,
      screenshotPath: artifacts.screenshotPath,
      createdAt: nowIso()
    };
  }

  private async readLatestAnswerText(ctx: ProviderContext): Promise<string> {
    const session = this.getSession(ctx);

    for (const selector of this.preferredAnswerSelectors) {
      const locator = session.page.locator(selector);
      const count = await locator.count().catch(() => 0);
      if (count === 0) {
        continue;
      }

      for (let index = count - 1; index >= Math.max(0, count - 4); index -= 1) {
        const text = this.cleanAnswerText(
          normalizeAnswerText(await locator.nth(index).innerText().catch(() => ""))
        );

        if (text && !this.isUiOnlyText(text)) {
          return text;
        }
      }
    }

    return "";
  }

  private async isStillGenerating(ctx: ProviderContext): Promise<boolean> {
    const session = this.getSession(ctx);
    const generatingSelectors = [
      "button[aria-label*='Stop']",
      "button[aria-label*='stop']",
      "button:has-text('Stop')",
      "button:has-text('停止')",
      "[class*='loading']",
      "[class*='streaming']",
      "[class*='generating']",
      ".animate-pulse",
      ".animate-spin"
    ];

    // 并行查询，避免 N 次串行 IPC
    const results = await Promise.all(
      generatingSelectors.map((sel) =>
        session.page.locator(sel).first().isVisible().catch(() => false)
      )
    );
    return results.some(Boolean);
  }

  private async waitForReadySendButton(ctx: ProviderContext) {
    const session = this.getSession(ctx);
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const sendButton = await firstVisibleLocator(session.page, grokSelectors.submitButtonCandidates, 800);

      if (sendButton) {
        const ariaDisabled = await sendButton.getAttribute("aria-disabled").catch(() => null);
        const disabled = await sendButton.isDisabled().catch(() => false);

        if (!disabled && ariaDisabled !== "true") {
          return sendButton;
        }
      }

      await sleep(200);
    }

    return undefined;
  }

  private cleanAnswerText(text: string): string {
    if (!text) {
      return "";
    }

    const uiOnlyLines = new Set([
      "Copy",
      "Retry",
      "Share",
      "Edit",
      "Good response",
      "Bad response",
      "Regenerate",
      "Like",
      "Dislike"
    ]);
    const lines = text
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean);

    while (lines.length > 0 && uiOnlyLines.has(lines[lines.length - 1])) {
      lines.pop();
    }

    return lines.join("\n").trim();
  }

  private isLoginRequired(url: string, bodyText: string): boolean {
    const normalizedUrl = url.toLowerCase();
    if (normalizedUrl.includes("/login") || normalizedUrl.includes("/auth")) {
      return true;
    }

    return (
      bodyText.includes("Sign in") &&
      (bodyText.includes("Sign up") || bodyText.includes("Create account") || bodyText.includes("Log in"))
    );
  }

  private isUiOnlyText(text: string): boolean {
    const normalized = normalizeAnswerText(text);
    if (!normalized) {
      return true;
    }

    const uiMarkers = [
      "Sign in",
      "Log in",
      "Copy",
      "Retry",
      "Share",
      "Like",
      "Dislike",
      "Regenerate"
    ];

    return normalized.length < 120 && uiMarkers.some((marker) => normalized.includes(marker));
  }
}
