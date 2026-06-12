import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { contextBridge, ipcRenderer } = require("electron");

const api = {
  listProviders: () => ipcRenderer.invoke("provider:list"),
  openProviderLoginPages: (providerIds?: string[]) =>
    ipcRenderer.invoke("provider:open-login-pages", providerIds),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
  updateProviderSettings: (providerId: string, patch: unknown) =>
    ipcRenderer.invoke("settings:update-provider", providerId, patch),
  listHistory: () => ipcRenderer.invoke("history:list"),
  deleteHistory: (id: string) => ipcRenderer.invoke("history:delete", id),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  exportHistoryToText: (id: string) => ipcRenderer.invoke("history:export-text", id),
  createTask: (input: unknown) => ipcRenderer.invoke("task:create", input),
  saveAllAnswers: (payload: { data: unknown; format: "txt" | "md" }) =>
    ipcRenderer.invoke("task:save-all", payload),
  exportPdfTask: (payload: unknown) =>
    ipcRenderer.invoke("export:pdf-task", payload),
  exportPdfContent: (payload: { title: string; body: string }) =>
    ipcRenderer.invoke("export:pdf-content", payload),
  resummarize: (payload: unknown) =>
    ipcRenderer.invoke("task:resummarize", payload)
};

contextBridge.exposeInMainWorld("multiAiApi", api);
