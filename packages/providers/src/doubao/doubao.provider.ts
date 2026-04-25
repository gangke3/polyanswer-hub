import { createId, nowIso, type ProviderAnswer } from "@multi-ai/shared";
import { AbstractProviderAdapter } from "../base/AbstractProviderAdapter.js";
import type { ProviderContext } from "../base/ProviderContext.js";
import { normalizeAnswerText } from "../shared/extraction.js";
import { sleep } from "../shared/timing.js";
import { doubaoSelectors } from "./selectors.js";

export class DoubaoProvider extends AbstractProviderAdapter {
  private readonly preferredAnswerSelectors = [
    ".flow-markdown-body",
    ".markdown",
    ".message-content"
  ];

  private readonly quietPeriodMs = 10000;

  constructor() {
    super("doubao", "Doubao", "https://www.doubao.com/chat/", "https://www.doubao.com/chat/");
  }

  protected override getSelectors() {
    return doubaoSelectors;
  }

  async ask(ctx: ProviderContext, prompt: string): Promise<void> {
    const session = this.getSession(ctx);
    const input = session.page.locator("textarea").first();

    await input.waitFor({ state: "visible", timeout: 15000 });
    await input.fill(prompt);

    const sendButton = session.page
      .locator("button[class*='send-msg-btn'], button[class*='send']")
      .last();

    await sendButton.waitFor({ state: "visible", timeout: 5000 });
    await sendButton.click({ force: true });
  }

  async checkLogin(ctx: ProviderContext): Promise<boolean> {
    const session = this.getSession(ctx);
    await session.page.goto(this.homepage, { waitUntil: "domcontentloaded" });
    const bodyText = await session.page.locator("body").innerText().catch(() => "");

    if (
      bodyText.includes("登录以解锁更多功能") ||
      bodyText.includes("抖音一键登录") ||
      bodyText.includes("请完成验证后继续")
    ) {
      return false;
    }

    return super.checkLogin(ctx);
  }

  async waitForAnswerComplete(ctx: ProviderContext): Promise<void> {
    const session = this.getSession(ctx);
    const deadline = Date.now() + ctx.timeoutMs;
    let previousText = "";
    let lastChangeAt = Date.now();

    while (Date.now() < deadline) {
      const bodyText = await session.page.locator("body").innerText().catch(() => "");
      if (
        bodyText.includes("登录以解锁更多功能") ||
        bodyText.includes("抖音一键登录") ||
        bodyText.includes("请完成验证后继续")
      ) {
        throw new Error("Doubao requires manual verification in the browser before it can return an answer");
      }

      const latestText = await this.readLatestAnswerText(ctx);
      if (!latestText) {
        await sleep(1500);
        continue;
      }

      if (latestText !== previousText) {
        previousText = latestText;
        lastChangeAt = Date.now();
      }

      if (Date.now() - lastChangeAt >= this.quietPeriodMs) {
        return;
      }

      await sleep(1500);
    }

    throw new Error("Timed out while waiting for Doubao answer completion");
  }

  async extractAnswer(ctx: ProviderContext, prompt: string): Promise<ProviderAnswer> {
    const artifacts = await this.captureArtifacts(ctx, `${ctx.taskId}-${this.id}`);
    const answerText = await this.readLatestAnswerText(ctx);

    if (!answerText) {
      throw new Error("Doubao answer text is empty");
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

      const text = normalizeAnswerText(
        await locator.nth(count - 1).innerText().catch(() => "")
      );

      if (text) {
        return text;
      }
    }

    return "";
  }
}
