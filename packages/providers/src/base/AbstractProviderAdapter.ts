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
    await session.page.goto(this.homepage, { waitUntil: "domcontentloaded" });
    await waitForNetworkSettled(session.page);

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
    try {
      await input.fill(prompt);
    } catch {
      await input.press("Control+A").catch(() => undefined);
      await input.press("Meta+A").catch(() => undefined);
      await input.press("Backspace").catch(() => undefined);
      await session.page.keyboard.type(prompt, { delay: 10 });
    }

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
        await sleep(1000);
        continue;
      }

      const latest = answers.nth(count - 1);
      const latestText = normalizeAnswerText(await latest.innerText().catch(() => ""));
      if (!latestText) {
        await sleep(1000);
        continue;
      }

      if (latestText === previousText) {
        stableIterations += 1;
      } else {
        previousText = latestText;
        stableIterations = 0;
      }

      if (stableIterations >= 2) {
        return;
      }

      await sleep(1200);
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
}
