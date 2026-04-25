import type { ActiveBrowserSession } from "@multi-ai/browser-runner";
import type { ProviderExecutionMode, ProviderId, ProviderSettings } from "@multi-ai/shared";

export interface ProviderContext {
  taskId: string;
  providerId: ProviderId;
  profilePath: string;
  timeoutMs: number;
  visible: boolean;
  forceNewPage?: boolean;
  mode?: ProviderExecutionMode;
  settings?: ProviderSettings;
  session?: ActiveBrowserSession;
}
