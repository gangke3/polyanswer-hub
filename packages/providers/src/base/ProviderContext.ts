import type { ActiveBrowserSession } from "@multi-ai/browser-runner";
import type { ProviderId, ProviderSettings } from "@multi-ai/shared";

export interface ProviderContext {
  taskId: string;
  providerId: ProviderId;
  profilePath: string;
  timeoutMs: number;
  visible: boolean;
  settings?: ProviderSettings;
  session?: ActiveBrowserSession;
}
