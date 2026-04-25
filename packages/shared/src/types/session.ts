import type { ProviderId } from "./provider.js";

export type SessionStatus =
  | "unknown"
  | "valid"
  | "expired"
  | "login_required"
  | "error";

export interface ProviderSessionRecord {
  providerId: ProviderId;
  profilePath: string;
  storageStatePath?: string;
  status: SessionStatus;
  lastValidatedAt?: string;
  lastLoginAt?: string;
  lastErrorMessage?: string;
}
