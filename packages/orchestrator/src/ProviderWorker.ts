import { BrowserManager, waitForNetworkSettled } from "@multi-ai/browser-runner";
import type { ProviderRunResult } from "@multi-ai/shared";
import type { ProviderAdapter } from "@multi-ai/providers";
import type { ProviderContext } from "@multi-ai/providers";
import { isAnswerIncomplete } from "@multi-ai/providers";

export class ProviderWorker {
  private readonly browserManager = new BrowserManager();

  constructor(private readonly provider: ProviderAdapter) {}

  async run(ctx: ProviderContext, prompt: string): Promise<ProviderRunResult> {
    const startedAt = Date.now();

    try {
      const runtimeContext: ProviderContext = {
        ...ctx,
        session: await this.browserManager.getSession(ctx.providerId, ctx.visible)
      };

      return await this.runWithRefreshRetry(runtimeContext, prompt, startedAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const { status, errorCode, errorMessage } = this.classifyFailure(ctx.providerId, message);

      return {
        providerId: this.provider.id,
        status,
        errorCode,
        errorMessage,
        elapsedMs: Date.now() - startedAt
      };
    }
  }

  private async runWithRefreshRetry(
    ctx: ProviderContext,
    prompt: string,
    startedAt: number
  ): Promise<ProviderRunResult> {
    let initialError: Error | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if (attempt > 0) {
          console.log(`[${this.provider.name}] 🔄 第 2 次尝试（刷新重试）…`);
          await this.prepareRefreshRetry(ctx);
        }

        const elapsed = Date.now() - startedAt;
        const remainingMs = Math.max(10000, ctx.timeoutMs - elapsed);
        const currentCtx = { ...ctx, timeoutMs: remainingMs };

        await this.ensureLoggedIn(currentCtx);
        const result = await this.executePrompt(currentCtx, prompt, startedAt);

        // ---- 答案有效性校验：内容不完整时视为可重试错误 ----
        if (
          result.status === "completed" &&
          result.answer &&
          isAnswerIncomplete(result.answer.answerText)
        ) {
          const validationError = new Error(
            `${this.provider.name} answer is incomplete or empty (length=${result.answer.answerText.length}). Treating as retryable failure.`
          );

          if (attempt === 0) {
            console.log(`[${this.provider.name}] ⚠ 答案不完整，准备刷新重试…`);
            initialError = validationError;
            continue;
          }

          // 第二次仍然不完整，返回已有结果（比完全丢失好）
          console.log(`[${this.provider.name}] ⚠ 重试后答案仍不完整，保留当前结果`);
        }

        return result;
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));

        if (
          attempt === 0 &&
          this.shouldRetryAfterRefresh(ctx.providerId, normalizedError.message)
        ) {
          initialError = normalizedError;
          continue;
        }

        if (initialError) {
          throw new Error(
            `${this.provider.name} refresh retry failed. First error: ${initialError.message}. Final error: ${normalizedError.message}`,
            { cause: error }
          );
        }

        throw normalizedError;
      }
    }

    throw initialError ?? new Error(`${this.provider.name} failed without a retryable error`);
  }

  private async ensureLoggedIn(ctx: ProviderContext): Promise<void> {
    const t0 = Date.now();
    const loggedIn = await this.provider.checkLogin(ctx);
    console.log(`[${this.provider.name}] checkLogin: ${loggedIn ? '✅' : '❌'} (${Date.now() - t0}ms)`);
    if (loggedIn) {
      return;
    }

    await this.provider.openLogin(ctx);
    await this.provider.waitForManualLogin(ctx);
  }

  private async executePrompt(
    ctx: ProviderContext,
    prompt: string,
    startedAt: number
  ): Promise<ProviderRunResult> {
    const t = (label: string, since: number) =>
      console.log(`[${this.provider.name}] ${label}: ${Date.now() - since}ms`);

    const t0 = Date.now();
    await this.provider.openHome(ctx);
    t('→ openHome', t0);

    const t1 = Date.now();
    await this.provider.ask(ctx, prompt);
    t('→ ask (input+submit)', t1);

    const t2 = Date.now();
    await this.provider.waitForAnswerComplete(ctx);
    t('→ waitForAnswerComplete', t2);

    const t3 = Date.now();
    const answer = await this.provider.extractAnswer(ctx, prompt);
    t('→ extractAnswer', t3);

    console.log(`[${this.provider.name}] 总耗时: ${Date.now() - startedAt}ms`);

    return {
      providerId: this.provider.id,
      status: "completed",
      answer,
      elapsedMs: Date.now() - startedAt
    };
  }

  private async prepareRefreshRetry(ctx: ProviderContext): Promise<void> {
    ctx.session = await this.browserManager.getSession(ctx.providerId, ctx.visible);
    const page = ctx.session.page;

    if (page.isClosed() || page.url() === "about:blank") {
      await this.provider.openHome(ctx);
      return;
    }

    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForNetworkSettled(page);
    } catch {
      await this.provider.openHome(ctx);
    }
  }

  private shouldRetryAfterRefresh(_providerId: ProviderContext["providerId"], message: string): boolean {
    const normalized = message.toLowerCase();

    // 需要人工介入的错误不可重试
    if (
      normalized.includes("manual verification") ||
      normalized.includes("challenge") ||
      normalized.includes("captcha") ||
      normalized.includes("verification") ||
      normalized.includes("requires login") ||
      normalized.includes("manual login")
    ) {
      return false;
    }

    // 所有平台的其他错误均可刷新重试
    return true;
  }

  private classifyFailure(
    providerId: ProviderContext["providerId"],
    message: string
  ): Pick<ProviderRunResult, "status" | "errorCode" | "errorMessage"> {
    const normalized = message.toLowerCase();

    if (
      normalized.includes("manual verification") ||
      normalized.includes("challenge") ||
      normalized.includes("captcha") ||
      normalized.includes("verification")
    ) {
      return {
        status: "failed",
        errorCode: "MANUAL_VERIFICATION_REQUIRED",
        errorMessage: message
      };
    }

    if (providerId === "doubao" && normalized.includes("timed out")) {
      // 仅当错误消息明确包含验证/登录关键字时才归类为验证需求
      if (
        normalized.includes("verification") ||
        normalized.includes("验证") ||
        normalized.includes("login") ||
        normalized.includes("登录")
      ) {
        return {
          status: "failed",
          errorCode: "MANUAL_VERIFICATION_REQUIRED",
          errorMessage: "Doubao may require manual verification in the browser. Please complete it and retry."
        };
      }
      // 其他超时按正常超时处理
    }

    if (normalized.includes("requires login") || normalized.includes("manual login")) {
      return {
        status: "failed",
        errorCode: "LOGIN_REQUIRED",
        errorMessage: message
      };
    }

    if (normalized.includes("timed out")) {
      return {
        status: "timeout",
        errorCode: "PROVIDER_TIMEOUT",
        errorMessage: message
      };
    }

    return {
      status: "failed",
      errorCode: "PROVIDER_RUN_FAILED",
      errorMessage: message
    };
  }
}
