import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PROVIDER_IDS, type AppSettings, type ProviderId } from "@multi-ai/shared";

const require = createRequire(import.meta.url);
const { safeStorage } = require("electron") as typeof import("electron");
const encryptedPrefix = "enc::";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type PersistedAppSettings = AppSettings;

function resolveProjectRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), "..", ".."),
    path.resolve(__dirname, "../../../../../../"),
    path.resolve(process.cwd())
  ];

  for (const candidate of candidates) {
    if (candidate && path.basename(candidate).toLowerCase() === "ai") {
      return candidate;
    }
  }

  return candidates[0];
}

function createSettingsPath(root: string): string {
  return path.join(root, "data", "app-settings.json");
}

const projectRoot = resolveProjectRoot();
const settingsPath = createSettingsPath(projectRoot);
const legacySettingsPath = path.resolve(process.cwd(), "data", "app-settings.json");

function getProviderDefaults(providerId: ProviderId): AppSettings["providers"][ProviderId] {
  switch (providerId) {
    case "chatgpt":
      return {
        providerId,
        mode: "browser",
        apiKey: "",
        apiBaseUrl: "https://api.openai.com",
        model: "gpt-4.1"
      };
    case "gemini":
      return {
        providerId,
        mode: "browser",
        apiKey: "",
        apiBaseUrl: "https://generativelanguage.googleapis.com",
        model: "gemini-2.5-flash"
      };
    case "kimi":
      return {
        providerId,
        mode: "browser",
        apiKey: "",
        apiBaseUrl: "https://api.moonshot.cn",
        model: "kimi-k2.5"
      };
    case "doubao":
      return {
        providerId,
        mode: "browser",
        apiKey: "",
        apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        model: "doubao-seed-1-6-250615"
      };
  }
}

function createDefaultSettings(): AppSettings {
  const providers = {} as AppSettings["providers"];

  for (const providerId of PROVIDER_IDS) {
    providers[providerId] = getProviderDefaults(providerId);
  }

  return { providers };
}

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encryptApiKey(apiKey: string): string {
  if (!apiKey) {
    return "";
  }

  if (apiKey.startsWith(encryptedPrefix)) {
    return apiKey;
  }

  if (!canEncrypt()) {
    return apiKey;
  }

  const encrypted = safeStorage.encryptString(apiKey).toString("base64");
  return `${encryptedPrefix}${encrypted}`;
}

function decryptApiKey(apiKey: string): { value: string; encrypted: boolean } {
  if (!apiKey) {
    return { value: "", encrypted: false };
  }

  if (!apiKey.startsWith(encryptedPrefix)) {
    return { value: apiKey, encrypted: false };
  }

  if (!canEncrypt()) {
    return { value: "", encrypted: true };
  }

  const payload = apiKey.slice(encryptedPrefix.length);
  const value = safeStorage.decryptString(Buffer.from(payload, "base64"));
  return { value, encrypted: true };
}

function normalizeLoadedSettings(parsed: PersistedAppSettings): {
  settings: AppSettings;
  needsRewrite: boolean;
} {
  const defaults = createDefaultSettings();
  const settings: AppSettings = {
    ...defaults,
    ...parsed,
    providers: { ...defaults.providers }
  };
  let needsRewrite = false;

  for (const providerId of PROVIDER_IDS) {
    const merged = {
      ...defaults.providers[providerId],
      ...parsed.providers?.[providerId]
    };
    const decrypted = decryptApiKey(merged.apiKey);

    settings.providers[providerId] = {
      ...merged,
      apiKey: decrypted.value,
      apiBaseUrl: merged.apiBaseUrl || defaults.providers[providerId].apiBaseUrl,
      model: merged.model || defaults.providers[providerId].model,
      providerId
    };

    if (
      (merged.apiKey && !decrypted.encrypted && canEncrypt()) ||
      !merged.apiBaseUrl ||
      !merged.model
    ) {
      needsRewrite = true;
    }
  }

  return { settings, needsRewrite };
}

function createPersistedSettings(settings: AppSettings): PersistedAppSettings {
  const persisted = createDefaultSettings();

  for (const providerId of PROVIDER_IDS) {
    persisted.providers[providerId] = {
      ...settings.providers[providerId],
      providerId,
      apiKey: encryptApiKey(settings.providers[providerId]?.apiKey ?? "")
    };
  }

  return persisted;
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    if (legacySettingsPath !== settingsPath) {
      try {
        await fs.access(settingsPath);
      } catch {
        const legacyContent = await fs.readFile(legacySettingsPath, "utf8");
        await fs.mkdir(path.dirname(settingsPath), { recursive: true });
        await fs.writeFile(settingsPath, legacyContent, "utf8");
      }
    }

    const content = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(content) as PersistedAppSettings;
    const normalized = normalizeLoadedSettings(parsed);

    if (normalized.needsRewrite) {
      await saveAppSettings(normalized.settings);
    }

    return normalized.settings;
  } catch {
    const defaults = createDefaultSettings();
    await saveAppSettings(defaults);
    return defaults;
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  const persisted = createPersistedSettings(settings);
  await fs.writeFile(settingsPath, JSON.stringify(persisted, null, 2), "utf8");
  return settings;
}

export async function updateProviderSettings(
  providerId: ProviderId,
  patch: Partial<AppSettings["providers"][ProviderId]>
): Promise<AppSettings> {
  const current = await loadAppSettings();
  current.providers[providerId] = {
    ...current.providers[providerId],
    ...patch,
    providerId
  };
  return saveAppSettings(current);
}
