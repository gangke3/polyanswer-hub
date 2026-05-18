import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDER_IDS, type AppSettings, type ProviderId } from "@multi-ai/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type PersistedAppSettings = AppSettings;

const DEFAULT_SMTP_HOST = "smtp.qiye.aliyun.com";
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_SMTP_SECURE = true;
const DEFAULT_SMTP_USER = process.env.DUOASK_SMTP_USER || process.env.SMTP_USER || "";
const DEFAULT_SMTP_PASS = process.env.DUOASK_SMTP_PASS || process.env.SMTP_PASS || "";

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
  return { providerId };
}

function createDefaultSettings(): AppSettings {
  const providers = {} as AppSettings["providers"];

  for (const providerId of PROVIDER_IDS) {
    providers[providerId] = getProviderDefaults(providerId);
  }

  return {
    providers,
    email: {
      enabled: false,
      recipientEmail: "",
      smtpHost: DEFAULT_SMTP_HOST,
      smtpPort: DEFAULT_SMTP_PORT,
      smtpSecure: DEFAULT_SMTP_SECURE,
      smtpUser: DEFAULT_SMTP_USER,
      smtpPass: DEFAULT_SMTP_PASS
    }
  };
}

function normalizeLoadedSettings(parsed: PersistedAppSettings): {
  settings: AppSettings;
  needsRewrite: boolean;
} {
  const defaults = createDefaultSettings();
  const settings: AppSettings = {
    ...defaults,
    ...parsed,
    providers: { ...defaults.providers },
    email: {
      ...defaults.email,
      ...parsed.email
    }
  };
  let needsRewrite = false;

  for (const providerId of PROVIDER_IDS) {
    const merged = {
      ...defaults.providers[providerId],
      ...parsed.providers?.[providerId]
    };

    settings.providers[providerId] = {
      providerId
    };

    if (JSON.stringify(merged) !== JSON.stringify(settings.providers[providerId])) {
      needsRewrite = true;
    }
  }

  if (JSON.stringify(settings.email) !== JSON.stringify({ ...defaults.email, ...parsed.email })) {
    needsRewrite = true;
  }

  return { settings, needsRewrite };
}

function createPersistedSettings(settings: AppSettings): PersistedAppSettings {
  const persisted = createDefaultSettings();

  for (const providerId of PROVIDER_IDS) {
    persisted.providers[providerId] = {
      ...settings.providers[providerId],
      providerId
    };
  }

  persisted.email = {
    ...settings.email
  };

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
