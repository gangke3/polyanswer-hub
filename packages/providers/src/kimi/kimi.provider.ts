import { AbstractProviderAdapter } from "../base/AbstractProviderAdapter.js";
import { firstAttachedLocator } from "@multi-ai/browser-runner";
import type { ProviderContext } from "../base/ProviderContext.js";
import { kimiSelectors } from "./selectors.js";

export class KimiProvider extends AbstractProviderAdapter {
  constructor() {
    super("kimi", "Kimi", "https://www.kimi.com/", "https://www.kimi.com/");
  }

  protected override getSelectors() {
    return kimiSelectors;
  }

  async waitForAnswerComplete(ctx: ProviderContext): Promise<void> {
    const session = this.getSession(ctx);
    const loginPrompt = await firstAttachedLocator(
      session.page,
      kimiSelectors.loggedOutMarkers ?? [],
      1200
    );

    if (loginPrompt) {
      throw new Error("Kimi requires login before it can return an answer");
    }

    return super.waitForAnswerComplete(ctx);
  }
}
