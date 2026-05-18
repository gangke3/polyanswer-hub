import type { ProviderId } from "./provider.js";

export interface ProviderSettings {
  providerId: ProviderId;
}

export interface EmailSettings {
  enabled: boolean;
  recipientEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
}

export interface AppSettings {
  providers: Record<ProviderId, ProviderSettings>;
  email: EmailSettings;
}
