import type { ProviderId, ProviderSessionRecord } from "@multi-ai/shared";
import { nowIso } from "@multi-ai/shared";

export class ProviderSessionRepository {
  private readonly store = new Map<ProviderId, ProviderSessionRecord>();

  get(providerId: ProviderId): ProviderSessionRecord | undefined {
    return this.store.get(providerId);
  }

  upsert(session: ProviderSessionRecord): ProviderSessionRecord {
    const normalized = {
      ...session,
      lastValidatedAt: session.lastValidatedAt ?? nowIso()
    };
    this.store.set(session.providerId, normalized);
    return normalized;
  }
}

