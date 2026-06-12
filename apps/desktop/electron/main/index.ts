import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createTask } from "./ipc/task.ipc.js";
import { resummarize } from "./ipc/resummarize.js";
import { BRAND } from "../common/brand.js";
import { clearHistory, deleteHistoryItem, getHistoryItemById, listHistory } from "./ipc/history.ipc.js";
import { listProviderMetadata, openProviderLoginPages } from "./ipc/provider.ipc.js";
import { loadAppSettings, saveAppSettings, updateProviderSettings } from "./ipc/settings.ipc.js";
import { securityPolicies } from "./security/policies.js";
import { createMainWindowOptions } from "./windows.js";
import { createSuggestedTaskFileName, formatHistoryItemText, formatTaskResultText, formatTaskResultMarkdown, formatHistoryItemMarkdown } from "./services/task-output.js";
import { saveTaskAsPdf, saveContentAsPdf } from "./services/pdf.service.js";
import { startDesktopApiServer } from "./services/api-server.js";

const require = createRequire(import.meta.url);
const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron") as typeof import("electron");
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

function resolveBrandAssetPath(fileName: string): string | undefined {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, `dist/renderer/branding/${fileName}`),
    path.resolve(cwd, `apps/desktop/dist/renderer/branding/${fileName}`),
    path.resolve(cwd, `electron/renderer/public/branding/${fileName}`),
    path.resolve(cwd, `apps/desktop/electron/renderer/public/branding/${fileName}`)
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function createWindow(): InstanceType<typeof BrowserWindow> {
  const brandIconPath =
    resolveBrandAssetPath(`${BRAND.assetPrefix}-icon.ico`) ??
    resolveBrandAssetPath(`${BRAND.assetPrefix}-icon.png`);
  const window = new BrowserWindow({
    ...createMainWindowOptions(),
    ...(brandIconPath ? { icon: brandIconPath } : {}),
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

  // Enable native right-click context menu for input fields (copy, paste, cut, select all)
  window.webContents.on("context-menu", (_event, params) => {
    const { isEditable, selectionText, editFlags } = params;
    const hasSelection = selectionText.trim().length > 0;

    if (isEditable) {
      const menuTemplate: Electron.MenuItemConstructorOptions[] = [
        { label: "撤销", role: "undo", enabled: editFlags.canUndo },
        { label: "重做", role: "redo", enabled: editFlags.canRedo },
        { type: "separator" },
        { label: "剪切", role: "cut", enabled: editFlags.canCut },
        { label: "复制", role: "copy", enabled: editFlags.canCopy },
        { label: "粘贴", role: "paste", enabled: editFlags.canPaste },
        { label: "删除", role: "delete", enabled: editFlags.canDelete },
        { type: "separator" },
        { label: "全选", role: "selectAll", enabled: editFlags.canSelectAll }
      ];
      Menu.buildFromTemplate(menuTemplate).popup({ window });
    } else if (hasSelection) {
      const menuTemplate: Electron.MenuItemConstructorOptions[] = [
        { label: "复制", role: "copy", enabled: editFlags.canCopy }
      ];
      Menu.buildFromTemplate(menuTemplate).popup({ window });
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
  ipcMain.handle("history:export-text", async (event, id: string) => {
    const item = await getHistoryItemById(id);

    if (!item) {
      throw new Error(`History item not found: ${id}`);
    }

    const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const defaultPath = path.join(
      app.getPath("documents"),
      createSuggestedTaskFileName(item.task.question, item.savedAt)
    );
    const saveResult = ownerWindow
      ? await dialog.showSaveDialog(ownerWindow, {
          defaultPath,
          filters: [{ name: "Text Files", extensions: ["txt"] }]
        })
      : await dialog.showSaveDialog({
          defaultPath,
          filters: [{ name: "Text Files", extensions: ["txt"] }]
        });

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    await fsPromises.writeFile(saveResult.filePath, formatHistoryItemText(item), "utf8");
    return { canceled: false, path: saveResult.filePath };
  });

  // Save all answers (TXT or MD) via native dialog
  ipcMain.handle("task:save-all", async (event, payload: {
    data: {
      question: string;
      createdAt: string;
      finishedAt?: string;
      status: string;
      providerIds: string[];
      answers: Array<{ providerId: string; status: string; answerText?: string; errorMessage?: string }>;
      synthesis?: { finalAnswer: string };
      autoSummary?: { providerId: string; status: string; answerText?: string; errorMessage?: string };
    };
    format: "txt" | "md";
  }) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const ext = payload.format === "md" ? "md" : "txt";
    const filterName = payload.format === "md" ? "Markdown Files" : "Text Files";
    const defaultPath = path.join(
      app.getPath("documents"),
      createSuggestedTaskFileName(payload.data.question, undefined, ext)
    );

    const saveResult = ownerWindow
      ? await dialog.showSaveDialog(ownerWindow, {
          defaultPath,
          filters: [{ name: filterName, extensions: [ext] }]
        })
      : await dialog.showSaveDialog({
          defaultPath,
          filters: [{ name: filterName, extensions: [ext] }]
        });

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    // 前端传来的 answers 是平铺结构（answerText 在顶层），
    // 而 formatTaskResultMarkdown/formatTaskResultText 内部的 formatAnswerBody
    // 期望 ProviderRunResult 嵌套结构（answer.answerText）。
    // 在此处统一转换，避免答案内容丢失。
    const normalizedAnswers = payload.data.answers.map((a) => ({
      providerId: a.providerId,
      status: a.status,
      answer: a.answerText ? { answerText: a.answerText } : undefined,
      errorMessage: a.errorMessage
    }));

    const normalizedAutoSummary = payload.data.autoSummary
      ? {
          providerId: payload.data.autoSummary.providerId,
          status: payload.data.autoSummary.status,
          answer: payload.data.autoSummary.answerText
            ? { answerText: payload.data.autoSummary.answerText }
            : undefined,
          errorMessage: payload.data.autoSummary.errorMessage
        }
      : undefined;

    const text =
      payload.format === "md"
        ? formatTaskResultMarkdown({
            task: { question: payload.data.question, createdAt: payload.data.createdAt, finishedAt: payload.data.finishedAt, status: payload.data.status, providerIds: payload.data.providerIds as any } as any,
            answers: normalizedAnswers as any,
            synthesis: payload.data.synthesis as any,
            autoSummary: normalizedAutoSummary as any
          })
        : formatTaskResultText({
            task: { question: payload.data.question, createdAt: payload.data.createdAt, finishedAt: payload.data.finishedAt, status: payload.data.status, providerIds: payload.data.providerIds } as any,
            answers: normalizedAnswers as any,
            synthesis: payload.data.synthesis as any,
            autoSummary: normalizedAutoSummary as any
          });

    await fsPromises.writeFile(saveResult.filePath, text, "utf8");
    return { canceled: false, path: saveResult.filePath };
  });

  // Export task as real PDF
  ipcMain.handle("export:pdf-task", async (event, payload: {
    question: string;
    createdAt: string;
    finishedAt?: string;
    status: string;
    providerIds: string[];
    answers: Array<{ providerId: string; status: string; answerText?: string; errorMessage?: string }>;
    synthesis?: { finalAnswer: string };
    autoSummary?: { providerId: string; status: string; answerText?: string; errorMessage?: string };
  }) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const defaultFileName = createSuggestedTaskFileName(payload.question, undefined, "pdf");
    return saveTaskAsPdf(
      {
        question: payload.question,
        createdAt: payload.createdAt,
        finishedAt: payload.finishedAt,
        status: payload.status,
        providerIds: payload.providerIds,
        answers: payload.answers,
        synthesis: payload.synthesis,
        autoSummary: payload.autoSummary
      },
      defaultFileName,
      ownerWindow
    );
  });

  // Export single content block as PDF
  ipcMain.handle("export:pdf-content", async (event, payload: { title: string; body: string }) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const safeName = payload.title
      .replace(/[<>:"/\\|?*]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40) || "answer";
    return saveContentAsPdf(payload.title, payload.body, `${safeName}.pdf`, ownerWindow);
  });
  ipcMain.handle("task:create", (_event, input) => createTask(input));
  ipcMain.handle("task:resummarize", (_event, input) => resummarize(input));
}

let apiServer: Awaited<ReturnType<typeof startDesktopApiServer>> | undefined;

app.whenReady().then(async () => {
  app.setName(BRAND.bilingualName);
  if (process.platform === "win32") {
    app.setAppUserModelId(BRAND.appUserModelId);
  }

  registerIpc();
  try {
    apiServer = await startDesktopApiServer();
  } catch (error) {
    console.error(
      `[desktop-api] Failed to start API server: ${error instanceof Error ? error.message : String(error)}`
    );
  }

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

app.on("before-quit", () => {
  if (apiServer) {
    void apiServer.close().catch((error) => {
      console.error(
        `[desktop-api] Failed to close API server: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  }
});
