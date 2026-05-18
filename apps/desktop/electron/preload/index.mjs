import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { contextBridge, ipcRenderer } = require("electron");

const api = {
  listProviders: () => ipcRenderer.invoke("provider:list"),
  openProviderLoginPages: (providerIds) => ipcRenderer.invoke("provider:open-login-pages", providerIds),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  updateProviderSettings: (providerId, patch) =>
    ipcRenderer.invoke("settings:update-provider", providerId, patch),
  listHistory: () => ipcRenderer.invoke("history:list"),
  deleteHistory: (id) => ipcRenderer.invoke("history:delete", id),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  exportHistoryToText: (id) => ipcRenderer.invoke("history:export-text", id),
  createTask: (input) => ipcRenderer.invoke("task:create", input)
};

contextBridge.exposeInMainWorld("multiAiApi", api);
