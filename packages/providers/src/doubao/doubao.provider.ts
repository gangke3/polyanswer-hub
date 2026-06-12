import { createId, nowIso, type ProviderAnswer } from "@multi-ai/shared";
import { AbstractProviderAdapter } from "../base/AbstractProviderAdapter.js";
import type { ProviderContext } from "../base/ProviderContext.js";
import { normalizeAnswerText } from "../shared/extraction.js";
import { sleep } from "../shared/timing.js";
import { doubaoSelectors } from "./selectors.js";

export class DoubaoProvider extends AbstractProviderAdapter {
  private readonly preferredAnswerSelectors = [
    "[data-copy-telemetry='right_click_copy'] .flow-markdown-body",
    ".flow-markdown-body",
    "[data-plugin-identifier*='block_type:10000'] .flow-markdown-body",
    "[data-container-type*='block'] .flow-markdown-body",
    "[data-render-engine='node'] > div"
  ];

  private readonly inputChunkPauseMs = 500;
  private readonly inputChunkTargetLength = 120;
  private readonly quietPeriodMs = 3000;   // 3000ms — 豆包长回答段落间有较长的自然停顿
  private readonly scrollInterval = 8;      // 每 8 次循环滚动一次（约 2.4s）
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

    // 首次：滚动到底部确保虚拟列表渲染最新消息
    await this.scrollToBottom(ctx);

    const baselineText = await this.readLatestAnswerText(ctx, true);
    let previousText = "";
    let lastChangeAt = Date.now();
    let sawFreshAnswer = !baselineText;
    let loopCount = 0;

    while (Date.now() < deadline) {
      loopCount += 1;

      // 每隔一段时间重新滚动到底部，确保虚拟列表跟上了新消息
      if (loopCount % this.scrollInterval === 1) {
        await this.scrollToBottom(ctx);
      }

      // 仅在尚未获取到答案内容时才检查登录/验证状态
      if (loopCount % 6 === 1 && !sawFreshAnswer) {
        const latestText = await this.readLatestAnswerText(ctx, true);
        if (!latestText) {
          const bodyText = await session.page.locator("body").innerText().catch(() => "");
          if (this.loginMarkers.some((marker) => bodyText.includes(marker))) {
            throw new Error("Doubao requires manual verification in the browser before it can return an answer");
          }
        }
      }

      const latestText = await this.readLatestAnswerText(ctx, true);
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
        // ---- 完成后二次读取：等待额外 500ms 后重新获取答案 ----
        await sleep(500);
        const recheckText = await this.readLatestAnswerText(ctx);
        if (recheckText && recheckText !== previousText) {
          previousText = recheckText;
          lastChangeAt = Date.now();
          // 继续等待直到再次稳定
          while (Date.now() < deadline) {
            await sleep(300);
            const nextText = await this.readLatestAnswerText(ctx, true);
            if (nextText !== previousText) {
              previousText = nextText;
              lastChangeAt = Date.now();
            }
            if (await this.isStillGenerating(ctx)) {
              await sleep(300);
              continue;
            }
            if (Date.now() - lastChangeAt >= this.quietPeriodMs) {
              return;
            }
          }
        }
        return;
      }

      await sleep(300);
    }

    // 超时兜底：先滚动到底部，再尝试用 JS 直接提取页面上已有的答案
    await this.scrollToBottom(ctx);
    const fallbackText = await this.fallbackExtractAnswerText(ctx);
    if (fallbackText && !this.isUiOnlyText(fallbackText)) {
      // 页面上确实有答案，正常返回（extractAnswer 会用兜底方法提取）
      return;
    }

    throw new Error("Timed out while waiting for Doubao answer completion");
  }

  async extractAnswer(ctx: ProviderContext, prompt: string): Promise<ProviderAnswer> {
    const artifacts = await this.captureArtifacts(ctx, `${ctx.taskId}-${this.id}`);
    let answerText = await this.readLatestAnswerText(ctx);

    // 如果 readLatestAnswerText 仍为空，再做一次兜底尝试
    if (!answerText) {
      answerText = await this.fallbackExtractAnswerText(ctx);
    }

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

  /**
   * 滚动消息列表到底部，确保虚拟列表已渲染最新消息到 DOM。
   * 豆包使用虚拟列表（v_list），只有视口内可见的行才会渲染。
   * 如果答案在视口外，DOM 中不存在对应元素，提取会失败。
   */
  private async scrollToBottom(ctx: ProviderContext): Promise<void> {
    const session = this.getSession(ctx);
    try {
      const scrolled = await session.page.evaluate(() => {
        // 豆包特有的选择器，按优先级尝试
        const containerCandidates = [
          // 豆包主页聊天容器
          document.querySelector("[class*='message-list']") as HTMLElement | null,
          document.querySelector("[class*='chat-container']") as HTMLElement | null,
          document.querySelector("[class*='v_list']") as HTMLElement | null,
          // 滚动区域（带 overflow 样式）
          ...Array.from(document.querySelectorAll("div")).filter(
            (el) => {
              const style = window.getComputedStyle(el);
              return (style.overflowY === "auto" || style.overflowY === "scroll")
                && el.scrollHeight > el.clientHeight + 50;
            }
          ) as HTMLElement[]
        ];

        // 找到高度最大的可滚动容器进行滚动
        let best: HTMLElement | null = null;
        let bestHeight = 0;

        for (const el of containerCandidates) {
          if (!el) continue;
          const h = el.scrollHeight;
          if (h > bestHeight) {
            bestHeight = h;
            best = el;
          }
        }

        if (best) {
          best.scrollTop = best.scrollHeight;
          // 再触发一个 wheel 事件确保虚拟列表响应
          best.dispatchEvent(new WheelEvent("wheel", { deltaY: 1000, bubbles: true }));
          return true;
        }

        // 最后手段：把每一条 v_list_row 滚动到视口内
        const rows = document.querySelectorAll("[class*='v_list_row']");
        if (rows.length > 0) {
          const lastRow = rows[rows.length - 1] as HTMLElement;
          lastRow.scrollIntoView({ block: "end", behavior: "instant" });
          return true;
        }

        window.scrollTo(0, document.body.scrollHeight);
        return false;
      });

      // 给虚拟列表一点时间渲染新行
      await sleep(scrolled ? 300 : 500);
    } catch {
      // 滚动失败不阻断后续逻辑
    }
  }

  private async readLatestAnswerText(ctx: ProviderContext, skipScroll = false): Promise<string> {
    const session = this.getSession(ctx);

    // 确保虚拟列表已滚动到底部，使最新消息渲染到 DOM
    if (!skipScroll) {
      await this.scrollToBottom(ctx);
    }

    for (const selector of this.preferredAnswerSelectors) {
      const locator = session.page.locator(selector);
      const count = await locator.count().catch(() => 0);
      if (count === 0) {
        continue;
      }

      for (let index = count - 1; index >= Math.max(0, count - 4); index -= 1) {
        const rawText = normalizeAnswerText(await locator.nth(index).innerText().catch(() => ""));
        if (!rawText) continue;

        // 先尝试去除尾部 UI 操作按钮文本后再判断
        const cleanedText = this.stripTrailingUiActions(rawText);
        if (cleanedText && !this.isUiOnlyText(cleanedText)) {
          return cleanedText;
        }
      }
    }

    // 兜底：用 JS 从页面最后一个消息块中提取文本
    const fallbackText = await this.fallbackExtractAnswerText(ctx);
    if (fallbackText) {
      return fallbackText;
    }

    return "";
  }

  /**
   * 去除答案文本尾部可能混入的操作按钮文字（复制、分享、点赞等）
   */
  private stripTrailingUiActions(text: string): string {
    const actionLines = new Set([
      "重新生成", "复制", "分享", "点赞", "点踩",
      "上传附件", "朗读", "翻译"
    ]);

    const lines = text.split("\n");

    // 从尾部移除纯 UI 操作行
    while (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim();
      if (!lastLine || actionLines.has(lastLine)) {
        lines.pop();
      } else {
        break;
      }
    }

    return lines.join("\n").trim();
  }

  /**
   * 兜底提取：使用 JS evaluate 从页面 DOM 直接获取最后一条 AI 回复文本
   */
  private async fallbackExtractAnswerText(ctx: ProviderContext): Promise<string> {
    const session = this.getSession(ctx);

    // 先滚动到底部确保虚拟列表渲染
    await this.scrollToBottom(ctx);

    try {
      const text = await session.page.evaluate(() => {
        // 尝试多种可能的答案容器，按优先级排序
        const selectors = [
          "[data-copy-telemetry='right_click_copy'] .flow-markdown-body",
          ".flow-markdown-body",
          "[data-plugin-identifier*='block_type:10000'] .flow-markdown-body",
          "[data-container-type*='block'] .flow-markdown-body",
          "[data-render-engine='node'] > div",
          "[data-message-id] [class*='flow-markdown']",
          "[data-copy-telemetry] [class*='markdown']"
        ];

        for (const sel of selectors) {
          const elements = document.querySelectorAll(sel);
          if (elements.length === 0) continue;

          // 从最后一个元素开始查找
          for (let i = elements.length - 1; i >= Math.max(0, elements.length - 4); i--) {
            const el = elements[i] as HTMLElement;
            const content = (el.innerText || el.textContent || "").trim();
            if (content && content.length > 20) {
              return content;
            }
          }
        }

        // 最后手段：搜索所有包含较长文本的 div，排除用户消息
        const allDivs = document.querySelectorAll("div[data-message-id]");
        for (let i = allDivs.length - 1; i >= Math.max(0, allDivs.length - 4); i--) {
          const el = allDivs[i] as HTMLElement;
          // 跳过用户消息（justify-end 类表示用户发送的消息）
          if (el.className.includes("justify-end")) continue;
          const content = (el.innerText || el.textContent || "").trim();
          if (content && content.length > 30) {
            return content;
          }
        }

        return "";
      });

      return normalizeAnswerText(text);
    } catch {
      return "";
    }
  }

  private async isStillGenerating(ctx: ProviderContext): Promise<boolean> {
    const session = this.getSession(ctx);

    // 方法 1: 检查已知的生成中 UI 元素
    const generatingSelectors = [
      "button:has-text('停止')",
      "button:has-text('停止生成')",
      "[class*='stop-generate']",
      "[class*='generating']",
      "[class*='loading']",
      "[class*='typing']",
      "[class*='streaming']",
      ".animate-pulse",
      "[class*='spinner']",
      "[class*='spin']",
      "svg[class*='animate']"
    ];

    const selectorResults = await Promise.all(
      generatingSelectors.map((sel) =>
        session.page.locator(sel).first().isVisible().catch(() => false)
      )
    );

    if (selectorResults.some(Boolean)) {
      return true;
    }

    // 方法 2: 用 JS 检测是否有"停止生成"的 SVG 或图标在 DOM 中
    try {
      const jsCheck = await session.page.evaluate(() => {
        // 检查是否有"停止"按钮
        const buttons = Array.from(document.querySelectorAll("button"));
        for (const btn of buttons) {
          const text = (btn.textContent || "").trim();
          if (text === "停止" || text === "停止生成") return true;
          // 检查 aria-label
          const aria = btn.getAttribute("aria-label") || "";
          if (aria.includes("停止") || aria.includes("stop")) return true;
        }

        // 检查 SVG 动画图标（通常出现在生成中）
        const svgs = Array.from(document.querySelectorAll("svg"));
        for (const svg of svgs) {
          const cls = svg.getAttribute("class") || "";
          if (cls.includes("animate") || cls.includes("spin") || cls.includes("loading")) return true;
        }

        return false;
      });
      return jsCheck;
    } catch {
      return false;
    }
  }

  private isUiOnlyText(text: string): boolean {
    const normalized = normalizeAnswerText(text);
    if (!normalized) {
      return true;
    }

    const uiMarkers = [
      "重新生成", "复制", "分享", "点赞", "点踩",
      "上传附件", "朗读", "翻译"
    ];

    // 移除所有 UI 标记文字后，看剩余内容是否足够短
    let contentWithoutUi = normalized;
    for (const marker of uiMarkers) {
      contentWithoutUi = contentWithoutUi.replaceAll(marker, "");
    }
    contentWithoutUi = contentWithoutUi.replace(/\s+/g, " ").trim();

    // 如果去除 UI 标记后剩余内容少于 15 个字符，视为纯 UI 文本
    return contentWithoutUi.length < 15;
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
