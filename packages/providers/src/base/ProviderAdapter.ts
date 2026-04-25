import type { ProviderAnswer, ProviderId } from "@multi-ai/shared";
import type { ProviderContext } from "./ProviderContext.js";

export interface ProviderAdapter {
  id: ProviderId;
  name: string;
  homepage: string;
  loginUrl: string;

  checkLogin(ctx: ProviderContext): Promise<boolean>;
  openHome(ctx: ProviderContext): Promise<void>;
  openLogin(ctx: ProviderContext): Promise<void>;
  waitForManualLogin(ctx: ProviderContext): Promise<void>;
  ask(ctx: ProviderContext, prompt: string): Promise<void>;
  waitForAnswerComplete(ctx: ProviderContext): Promise<void>;
  extractAnswer(ctx: ProviderContext, prompt: string): Promise<ProviderAnswer>;
}
