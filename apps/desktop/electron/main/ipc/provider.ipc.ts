import { BrowserManager } from "@multi-ai/browser-runner";
import { PROVIDERS } from "@multi-ai/shared";

const browserManager = new BrowserManager();

export function listProviderMetadata() {
  return PROVIDERS;
}

export async function openProviderLoginPages(providerIds?: string[]) {
  const targets = providerIds?.length
    ? PROVIDERS.filter((provider) => providerIds.includes(provider.id))
    : PROVIDERS;

  await browserManager.resetAndOpenLoginTabs(targets.map((provider) => provider.id));

  return {
    opened: targets.length,
    providerIds: targets.map((provider) => provider.id)
  };
}
