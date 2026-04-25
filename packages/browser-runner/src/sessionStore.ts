import type { ProviderId, ProviderSessionRecord } from "@multi-ai/shared";

export class SessionStore {
  private readonly sessions = new Map<ProviderId, ProviderSessionRecord>();

  get(providerId: ProviderId): ProviderSessionRecord | undefined {
    return this.sessions.get(providerId);
  }

  save(session: ProviderSessionRecord): void {
    this.sessions.set(session.providerId, session);
  }
}

