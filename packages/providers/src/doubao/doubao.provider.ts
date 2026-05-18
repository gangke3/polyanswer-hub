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

  private readonly inputChunkPauseMs = 500;
  private readonly inputChunkTargetLength = 120;
  private readonly quietPeriodMs = 1500;   // 原 5000ms → 1500ms
  private readonly loginMarkers = [
    "\u767b\u5f55\u4ee5\u89e3\u9501\u66f4\u591a\u529f\u80fd",
    "\u6296\u97f3\u4e00\u952e\u767b\u5f55",
    "\u8bf7\u5b8c\u6210\u9a8c\u8bc1\u540e\u7ee7\u7eed"
  ];

  constructor() {
    super("doubao", "Doubao", "https://www.doubao.com/chat/", "https://www.doubao.com/chat/");
  }

  protected override getSelectors() {
    return doubaoSelectors;
  }

  async ask(ctx: ProviderContext, prompt: string): Promise<void> {
    const session = this.getSession(ctx);
    const input = session.page
      .locator("textarea[placeholder*='\u53d1\u6d88\u606f'], textarea, [contenteditable='true']")
      .first();

    await input.waitFor({ state: "visible", timeout: 15000 });
    await input.click({ force: true }).catch(() => undefined);
    await input.fill("").catch(() => undefined);
    await session.page.keyboard.press("Control+A").catch(() => undefined);
    await session.page.keyboard.press("Meta+A").catch(() => undefined);
    await session.page.keyboard.press("Backspace").catch(() => undefined);

    const chunks = this.splitPromptIntoChunks(prompt);
    for (let index = 0; index < chunks.length; index += 1) {
      await session.page.keyboard.type(chunks[index], { delay: 10 });
      if (index < chunks.length - 1) {
        await sleep(this.inputChunkPauseMs);
      }
    }

    const sendButton = session.page
      .locator("button[class*='send-msg-btn'], button[class*='send'], button[type='submit']")
      .last();

    if (await sendButton.isVisible().catch(() => false)) {
      await sendButton.click({ force: true }).catch(() => undefined);
      return;
    }

    await session.page.keyboard.press("Enter");
  }

  async checkLogin(ctx: ProviderContext): Promise<boolean> {
    const session = this.getSession(ctx);
    await session.page.goto(this.homepage, { waitUntil: "domcontentloaded" });
    const bodyText = await session.page.locator("body").innerText().catch(() => "");

    if (this.loginMarkers.some((marker) => bodyText.includes(marker))) {
      return false;
    }

    return super.checkLogin(ctx);
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

      // login 检查改为低频（每 6 次一次）
      if (loopCount % 6 === 1) {
        const bodyText = await session.page.locator("body").innerText().catch(() => "");
        if (this.loginMarkers.some((marker) => bodyText.includes(marker))) {
          throw new Error("Doubao requires manual verification in the browser before it can return an answer");
        }
      }

      const latestText = await this.readLatestAnswerText(ctx);
      if (!latestText) {
        await sleep(300);
        continue;
      }

      if (!sawFreshAnswer) {
        if (latestText === baselineText) {
          await sleep(300);
          continue;
        }

        sawFreshAnswer = true;
      }

      if (await this.isStillGenerating(ctx)) {
        if (latestText !== previousText) {
          previousText = latestText;
          lastChangeAt = Date.now();
        }
        await sleep(300);
        continue;
      }

      if (latestText !== previousText) {
        previousText = latestText;
        lastChangeAt = Date.now();
      }

      if (Date.now() - lastChangeAt >= this.quietPeriodMs) {
        return;
      }

      await sleep(300);
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

      for (let index = count - 1; index >= Math.max(0, count - 4); index -= 1) {
        const text = normalizeAnswerText(await locator.nth(index).innerText().catch(() => ""));
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
      "button:has-text('停止')",
      "button:has-text('停止生成')",
      "[class*='loading']",
      "[class*='typing']",
      ".animate-pulse"
    ];

    const results = await Promise.all(
      generatingSelectors.map((sel) =>
        session.page.locator(sel).first().isVisible().catch(() => false)
      )
    );
    return results.some(Boolean);
  }

  private isUiOnlyText(text: string): boolean {
    const normalized = normalizeAnswerText(text);
    if (!normalized) {
      return true;
    }

    const uiMarkers = [
      "\u91cd\u65b0\u751f\u6210",
      "\u590d\u5236",
      "\u5206\u4eab",
      "\u70b9\u8d5e",
      "\u70b9\u8e29",
      "\u4e0a\u4f20\u9644\u4ef6"
    ];
    return normalized.length < 120 && uiMarkers.some((marker) => normalized.includes(marker));
  }

  private splitPromptIntoChunks(prompt: string): string[] {
    const normalized = prompt.replace(/\r\n/g, "\n");
    if (normalized.length <= this.inputChunkTargetLength) {
      return [normalized];
    }

    const tokens = normalized.match(/[^\n]+(?:\n+|$)|\n+/g) ?? [normalized];
    const chunks: string[] = [];
    let current = "";

    const pushChunk = (value: string) => {
      if (value) {
        chunks.push(value);
      }
    };

    const appendToken = (token: string) => {
      if (token.length <= this.inputChunkTargetLength) {
        if (current.length + token.length > this.inputChunkTargetLength && current) {
          pushChunk(current);
          current = "";
        }
        current += token;
        return;
      }

      if (current) {
        pushChunk(current);
        current = "";
      }

      for (let index = 0; index < token.length; index += this.inputChunkTargetLength) {
        pushChunk(token.slice(index, index + this.inputChunkTargetLength));
      }
    };

    for (const token of tokens) {
      appendToken(token);
    }

    pushChunk(current);
    return chunks.filter((chunk) => chunk.length > 0);
  }
}
