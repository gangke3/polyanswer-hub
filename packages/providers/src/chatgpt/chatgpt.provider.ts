import {
  firstAttachedLocator,
  firstVisibleLocator,
  waitForNetworkSettled
} from "@multi-ai/browser-runner";
import { createId, nowIso } from "@multi-ai/shared";
import { normalizeAnswerText } from "../shared/extraction.js";
import { sleep } from "../shared/timing.js";
import { AbstractProviderAdapter } from "../base/AbstractProviderAdapter.js";
import type { ProviderContext } from "../base/ProviderContext.js";
import { chatgptSelectors } from "./selectors.js";

export class ChatGPTProvider extends AbstractProviderAdapter {
  constructor() {
    super("chatgpt", "ChatGPT", "https://chatgpt.com/", "https://chatgpt.com/");
  }

  async checkLogin(ctx: ProviderContext): Promise<boolean> {
    const session = this.getSession(ctx);
    await session.page.goto(this.homepage, { waitUntil: "domcontentloaded" });
    await waitForNetworkSettled(session.page);
    const bodyText = await session.page.locator("body").innerText().catch(() => "");

    if (bodyText.includes("登录以获取基于已保存聊天的回答") || bodyText.includes("免费注册")) {
      return false;
    }

    const challengeMarker = await firstAttachedLocator(
      session.page,
      chatgptSelectors.challengeMarkers ?? [],
      1200
    );

    if (challengeMarker) {
      return false;
    }

    const loggedOutMarker = await firstAttachedLocator(
      session.page,
      chatgptSelectors.loggedOutMarkers ?? [],
      1500
    );

    if (loggedOutMarker) {
      return false;
    }

    const promptInput = await firstVisibleLocator(
      session.page,
      chatgptSelectors.loggedInMarkers ?? chatgptSelectors.promptInputCandidates,
      2500
    );

    if (promptInput) {
      return true;
    }

    return !loggedOutMarker;
  }

  async openHome(ctx: ProviderContext): Promise<void> {
    const session = this.getSession(ctx);
    await session.page.goto(this.homepage, { waitUntil: "domcontentloaded" });
    await waitForNetworkSettled(session.page);
  }

  async openLogin(ctx: ProviderContext): Promise<void> {
    const session = this.getSession(ctx);
    await session.page.goto(this.loginUrl, { waitUntil: "domcontentloaded" });
    await waitForNetworkSettled(session.page);
  }

  async waitForManualLogin(ctx: ProviderContext): Promise<void> {
    const session = this.getSession(ctx);
    await session.page.bringToFront();
    const deadline = Date.now() + ctx.timeoutMs;

    while (Date.now() < deadline) {
      const challengeMarker = await firstAttachedLocator(
        session.page,
        chatgptSelectors.challengeMarkers ?? [],
        1000
      );

      if (challengeMarker) {
        await sleep(2000);
        continue;
      }

      const input = await firstVisibleLocator(
        session.page,
        chatgptSelectors.loggedInMarkers ?? chatgptSelectors.promptInputCandidates,
        1500
      );

      if (input) {
        return;
      }
    }

    throw new Error("Timed out waiting for ChatGPT manual login or challenge clearance");
  }

  async ask(ctx: ProviderContext, prompt: string): Promise<void> {
    const session = this.getSession(ctx);
    const input = await firstVisibleLocator(
      session.page,
      chatgptSelectors.promptInputCandidates,
      15000
    );

    if (!input) {
      throw new Error("ChatGPT prompt input not found");
    }

    await input.click();
    await input.fill(prompt);

    const sendButton = await firstVisibleLocator(
      session.page,
      chatgptSelectors.submitButtonCandidates,
      5000
    );

    if (sendButton) {
      await sendButton.click();
      return;
    }

    await input.press("Enter");
  }

  async waitForAnswerComplete(ctx: ProviderContext): Promise<void> {
    const session = this.getSession(ctx);
    const deadline = Date.now() + ctx.timeoutMs;
    let stableIterations = 0;
    let previousText = "";
    let loopCount = 0;

    while (Date.now() < deadline) {
      loopCount += 1;

      // login 检查改为低频
      if (loopCount % 6 === 1) {
        const bodyText = await session.page.locator("body").innerText().catch(() => "");
        if (bodyText.includes("登录以获取基于已保存聊天的回答") || bodyText.includes("免费注册")) {
          throw new Error("ChatGPT requires login before it can return an answer");
        }
      }

      const answers = session.page.locator(chatgptSelectors.answerContainerCandidates.join(", "));
      const count = await answers.count().catch(() => 0);
      if (count === 0) {
        await sleep(300);
        continue;
      }

      const latest = answers.nth(count - 1);
      const latestText = normalizeAnswerText(await latest.innerText().catch(() => ""));
      if (!latestText) {
        await sleep(300);
        continue;
      }

      // 并发获取 DOM 状态，减少 IPC
      const [isTypingIndicatorVisible, isStreaming] = await Promise.all([
        session.page.locator("[data-testid='typing-animation'], .result-thinking, .animate-pulse").first().isVisible().catch(() => false),
        session.page.locator("button[aria-label*='Stop'], button:has-text('Stop')").first().isVisible().catch(() => false)
      ]);

      if (latestText === previousText) {
        stableIterations += 1;
      } else {
        previousText = latestText;
        stableIterations = 0;
      }

      if (!isStreaming && !isTypingIndicatorVisible && stableIterations >= 1) {
        return;
      }

      await sleep(300);
    }

    throw new Error("Timed out while waiting for ChatGPT answer completion");
  }

  async extractAnswer(ctx: ProviderContext, prompt: string) {
    const session = this.getSession(ctx);
    const answers = session.page.locator(chatgptSelectors.answerContainerCandidates.join(", "));
    const count = await answers.count();
    if (count === 0) {
      throw new Error("No ChatGPT answer containers were found");
    }

    const latest = answers.nth(count - 1);
    const answerText = normalizeAnswerText(await latest.innerText());
    const artifacts = await this.captureArtifacts(ctx, `${ctx.taskId}-${this.id}-${Date.now()}`);

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
}
