import { BrowserManager } from "@multi-ai/browser-runner";
import type { ProviderRunResult } from "@multi-ai/shared";
import type { ProviderAdapter } from "@multi-ai/providers";
import type { ProviderContext } from "@multi-ai/providers";

export class ProviderWorker {
  private readonly browserManager = new BrowserManager();

  constructor(private readonly provider: ProviderAdapter) {}

  async run(ctx: ProviderContext, prompt: string): Promise<ProviderRunResult> {
    const startedAt = Date.now();

    try {
      const session = ctx.forceNewPage
        ? await this.browserManager.getNewSession(ctx.providerId, ctx.visible)
        : await this.browserManager.getSession(ctx.providerId, ctx.visible);
      const runtimeContext: ProviderContext = {
        ...ctx,
        session
      };

      const loggedIn = await this.provider.checkLogin(runtimeContext);
      if (!loggedIn) {
        await this.provider.openLogin(runtimeContext);
        await this.provider.waitForManualLogin(runtimeContext);
      }

      await this.provider.openHome(runtimeContext);
      await this.provider.ask(runtimeContext, prompt);
      await this.provider.waitForAnswerComplete(runtimeContext);
      const answer = await this.provider.extractAnswer(runtimeContext, prompt);

      return {
        providerId: this.provider.id,
        status: "completed",
        answer,
        elapsedMs: Date.now() - startedAt
      };
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
      return {
        status: "failed",
        errorCode: "MANUAL_VERIFICATION_REQUIRED",
        errorMessage: "Doubao may require manual verification in the browser. Please complete it and retry."
      };
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
