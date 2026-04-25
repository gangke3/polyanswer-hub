import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createTask } from "./ipc/task.ipc.js";
import { clearHistory, deleteHistoryItem, listHistory } from "./ipc/history.ipc.js";
import { listProviderMetadata, openProviderLoginPages } from "./ipc/provider.ipc.js";
import { loadAppSettings, saveAppSettings, updateProviderSettings } from "./ipc/settings.ipc.js";
import { securityPolicies } from "./security/policies.js";
import { createMainWindowOptions } from "./windows.js";

const require = createRequire(import.meta.url);
const { app, BrowserWindow, ipcMain } = require("electron") as typeof import("electron");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererUrl = process.env.VITE_DEV_SERVER_URL;

function resolvePreloadPath(): string {
  const candidates = [
    path.join(__dirname, "../preload/index.js"),
    path.join(__dirname, "../preload/index.mjs")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to resolve preload script. Checked: ${candidates.join(", ")}`);
}

function resolveRendererPath(): string {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "dist/renderer/index.html"),
    path.resolve(cwd, "apps/desktop/dist/renderer/index.html"),
    path.resolve(__dirname, "../../dist/renderer/index.html"),
    path.resolve(__dirname, "../../../../renderer/index.html"),
    path.resolve(__dirname, "../../../../../../apps/desktop/dist/renderer/index.html")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`[desktop] Using renderer entry: ${candidate}`);
      return candidate;
    }
  }

  throw new Error(`Unable to resolve renderer entry. Checked: ${candidates.join(", ")}`);
}

function createWindow(): InstanceType<typeof BrowserWindow> {
  const window = new BrowserWindow({
    ...createMainWindowOptions(),
    webPreferences: {
      ...securityPolicies,
      preload: resolvePreloadPath()
    }
  });

  if (rendererUrl) {
    console.log(`[desktop] Loading renderer URL: ${rendererUrl}`);
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(resolveRendererPath());
  }

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(
      `[desktop] Renderer failed to load: code=${errorCode} description=${errorDescription} url=${validatedURL}`
    );
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[desktop] Renderer process gone: reason=${details.reason} exitCode=${details.exitCode}`);
  });

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[renderer] ${message} (${sourceId}:${line})`);
    }
  });

  return window;
}

function registerIpc(): void {
  ipcMain.handle("provider:list", () => listProviderMetadata());
  ipcMain.handle("provider:open-login-pages", (_event, providerIds?: string[]) =>
    openProviderLoginPages(providerIds)
  );
  ipcMain.handle("settings:get", () => loadAppSettings());
  ipcMain.handle("settings:save", (_event, settings) => saveAppSettings(settings));
  ipcMain.handle("settings:update-provider", (_event, providerId, patch) =>
    updateProviderSettings(providerId, patch)
  );
  ipcMain.handle("history:list", () => listHistory());
  ipcMain.handle("history:delete", (_event, id: string) => deleteHistoryItem(id));
  ipcMain.handle("history:clear", () => clearHistory());
  ipcMain.handle("task:create", (_event, input) => createTask(input));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  void openProviderLoginPages().catch((error) => {
    console.error(
      `[desktop] Failed to auto-open login pages: ${error instanceof Error ? error.message : String(error)}`
    );
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
