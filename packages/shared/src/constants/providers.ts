import type { ProviderMeta } from "../types/provider.js";

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    homepage: "https://chatgpt.com/",
    loginUrl: "https://chatgpt.com/",
    enabled: true
  },
  {
    id: "gemini",
    name: "Gemini",
    homepage: "https://gemini.google.com/",
    loginUrl: "https://gemini.google.com/",
    enabled: true
  },
  {
    id: "kimi",
    name: "Kimi",
    homepage: "https://kimi.moonshot.cn/",
    loginUrl: "https://kimi.moonshot.cn/",
    enabled: true
  },
  {
    id: "doubao",
    name: "Doubao",
    homepage: "https://www.doubao.com/",
    loginUrl: "https://www.doubao.com/",
    enabled: true
  }
];
