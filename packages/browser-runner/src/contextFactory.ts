import type { ProviderId } from "@multi-ai/shared";
import type { BrowserContext, Page } from "playwright";

export interface BrowserSessionContext {
  providerId: ProviderId;
  profilePath: string;
  visible: boolean;
}

export interface ActiveBrowserSession extends BrowserSessionContext {
  browserContext: BrowserContext;
  page: Page;
}

export function createBrowserSessionContext(
  providerId: ProviderId,
  profilePath: string,
  visible = true
): BrowserSessionContext {
  return { providerId, profilePath, visible };
}
