import path from "node:path";
import {
  captureSnapshot,
  firstAttachedLocator,
  firstVisibleLocator,
  waitForNetworkSettled,
  type ActiveBrowserSession
} from "@multi-ai/browser-runner";
import { createId, nowIso, type ProviderAnswer, type ProviderId } from "@multi-ai/shared";
import type { ProviderAdapter } from "./ProviderAdapter.js";
import type { ProviderContext } from "./ProviderContext.js";
import type { ProviderSelectors } from "./selector.types.js";
import { normalizeAnswerText } from "../shared/extraction.js";
import { sleep } from "../shared/timing.js";
import { isAnswerIncomplete as checkIncomplete } from "../shared/answerValidator.js";

export abstract class AbstractProviderAdapter implements ProviderAdapter {
  constructor(
    public readonly id: ProviderId,
    public readonly name: string,
    public readonly homepage: string,
    public readonly loginUrl: string
  ) {}

  protected getSelectors(): ProviderSelectors | undefined {
    return undefined;
  }

  async checkLogin(ctx: ProviderContext): Promise<boolean> {
    const selectors = this.getSelectors();
    if (!selectors) {
      return false;
    }

    const session = this.getSession(ctx);
    const currentUrl = session.page.url();
    const homepageHost = new URL(this.homepage).host;

    // 若当前页面已在该 provider 主域，避免重复导航（节省 2-4 秒）
    let alreadyOnSite = false;
    try {
      alreadyOnSite = new URL(currentUrl).host === homepageHost;
    } catch {
      // ignore
    }

    if (!alreadyOnSite) {
      await session.page.goto(this.homepage, { waitUntil: "domcontentloaded" });
      await waitForNetworkSettled(session.page);
    }

    const challengeMarker = selectors.challengeMarkers?.length
      ? await firstAttachedLocator(session.page, selectors.challengeMarkers, 1200)
      : undefined;

    if (challengeMarker) {
      return false;
    }

    const loggedOutMarker = selectors.loggedOutMarkers?.length
      ? await firstAttachedLocator(session.page, selectors.loggedOutMarkers, 1500)
      : undefined;

    if (loggedOutMarker) {
      return false;
    }

    const promptInput = await firstVisibleLocator(
      session.page,
      selectors.loggedInMarkers ?? selectors.promptInputCandidates,
      2500
    );

    if (promptInput) {
      return true;
    }

    return !loggedOutMarker;
  }

  async openHome(ctx: ProviderContext): Promise<void> {
    const session = this.getSession(ctx);
    // 如果已在目标域名，跳过重复导航（checkLogin 已导航过，节省 2-4 秒）
    const currentUrl = session.page.url();
    const homepageHost = new URL(this.homepage).host;
    try {
      if (new URL(currentUrl).host === homepageHost && !session.page.isClosed()) {
        return;
      }
    } catch {
      // ignore invalid URL
    }
    await session.page.goto(this.homepage, { waitUntil: "domcontentloaded" });
    await waitForNetworkSettled(session.page);
  }

  async openLogin(ctx: ProviderContext): Promise<void> {
    const session = this.getSession(ctx);
    await session.page.goto(this.loginUrl, { waitUntil: "domcontentloaded" });
    await waitForNetworkSettled(session.page);
  }

  async waitForManualLogin(ctx: ProviderContext): Promise<void> {
    const selectors = this.getSelectors();
    if (!selectors) {
      return;
    }

    const session = this.getSession(ctx);
    await session.page.bringToFront();
    const deadline = Date.now() + ctx.timeoutMs;

    while (Date.now() < deadline) {
      const challengeMarker = selectors.challengeMarkers?.length
        ? await firstAttachedLocator(session.page, selectors.challengeMarkers, 1000)
        : undefined;

      if (challengeMarker) {
        await sleep(1500);
        continue;
      }

      const input = await firstVisibleLocator(
        session.page,
        selectors.loggedInMarkers ?? selectors.promptInputCandidates,
        1500
      );

      if (input) {
        return;
      }

      await sleep(1000);
    }

    throw new Error(`Timed out waiting for ${this.name} manual login`);
  }

  async ask(ctx: ProviderContext, prompt: string): Promise<void> {
    const selectors = this.getSelectors();
    if (!selectors) {
      return;
    }

    const session = this.getSession(ctx);
    const input = await firstVisibleLocator(session.page, selectors.promptInputCandidates, 15000);

    if (!input) {
      throw new Error(`${this.name} prompt input not found`);
    }

    await input.click({ force: true }).catch(() => undefined);
    await this.fillLongText(input, session.page, prompt);

    const sendButton = await firstVisibleLocator(session.page, selectors.submitButtonCandidates, 5000);

    if (sendButton) {
      await sendButton.click({ force: true }).catch(() => undefined);
    } else {
      await input.press("Enter");
    }
  }

  async waitForAnswerComplete(ctx: ProviderContext): Promise<void> {
    const selectors = this.getSelectors();
    if (!selectors) {
      return;
    }

    const session = this.getSession(ctx);
    const deadline = Date.now() + ctx.timeoutMs;
    let stableIterations = 0;
    let previousText = "";

    while (Date.now() < deadline) {
      const answers = session.page.locator(selectors.answerContainerCandidates.join(", "));
      const count = await answers.count();
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

      if (latestText === previousText) {
        stableIterations += 1;
      } else {
        previousText = latestText;
        stableIterations = 0;
      }

      // 需要至少 2 次连续稳定（800ms）才认为完成，避免 LLM 段落间自然停顿触发误判
      if (stableIterations >= 2) {
        // ---- 完成后二次读取：等待额外 DOM 变化并重新获取 ----
        await sleep(500);
        const finalText = normalizeAnswerText(
          await session.page
            .locator(selectors.answerContainerCandidates.join(", "))
            .last()
            .innerText()
            .catch(() => "")
        );

        if (finalText && finalText !== previousText) {
          // 内容仍在变化，继续等待直到再次稳定
          previousText = finalText;
          stableIterations = 0;

          while (Date.now() < deadline) {
            await sleep(400);
            const recheckText = normalizeAnswerText(
              await session.page
                .locator(selectors.answerContainerCandidates.join(", "))
                .last()
                .innerText()
                .catch(() => "")
            );

            if (recheckText === previousText) {
              stableIterations += 1;
            } else {
              previousText = recheckText;
              stableIterations = 0;
            }

            if (stableIterations >= 2) {
              return;
            }
          }
        }

        return;
      }

      await sleep(400);
    }

    throw new Error(`Timed out while waiting for ${this.name} answer completion`);
  }

  protected getSession(ctx: ProviderContext): ActiveBrowserSession {
    if (!ctx.session) {
      throw new Error(`${this.name} session has not been initialized`);
    }

    return ctx.session;
  }

  protected async captureArtifacts(ctx: ProviderContext, prefix: string) {
    const session = this.getSession(ctx);
    const outputDir = path.resolve(process.cwd(), "data", "snapshots", ctx.providerId);
    return captureSnapshot(session.page, outputDir, prefix);
  }

  /**
   * 向输入框填入长文本的健壮方法。
   * 优先使用 evaluate 直接设置 DOM 值（绕过 React/Vue 等框架的受控组件限制），
   * 失败时依次回退到 fill() → keyboard.insertText()。
   *
   * 适用于综合总结等需要输入超长提示词的场景。
   */
  protected async fillLongText(
    input: import("playwright").Locator,
    page: import("playwright").Page,
    text: string
  ): Promise<void> {
    // 策略 1：用 evaluate 直接设置 value / textContent，并触发 input + change 事件
    const evaluateOk = await page.evaluate(
      (args) => {
        const { selector, text } = args;
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) return false;

        el.focus();

        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
          // 使用 native setter 绕过 React 受控组件
          const nativeSetter = Object.getOwnPropertyDescriptor(
            el.constructor.prototype, "value"
          )?.set;
          if (nativeSetter) {
            nativeSetter.call(el, text);
          } else {
            el.value = text;
          }
        } else {
          // contenteditable 元素
          el.textContent = text;
        }

        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
      { selector: await input.evaluate((el) => {
        // 构建一个足够精确的选择器
        if (el.id) return `#${el.id}`;
        const tag = el.tagName.toLowerCase();
        const cls = el.className && typeof el.className === "string"
          ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
          : "";
        return `${tag}${cls}`;
      }), text }
    ).catch(() => false);

    if (evaluateOk) {
      // 验证输入框是否确实包含文本
      const currentVal = await input.inputValue().catch(() => "")
        || await input.innerText().catch(() => "");
      if (currentVal.length >= text.length * 0.9) {
        return; // 成功
      }
    }

    // 策略 2：Playwright fill()
    const fillOk = await input.fill(text).then(() => true).catch(() => false);
    if (fillOk) return;

    // 策略 3：keyboard.insertText（对 contenteditable 更可靠，但长文本较慢）
    await input.click({ force: true }).catch(() => undefined);
    await page.keyboard.press("Control+A").catch(() => undefined);
    await page.keyboard.press("Backspace").catch(() => undefined);
    await page.keyboard.insertText(text);
  }

  async extractAnswer(ctx: ProviderContext, prompt: string): Promise<ProviderAnswer> {
    const selectors = this.getSelectors();
    const artifacts = await this.captureArtifacts(ctx, `${ctx.taskId}-${this.id}`);
    const session = this.getSession(ctx);

    if (!selectors) {
      throw new Error(`${this.name} selectors are not configured`);
    }

    const answers = session.page.locator(selectors.answerContainerCandidates.join(", "));
    const count = await answers.count().catch(() => 0);
    if (count === 0) {
      throw new Error(`${this.name} answer container not found`);
    }

    const answerText = normalizeAnswerText(
      await answers.nth(count - 1).innerText().catch(() => "")
    );

    if (!answerText) {
      throw new Error(`${this.name} answer text is empty`);
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

  /**
   * 判断提取到的答案是否不完整（过短或包含截断标记）。
   * 子类可覆盖以添加平台特有的检测逻辑。
   */
  isAnswerIncomplete(answerText: string): boolean {
    return checkIncomplete(answerText);
  }
}
