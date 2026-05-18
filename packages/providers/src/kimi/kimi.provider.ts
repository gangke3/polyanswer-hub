import { AbstractProviderAdapter } from "../base/AbstractProviderAdapter.js";
import { firstAttachedLocator } from "@multi-ai/browser-runner";
import { createId, nowIso, type ProviderAnswer } from "@multi-ai/shared";
import type { ProviderContext } from "../base/ProviderContext.js";
import { normalizeAnswerText } from "../shared/extraction.js";
import { sleep } from "../shared/timing.js";
import { kimiSelectors } from "./selectors.js";

export class KimiProvider extends AbstractProviderAdapter {
  private readonly preferredAnswerSelectors = [
    ".segment.segment-assistant .markdown",
    ".segment.segment-assistant .markdown-container",
    ".chat-content-item-assistant .markdown",
    ".chat-content-item-assistant .segment-content",
    ".chat-content-item-assistant",
    ".segment.segment-assistant"
  ];

  private readonly quietPeriodMs = 800;    // 原 6000ms → 2000ms → 800ms
  private readonly finalDomSettleMs = 200;  // 原 1000ms → 500ms → 200ms

  constructor() {
    super("kimi", "Kimi", "https://www.kimi.com/", "https://www.kimi.com/");
  }

  protected override getSelectors() {
    return kimiSelectors;
  }

  async waitForAnswerComplete(ctx: ProviderContext): Promise<void> {
    const session = this.getSession(ctx);
    const deadline = Date.now() + ctx.timeoutMs;
    let previousText = "";
    let lastChangeAt = Date.now();
    let loopCount = 0;

    while (Date.now() < deadline) {
      loopCount += 1;

      // login 检查改为低频（每 8 次一次）
      if (loopCount % 8 === 1) {
        const loginPrompt = await firstAttachedLocator(
          session.page,
          kimiSelectors.loggedOutMarkers ?? [],
          300
        );

        if (loginPrompt) {
          throw new Error("Kimi requires login before it can return an answer");
        }
      }

      const latestText = await this.readLatestAnswerText(ctx);
      if (!latestText) {
        await sleep(200);
        continue;
      }

      if (await this.isStillGenerating(ctx)) {
        lastChangeAt = Date.now();
        await sleep(200);
        continue;
      }

      if (latestText !== previousText) {
        previousText = latestText;
        lastChangeAt = Date.now();
      }

      if (Date.now() - lastChangeAt >= this.quietPeriodMs) {
        await sleep(this.finalDomSettleMs);
        return;
      }

      await sleep(200);
    }

    throw new Error("Timed out while waiting for Kimi answer completion");
  }

  async extractAnswer(ctx: ProviderContext, prompt: string): Promise<ProviderAnswer> {
    const artifacts = await this.captureArtifacts(ctx, `${ctx.taskId}-${this.id}`);
    const answerText = await this.readLatestAnswerText(ctx);

    if (!answerText) {
      throw new Error("Kimi answer text is empty");
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
        const text = normalizeAnswerText(
          await locator.nth(index).innerText().catch(() => "")
        );

        if (text && !this.isToolOnlyText(text)) {
          return text;
        }
      }
    }

    const candidates = await session.page
      .locator(kimiSelectors.answerContainerCandidates.join(", "))
      .evaluateAll((elements) =>
        elements
          .map((element) => (element as HTMLElement).innerText ?? "")
          .map((text) => text.trim())
          .filter(Boolean)
      )
      .catch(() => []);

    const latest = [...candidates].reverse().find((text) => !this.isToolOnlyText(text));
    return normalizeAnswerText(latest ?? "");
  }

  private async isStillGenerating(ctx: ProviderContext): Promise<boolean> {
    const session = this.getSession(ctx);
    const generatingSelectors = [
      ".send-button-container.stop",
      "svg[name='stop']",
      ".running-text",
      ".toolcall-container .running-text"
    ];

    // 并行查询，避免 N 次串行 IPC
    const [selectorResults, bodyText] = await Promise.all([
      Promise.all(
        generatingSelectors.map((sel) =>
          session.page.locator(sel).first().isVisible().catch(() => false)
        )
      ),
      session.page.locator("body").innerText().catch(() => "")
    ]);

    if (selectorResults.some(Boolean)) return true;
    return (
      bodyText.includes("正在搜索网页") ||
      bodyText.includes("正在思考") ||
      bodyText.includes("正在生成")
    );
  }

  private isToolOnlyText(text: string): boolean {
    const normalized = normalizeAnswerText(text);
    if (!normalized) {
      return true;
    }

    const toolOnlyMarkers = [
      "正在搜索网页",
      "搜索网页",
      "结果",
      "篇资料",
      "个网页"
    ];

    return normalized.length < 200 && toolOnlyMarkers.some((marker) => normalized.includes(marker));
  }
}
