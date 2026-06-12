import { firstVisibleLocator, waitForNetworkSettled } from "@multi-ai/browser-runner";
import type { Locator } from "playwright";
import { createId, nowIso, type ProviderAnswer } from "@multi-ai/shared";
import { AbstractProviderAdapter } from "../base/AbstractProviderAdapter.js";
import type { ProviderContext } from "../base/ProviderContext.js";
import { normalizeAnswerText } from "../shared/extraction.js";
import { sleep } from "../shared/timing.js";
import { geminiSelectors } from "./selectors.js";

export class GeminiProvider extends AbstractProviderAdapter {
  private readonly pendingBaselines = new Map<
    string,
    { answerCount: number; answerText: string }
  >();

  private readonly preferredAnswerSelectors = [
    ".model-response-text",
    ".response-container .model-response-text",
    "message-content .markdown",
    "message-content [class*='markdown']",
    "message-content",
    "[data-test-id='response-content']",
    ".response-container-content",
    ".response-container",
    "response-container",
    "model-response",
    "[class*='response-content']",
    "[class*='model-response-text']",
    ".markdown",
    ".model-response"
  ];

  private readonly quietPeriodMs = 1000;   // 原 12000ms → 2500ms → 1000ms
  private readonly finalDomSettleMs = 200;  // 原 2500ms → 800ms → 200ms

  constructor() {
    super("gemini", "Gemini", "https://gemini.google.com/", "https://gemini.google.com/");
  }

  protected override getSelectors() {
    return geminiSelectors;
  }

  override async checkLogin(ctx: ProviderContext): Promise<boolean> {
    const session = this.getSession(ctx);
    await session.page.goto(this.homepage, { waitUntil: "domcontentloaded" });
    await waitForNetworkSettled(session.page);

    if (session.page.url().includes("accounts.google.com")) {
      return false;
    }

    if (await this.findPromptInput(ctx, 3500)) {
      return true;
    }

    const existingAnswer = await this.readLatestAnswerState(ctx);
    if (existingAnswer.answerText) {
      return true;
    }

    return !(await this.hasVisibleLoginCallToAction(ctx));
  }

  async ask(ctx: ProviderContext, prompt: string): Promise<void> {
    const inputCandidate = await this.findPromptInput(ctx, 15000);

    if (!inputCandidate) {
      throw new Error("Gemini prompt input not found");
    }

    const baseline = await this.readLatestAnswerState(ctx);
    this.pendingBaselines.set(ctx.taskId, baseline);

    const input = await this.resolvePromptInput(inputCandidate);
    await this.writePrompt(input, prompt);
    await sleep(400);

    if (await this.submitPrompt(ctx, input, prompt)) {
      return;
    }

    throw new Error("Gemini prompt was filled, but submit did not start");
  }

  async waitForAnswerComplete(ctx: ProviderContext): Promise<void> {
    const deadline = Date.now() + ctx.timeoutMs;
    const storedBaseline = this.pendingBaselines.get(ctx.taskId);
    const currentBaseline = storedBaseline ?? (await this.readLatestAnswerState(ctx));
    let previousText = "";
    let lastChangeAt = Date.now();
    let sawFreshAnswer = !currentBaseline.answerText;
    let loopCount = 0;

    try {
      while (Date.now() < deadline) {
        loopCount += 1;
        const latestAnswer = await this.readLatestAnswerState(ctx);
        const latestText = latestAnswer.answerText;

        if (!latestText) {
          // login 检查仅在内容为空时执行，且每 4 次一次
          if (loopCount % 4 === 1 && await this.isLoginRequired(ctx)) {
            throw new Error("Gemini requires login before it can return an answer");
          }

          await sleep(200);
          continue;
        }

        if (!sawFreshAnswer) {
          const hasNewAnswerNode = latestAnswer.answerCount > currentBaseline.answerCount;
          const hasChangedAnswerText = latestText !== currentBaseline.answerText;

          if (!hasNewAnswerNode && !hasChangedAnswerText) {
            await sleep(200);
            continue;
          }

          sawFreshAnswer = true;
          previousText = latestText;
          lastChangeAt = Date.now();
        }

        if (await this.isStillGenerating(ctx)) {
          if (latestText !== previousText) {
            previousText = latestText;
            lastChangeAt = Date.now();
          }
          await sleep(200);
          continue;
        }

        if (latestText !== previousText) {
          previousText = latestText;
          lastChangeAt = Date.now();
        }

        if (Date.now() - lastChangeAt >= this.quietPeriodMs) {
          await sleep(this.finalDomSettleMs);
          // ---- 完成后二次读取：等待额外 500ms 后重新获取答案 ----
          await sleep(500);
          const recheckAnswer = await this.readLatestAnswerState(ctx);
          if (recheckAnswer.answerText && recheckAnswer.answerText !== previousText) {
            previousText = recheckAnswer.answerText;
            lastChangeAt = Date.now();
            // 继续等待直到再次稳定
            while (Date.now() < deadline) {
              await sleep(200);
              const nextAnswer = await this.readLatestAnswerState(ctx);
              if (nextAnswer.answerText !== previousText) {
                previousText = nextAnswer.answerText;
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
            }
          }
          return;
        }

        await sleep(200);
      }
    } finally {
      this.pendingBaselines.delete(ctx.taskId);
    }

    throw new Error("Timed out while waiting for Gemini answer completion");
  }

  async extractAnswer(ctx: ProviderContext, prompt: string): Promise<ProviderAnswer> {
    const artifacts = await this.captureArtifacts(ctx, `${ctx.taskId}-${this.id}`);
    const answerText = await this.readLatestAnswerText(ctx);

    if (!answerText) {
      throw new Error("Gemini answer text is empty");
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
    return (await this.readLatestAnswerState(ctx)).answerText;
  }

  private async readLatestAnswerState(
    ctx: ProviderContext
  ): Promise<{ answerCount: number; answerText: string }> {
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
          return { answerCount: count, answerText: text };
        }
      }
    }

    return { answerCount: 0, answerText: "" };
  }

  private async isStillGenerating(ctx: ProviderContext): Promise<boolean> {
    const session = this.getSession(ctx);
    const generatingSelectors = [
      "button[aria-label*='Stop']",
      "button[aria-label*='停止']",
      "button:has-text('Stop')",
      "button:has-text('停止')",
      ".response-loading-container",
      ".thinking",
      ".model-thoughts",
      ".loading-animation",
      ".progress-bar"
    ];

    // 并行查询所有选择器，和以前的串行循环相比大幅减少 IPC 往返次数
    const results = await Promise.all(
      generatingSelectors.map((sel) =>
        session.page.locator(sel).first().isVisible().catch(() => false)
      )
    );
    return results.some(Boolean);
  }

  private async waitForReadySendButton(ctx: ProviderContext): Promise<Locator | undefined> {
    const session = this.getSession(ctx);
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const sendButton = await firstVisibleLocator(session.page, geminiSelectors.submitButtonCandidates, 800);

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

  private async findPromptInput(ctx: ProviderContext, timeoutMs: number): Promise<Locator | undefined> {
    const session = this.getSession(ctx);
    return firstVisibleLocator(session.page, geminiSelectors.promptInputCandidates, timeoutMs);
  }

  private async hasVisibleLoginCallToAction(ctx: ProviderContext): Promise<boolean> {
    const session = this.getSession(ctx);

    for (const selector of geminiSelectors.loggedOutMarkers ?? []) {
      const visible = await session.page.locator(selector).first().isVisible().catch(() => false);
      if (visible) {
        return true;
      }
    }

    return false;
  }

  private async submitPrompt(ctx: ProviderContext, input: Locator, prompt: string): Promise<boolean> {
    const session = this.getSession(ctx);
    const sendButton = await this.waitForReadySendButton(ctx);
    const attempts: Array<() => Promise<void>> = [];

    if (sendButton) {
      attempts.push(
        async () => {
          await sendButton.scrollIntoViewIfNeeded().catch(() => undefined);
          await sendButton.click({ force: true, timeout: 3000 });
        },
        async () => {
          await sendButton.evaluate((element) => {
            (element as HTMLElement).click();
          });
        }
      );
    }

    attempts.push(
      async () => {
        await input.press("Enter");
      },
      async () => {
        await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
      },
      async () => {
        await session.page.keyboard.press("Enter");
      }
    );

    for (const attempt of attempts) {
      await attempt().catch(() => undefined);
      await sleep(1200);

      if (!(await this.promptStillInInput(input, prompt))) {
        return true;
      }

      const latestText = await this.readLatestAnswerText(ctx);
      if (latestText && latestText !== prompt && !latestText.includes(prompt)) {
        return true;
      }
    }

    return false;
  }

  private async resolvePromptInput(input: Locator): Promise<Locator> {
    const editableChild = input.locator("[contenteditable='true']").first();
    if ((await editableChild.count().catch(() => 0)) > 0) {
      return editableChild;
    }

    return input;
  }

  private async writePrompt(input: Locator, prompt: string): Promise<void> {
    await input.click({ force: true }).catch(() => undefined);

    try {
      await input.fill(prompt);
      return;
    } catch {
      // Gemini commonly uses a rich contenteditable input; fill() is not always supported there.
    }

    await input.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => undefined);
    await input.press("Backspace").catch(() => undefined);
    await input.evaluate((element, value) => {
      const target = element as HTMLElement;
      target.focus();

      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
        target.value = value;
      } else {
        target.textContent = value;
      }

      target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
    }, prompt);
  }

  private async promptStillInInput(input: Locator, prompt: string): Promise<boolean> {
    const inputText = normalizeAnswerText(await input.innerText().catch(() => ""));
    const inputValue = normalizeAnswerText(await input.inputValue().catch(() => ""));
    const normalizedPrompt = normalizeAnswerText(prompt);

    return inputText.includes(normalizedPrompt) || inputValue.includes(normalizedPrompt);
  }

  private async isLoginRequired(ctx: ProviderContext): Promise<boolean> {
    const session = this.getSession(ctx);

    if (session.page.url().includes("accounts.google.com")) {
      return true;
    }

    if (await this.findPromptInput(ctx, 500)) {
      return false;
    }

    const latestAnswer = await this.readLatestAnswerState(ctx);
    if (latestAnswer.answerText) {
      return false;
    }

    return this.hasVisibleLoginCallToAction(ctx);
  }

  private isUiOnlyText(text: string): boolean {
    const normalized = normalizeAnswerText(text);
    if (!normalized) {
      return true;
    }

    const uiMarkers = [
      "Gemini",
      "Deep Research",
      "Canvas",
      "上传",
      "分享",
      "复制",
      "编辑",
      "重试",
      "继续生成",
      "停止生成",
      "Google AI"
    ];

    return normalized.length < 120 && uiMarkers.some((marker) => normalized.includes(marker));
  }
}
