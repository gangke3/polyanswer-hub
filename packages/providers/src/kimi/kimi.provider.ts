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

      // 文本已稳定但内容不充实（可能是搜索/思考前置语），继续等待
      if (
        Date.now() - lastChangeAt >= this.quietPeriodMs &&
        this.isToolOnlyText(latestText)
      ) {
        // 只在剩余时间充足时才继续等待更充实的答案
        if (Date.now() < deadline - 8000) {
          await sleep(500);
          continue;
        }
        // 时间不多了，接受当前文本
      }

      if (Date.now() - lastChangeAt >= this.quietPeriodMs) {
        await sleep(this.finalDomSettleMs);
        // ---- 完成后二次读取：等待额外 500ms 后重新获取答案 ----
        await sleep(500);
        const recheckText = await this.readLatestAnswerText(ctx);
        if (recheckText && recheckText !== previousText) {
          previousText = recheckText;
          lastChangeAt = Date.now();
          // 继续等待直到再次稳定
          while (Date.now() < deadline) {
            await sleep(200);
            const nextText = await this.readLatestAnswerText(ctx);
            if (nextText !== previousText) {
              previousText = nextText;
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

    // 第一轮：从首选选择器中收集所有非空文本
    const foundTexts: string[] = [];

    for (const selector of this.preferredAnswerSelectors) {
      const locator = session.page.locator(selector);
      const count = await locator.count().catch(() => 0);
      if (count === 0) {
        continue;
      }

      for (let index = count - 1; index >= Math.max(0, count - 4); index -= 1) {
        const rawText = await locator.nth(index).innerText().catch(() => "");
        if (rawText && rawText.trim()) {
          foundTexts.push(rawText.trim());
        }
      }
    }

    // 第二：尝试返回非工具文本的答案
    for (const text of foundTexts) {
      if (!this.isToolOnlyText(text)) {
        return normalizeAnswerText(text);
      }
    }

    // 第三：如果所有文本都被识别为工具文本，回退到最长的文本（优于空答案）
    if (foundTexts.length > 0) {
      const longest = foundTexts.reduce((a, b) => (b.length > a.length ? b : a), foundTexts[0]);
      console.log(`[Kimi] ⚠ 所有答案文本被判定为工具文本，回退至最长文本 (length=${longest.length})`);
      return normalizeAnswerText(longest);
    }

    // 第四：宽泛回退——从候选选择器中查找
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
    if (latest) {
      return normalizeAnswerText(latest);
    }

    // 最终回退：返回候选列表中最长的文本
    if (candidates.length > 0) {
      const longest = candidates.reduce((a, b) => (b.length > a.length ? b : a), candidates[0]);
      console.log(`[Kimi] ⚠ 候选文本均被判定为工具文本，回退至最长候选 (length=${longest.length})`);
      return normalizeAnswerText(longest);
    }

    return "";
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
      "个网页",
      "让我搜索",
      "让我先搜索",
      "我来搜索",
      "我来为您搜索",
      "让我查一下",
      "让我来查"
    ];

    // Kimi 的搜索/思考前置语通常很短，且以"搜索""查""解决方案"等词结尾
    if (normalized.length < 120 && toolOnlyMarkers.some((marker) => normalized.includes(marker))) {
      return true;
    }

    // 如果文本很短且以引导性语句开头（没有实质内容），视为工具过渡文本
    if (normalized.length < 150) {
      const introPatterns = [
        /^我来为您.*方案/i,
        /^让我.*搜索.*趋势/i,
        /^我来.*分析.*解决/i
      ];
      if (introPatterns.some((pattern) => pattern.test(normalized))) {
        return true;
      }
    }

    return false;
  }
}
