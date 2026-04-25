import { createId, nowIso, type ProviderAnswer } from "@multi-ai/shared";
import { AbstractProviderAdapter } from "../base/AbstractProviderAdapter.js";
import type { ProviderContext } from "../base/ProviderContext.js";
import { normalizeAnswerText } from "../shared/extraction.js";
import { sleep } from "../shared/timing.js";
import { geminiSelectors } from "./selectors.js";

export class GeminiProvider extends AbstractProviderAdapter {
  private readonly quietPeriodMs = 6000;

  constructor() {
    super("gemini", "Gemini", "https://gemini.google.com/", "https://gemini.google.com/");
  }

  protected override getSelectors() {
    return geminiSelectors;
  }

  async waitForAnswerComplete(ctx: ProviderContext): Promise<void> {
    const deadline = Date.now() + ctx.timeoutMs;
    let previousText = "";
    let lastChangeAt = Date.now();

    while (Date.now() < deadline) {
      const latestText = await this.readLatestAnswerText(ctx);
      if (!latestText) {
        await sleep(1000);
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
    const session = this.getSession(ctx);

    for (const selector of geminiSelectors.answerContainerCandidates) {
      const locator = session.page.locator(selector);
      const count = await locator.count().catch(() => 0);
      if (count > 0) {
        const text = normalizeAnswerText(
          await locator.nth(count - 1).innerText().catch(() => "")
        );
        if (text) {
          return text;
        }
      }
    }

    const bodyText = normalizeAnswerText(
      await session.page.locator("body").innerText().catch(() => "")
    );

    const marker = "Gemini 说";
    const markerIndex = bodyText.lastIndexOf(marker);
    if (markerIndex === -1) {
      return "";
    }

    const afterMarker = bodyText.slice(markerIndex + marker.length).trim();
    const endMarkers = [
      "\n工具",
      "\nPro",
      "\nGemini 是一款 AI 工具",
      "\nGemini 是一款 AI"
    ];

    let endIndex = afterMarker.length;
    for (const candidate of endMarkers) {
      const index = afterMarker.indexOf(candidate);
      if (index >= 0 && index < endIndex) {
        endIndex = index;
      }
    }

    return afterMarker.slice(0, endIndex).trim();
  }
}
