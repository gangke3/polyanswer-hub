import type { ProviderId } from "@multi-ai/shared";
import type { ProviderAdapter } from "./base/ProviderAdapter.js";
import { ChatGPTProvider } from "./chatgpt/chatgpt.provider.js";
import { ClaudeProvider } from "./claude/claude.provider.js";
import { GeminiProvider } from "./gemini/gemini.provider.js";
import { KimiProvider } from "./kimi/kimi.provider.js";
import { DoubaoProvider } from "./doubao/doubao.provider.js";
import { GrokProvider } from "./grok/grok.provider.js";

const registry = new Map<ProviderId, ProviderAdapter>([
  ["chatgpt", new ChatGPTProvider()],
  ["claude", new ClaudeProvider()],
  ["gemini", new GeminiProvider()],
  ["kimi", new KimiProvider()],
  ["doubao", new DoubaoProvider()],
  ["grok", new GrokProvider()]
]);

export function getProvider(providerId: ProviderId): ProviderAdapter {
  const provider = registry.get(providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  return provider;
}

export function listProviders(): ProviderAdapter[] {
  return [...registry.values()];
}
