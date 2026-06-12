import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AppSettings,
  type CreateTaskInput,
  type ProviderId,
  type ProviderMeta,
  type SavedTaskHistoryItem
} from "@multi-ai/shared";
import { BRAND } from "../../../common/brand.js";
import { AnswerCard } from "../components/AnswerCard.js";
import { ProviderSelector } from "../components/ProviderSelector.js";
import { SynthesisPanel } from "../components/SynthesisPanel.js";
import { TaskProgress } from "../components/TaskProgress.js";

type TaskResponse = Awaited<ReturnType<typeof window.multiAiApi.createTask>>;
type ProviderFeedback = { kind: "success" | "error" | "info"; message: string };
type LogLevel = "info" | "success" | "error";
type LogEntry = { id: string; timestamp: string; level: LogLevel; message: string };
type ProviderPhase = "sent" | "fetching" | "waiting";
type ProviderProgress = Record<string, ProviderPhase>;
type Language = "zh" | "en";
type ResultTab = {
  id: string;
  label: string;
  status?: string;
  providerId?: ProviderId;
  kind: "summary" | "provider";
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  kimi: "Kimi",
  doubao: "Doubao",
  grok: "Grok"
};

const LANGUAGE_STORAGE_KEY = "duoask.language";

const zhCopy = {
  htmlLang: "zh-CN",
  locale: "zh-CN",
  languageSwitchAria: "切换界面语言",
  languageLabel: "语言",
  languages: {
    zh: "中文",
    en: "English"
  },
  brand: {
    displayName: BRAND.displayName as string,
    tagline: BRAND.shortTagline as string,
    logoAlt: `${BRAND.displayName} 标志`
  },
  providerNotes: {
    chatgpt: "浏览器模式适合手动登录和处理验证页。",
    claude: "Claude 浏览器模式需要先登录 claude.ai，首次接入建议先手动确认会话已可用。",
    gemini: "Gemini 当前建议优先使用浏览器模式，便于复用已登录会话。",
    kimi: "Kimi 浏览器模式通常需要先完成登录，未登录时任务会提示重新验证。",
    doubao: "豆包浏览器模式通常需要先完成登录，未登录时任务会提示重新验证。",
    grok: "Grok 浏览器模式需要先登录 grok.com，登录后即可正常使用。"
  } as Record<ProviderId, string>,
  statusLabels: {
    completed: "已完成",
    failed: "失败",
    running: "运行中",
    partial_completed: "部分完成",
    cancelled: "已取消",
    draft: "草稿",
    timeout: "超时"
  } as Record<string, string>,
  answer: {
    manualVerificationRequired: "该平台需要先在浏览器中完成人工验证，然后重新运行任务。",
    loginRequired: "该平台当前尚未登录，请先在浏览器中登录后重试。",
    noResult: "暂无结果",
    emptySummary: "暂无综合内容。",
    noHistorySummary: "这条历史任务还没有综合结果。"
  },
  common: {
    summary: "综合",
    none: "无",
    listSeparator: "、",
    providerListSeparator: " · ",
    expand: "展开",
    collapseSidebar: "收起侧栏",
    expandSidebar: "展开侧栏",
    browser: "浏览器",
    processing: "处理中",
    result: "结果",
    ready: "已就绪",
    waitingLogin: "等待登录",
    canAsk: "可提问",
    selectedProviderFallback: "还没有选择平台",
    noSelectedProvider: "未选择平台",
    providerCount: (count: number) => `${count} 个平台`,
    selectedCount: (count: number) => `${count} 个已选`,
    resultCount: (count: number) => `${count} 个结果`,
    elapsed: (value: string) => `已等待 ${value}`
  },
  sidebar: {
    runEyebrow: "本次运行",
    platformModeTitle: "平台与模式",
    chooseProviders: "选择平台",
    autoSummarize: "自动总结所有答案",
    autoSave: "自动保存到历史记录",
    summaryProvider: "总结平台",
    connectionEyebrow: "连接",
    loginSession: "登录与会话",
    settingsEyebrow: "设置",
    providerTestEmail: "平台测试与邮件",
    historyEyebrow: "历史",
    recentTasks: "最近任务",
    logsEyebrow: "日志",
    runLogs: "运行日志"
  },
  login: {
    preparing: "正在准备浏览器登录页，稍后会自动进入可提问状态。",
    browserOpened: "浏览器已打开，请完成需要登录的平台。程序会在 20 秒后自动允许提问。",
    browserOpenedLog: "登录页已打开，开始等待 20 秒。",
    ready: "已进入可提问状态。若某个平台仍未登录，任务结果中会提示继续登录。",
    readyLog: "已自动进入可提问状态。",
    startupOpened: (count: number) => `程序已在启动时打开 ${count} 个登录标签页。请完成必要登录，20 秒后可开始提问。`,
    startupLog: (count: number) => `程序启动时会由主进程打开 ${count} 个登录标签页。`,
    reopenSuccess: (count: number) => `已重新打开 ${count} 个登录标签页。请完成必要登录，20 秒后可开始提问。`,
    reopenSuccessLog: (count: number) => `已重新打开 ${count} 个登录标签页。`,
    reopenFailed: (message: string) => `重新打开登录页失败：${message}。请再试一次。`,
    reopenFailedLog: (message: string) => `重新打开登录页失败：${message}`,
    opening: "打开中...",
    reopenButton: "重新打开登录页",
    markReady: "标记为已就绪",
    manualReady: "已手动切换为可提问状态。",
    manualReadyLog: "已手动标记为可提问状态。"
  },
  settings: {
    emailNotifications: "邮件通知",
    enabled: "已开启",
    disabled: "已关闭",
    emailAutoSend: "任务完成后自动发送邮件",
    recipientEmail: "接收邮箱",
    smtpUser: "SMTP 账号",
    smtpPass: "SMTP 密码",
    saving: "保存中...",
    saveEmail: "保存邮件设置",
    emailNote: "默认读取环境变量中的 SMTP 配置，也可以单独修改收件邮箱并持久保存。",
    platformSaving: "正在保存平台配置...",
    testing: "测试中...",
    test: "测试"
  },
  history: {
    loading: "读取中...",
    refresh: "刷新",
    clear: "清空",
    empty: "暂无历史记录。开启自动保存后，问题、答案和综合结论会保存在这里。",
    collapse: "收起",
    view: "查看",
    exporting: "保存中...",
    save: "保存",
    delete: "删除",
    tabAria: "历史任务结果视图"
  },
  logsPanel: {
    clear: "清空日志",
    empty: "这里会显示程序执行状态和关键日志。"
  },
  hero: {
    titleNew: "你在忙什么？",
    titleLoaded: "继续这个问题",
    subtitleNew: "左侧统一管理平台、登录、邮件、历史与日志，中间区域只负责提问与查看答案。",
    subtitleLoaded: "这条历史任务已经载入，你可以直接再次提问，或在下方继续查看综合结果与各平台回复。",
    noticeLogin: "浏览器登录准备完成后即可运行",
    noticeSelect: "请先在左侧选择至少一个平台",
    noticeReady: "准备就绪，可以开始一次多平台提问",
    placeholder: "有问题，尽管问",
    ask: "提问",
    sessionReady: "浏览器会话已就绪",
    sessionPreparing: "浏览器登录准备中",
    runningHint: "正在处理中"
  },
  modes: {
    summaryOn: (providerName: string) => `自动总结 · ${providerName}`,
    summaryOff: "仅对比，不自动总结",
    autoSaveOn: "自动保存到历史",
    autoSaveOff: "仅本次查看，不自动保存"
  },
  waiting: {
    titleSummary: "正在收集回答并生成综合结论",
    titleCompare: "正在等待多平台回答返回",
    description: (count: number, names: string) => `问题已发送到 ${count} 个平台：${names}。返回结果后会直接展示在下方。`,
    tipSummary: (providerName: string) => `全部平台完成后，会优先展示 ${providerName} 生成的综合答案。`,
    tipCompare: "结果返回后，你可以按平台切换查看每一份原始回复。",
    sent: "已发送",
    fetching: "正在获取",
    waiting: "等待回复",
    summarySuffix: "总结",
    pending: "全部完成后执行"
  },
  result: {
    taskStatus: (status: string) => `任务状态：${status}`,
    fallbackSummary: (total: number, completed: number, failed: number) =>
      `已返回 ${total} 个结果，成功 ${completed} 个，失败 ${failed} 个`,
    summary: (total: number, completed: number, completedNames: string, failed: number, failedNames: string) =>
      `已返回 ${total} 个结果，成功 ${completed} 个：${completedNames}；失败 ${failed} 个：${failedNames}`,
    manualVerification: "需要人工验证",
    manualVerificationMessage: (names: string) => `${names} 需要先到浏览器中完成验证，然后重新运行任务。`,
    tabsAria: "结果视图",
    emptySummaryTitle: "还没有综合结果",
    emptySummaryDescription: "运行完成后，这里会优先展示总结后的答案。",
    emptyTitle: "答案会在这里聚合",
    emptyDescription: "提问后会先展示综合答案，再按平台切换查看原始回复。"
  },
  summary: {
    answerTitle: "综合答案",
    answerTitleWithProvider: (providerName: string) => `综合答案 - ${providerName}`
  },
  feedback: {
    configSaved: "配置已保存。",
    saveFailed: (message: string) => `保存失败：${message}`,
    emailSaving: "正在保存邮件设置...",
    emailSaved: "邮件设置已保存。",
    testing: "正在测试，请稍等...",
    testSucceeded: (message: string) => `测试成功：${message}`,
    returnedResult: "已返回结果。",
    noReturnedResult: "未返回结果。",
    testFailed: (message: string) => `测试失败：${message}`
  },
  logs: {
    historyReadFailed: (message: string) => `读取历史记录失败：${message}`,
    appLoaded: (count: number) => `主页面已加载，读取到 ${count} 个平台。`,
    configReadFailed: (message: string) => `读取基础配置失败：${message}`,
    providerSaving: (providerName: string) => `正在保存 ${providerName} 配置。`,
    providerSaved: (providerName: string) => `${providerName} 配置已保存。`,
    providerSaveFailed: (providerName: string, message: string) => `保存 ${providerName} 配置失败：${message}`,
    emailSaving: "正在保存邮件设置。",
    emailSaved: "邮件设置已保存。",
    emailSaveFailed: (message: string) => `保存邮件设置失败：${message}`,
    providerTesting: (providerName: string) => `正在测试 ${providerName}。`,
    providerTestSucceeded: (providerName: string) => `${providerName} 测试成功。`,
    providerTestFailed: (providerName: string, message: string) => `${providerName} 测试失败：${message}`,
    taskStarted: (providerNames: string) => `开始执行任务，目标平台：${providerNames}。`,
    autoSummaryEnabled: (providerName: string) => `自动总结已开启，将使用 ${providerName} 总结全部答案。`,
    autoSaveEnabled: "自动保存已开启，任务完成后会写入本地历史记录。",
    emailEnabled: (email: string) => `邮件发送已开启，任务完成后会自动发送到 ${email}。`,
    taskCompleted: (summary: string) => `任务完成，${summary}。`,
    providerStatus: (providerName: string, status: string, message?: string) =>
      `${providerName} 状态：${status}${message ? `，${message}` : ""}`,
    providerManualVerification: (providerName: string) => `${providerName} 需要人工验证。请到浏览器中完成验证后重新提问。`,
    autoSummaryStatus: (providerName: string, status: string, message?: string) =>
      `${providerName} 自动总结状态：${status}${message ? `，${message}` : ""}`,
    emailSent: (email: string) => `邮件已尝试自动发送到 ${email}。`,
    taskFailed: (message: string) => `执行任务失败：${message}`,
    historyLoaded: (question: string) => `已载入历史记录：${question}`,
    historyDeleted: "历史记录已删除。",
    historyDeleteFailed: (message: string) => `删除历史记录失败：${message}`,
    historyCleared: "历史记录已清空。",
    historyClearFailed: (message: string) => `清空历史记录失败：${message}`,
    exportCanceled: "已取消保存文本文件。",
    exportSaved: (path: string) => `任务已保存到本地文件：${path}`,
    exportFailed: (message: string) => `保存任务文本失败：${message}`
  },
  saveAll: {
    title: "保存全部答案",
    txt: "保存为 TXT",
    md: "保存为 MD",
    pdf: "保存为 PDF",
    saving: "保存中...",
    saved: (path: string) => `全部答案已保存：${path}`,
    canceled: "已取消保存。",
    failed: (message: string) => `保存全部答案失败：${message}`
  },
  resummarize: {
    button: "重新总结",
    running: "正在重新总结...",
    success: "重新总结完成。",
    failed: (message: string) => `重新总结失败：${message}`,
    noAnswers: "没有可用的已完成答案来进行总结。"
  },
  edit: {
    edit: "编辑",
    save: "保存修改",
    cancel: "取消",
    editing: "编辑中",
    saved: (title: string) => `已保存 ${title} 的编辑内容。`
  },
  testQuestion: "请只回复 OK"
};

type UiCopy = typeof zhCopy;

const enCopy: UiCopy = {
  htmlLang: "en",
  locale: "en-US",
  languageSwitchAria: "Switch interface language",
  languageLabel: "Language",
  languages: {
    zh: "中文",
    en: "English"
  },
  brand: {
    displayName: BRAND.enName,
    tagline: "Ask once, compare answers across sources",
    logoAlt: `${BRAND.enName} logo`
  },
  providerNotes: {
    chatgpt: "Browser mode is best for manual sign-in and verification pages.",
    claude: "Claude browser mode requires signing in to claude.ai first. Confirm the session is ready before first use.",
    gemini: "Gemini currently works best in browser mode so it can reuse your signed-in session.",
    kimi: "Kimi browser mode usually requires signing in first. Tasks will ask for re-verification when signed out.",
    doubao: "Doubao browser mode usually requires signing in first. Tasks will ask for re-verification when signed out.",
    grok: "Grok browser mode requires signing in to grok.com. It can be used normally after sign-in."
  } as Record<ProviderId, string>,
  statusLabels: {
    completed: "Completed",
    failed: "Failed",
    running: "Running",
    partial_completed: "Partially completed",
    cancelled: "Cancelled",
    draft: "Draft",
    timeout: "Timed out"
  } as Record<string, string>,
  answer: {
    manualVerificationRequired: "This provider needs manual verification in the browser before you run the task again.",
    loginRequired: "This provider is not signed in. Please sign in from the browser and try again.",
    noResult: "No result yet",
    emptySummary: "No summary content yet.",
    noHistorySummary: "This saved task does not have a summary yet."
  },
  common: {
    summary: "Summary",
    none: "None",
    listSeparator: ", ",
    providerListSeparator: " · ",
    expand: "Expand",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
    browser: "Browser",
    processing: "Processing",
    result: "Results",
    ready: "Ready",
    waitingLogin: "Waiting for sign-in",
    canAsk: "Ready to ask",
    selectedProviderFallback: "No providers selected yet",
    noSelectedProvider: "No providers selected",
    providerCount: (count: number) => `${count} provider${count === 1 ? "" : "s"}`,
    selectedCount: (count: number) => `${count} selected`,
    resultCount: (count: number) => `${count} result${count === 1 ? "" : "s"}`,
    elapsed: (value: string) => `Waited ${value}`
  },
  sidebar: {
    runEyebrow: "This run",
    platformModeTitle: "Providers and Mode",
    chooseProviders: "Choose providers",
    autoSummarize: "Auto-summarize all answers",
    autoSave: "Auto-save to history",
    summaryProvider: "Summary provider",
    connectionEyebrow: "Connection",
    loginSession: "Sign-in and Sessions",
    settingsEyebrow: "Settings",
    providerTestEmail: "Provider Tests and Email",
    historyEyebrow: "History",
    recentTasks: "Recent Tasks",
    logsEyebrow: "Logs",
    runLogs: "Run Logs"
  },
  login: {
    preparing: "Preparing browser sign-in pages. Asking will be enabled shortly.",
    browserOpened: "Browser pages are open. Complete sign-in where needed. Asking will be enabled in 20 seconds.",
    browserOpenedLog: "Sign-in pages opened. Waiting 20 seconds.",
    ready: "Ready to ask. If a provider is still signed out, the task result will tell you to continue signing in.",
    readyLog: "Automatically marked as ready to ask.",
    startupOpened: (count: number) =>
      `The app opened ${count} sign-in tab${count === 1 ? "" : "s"} at startup. Complete required sign-ins, then ask in 20 seconds.`,
    startupLog: (count: number) =>
      `The main process will open ${count} sign-in tab${count === 1 ? "" : "s"} at startup.`,
    reopenSuccess: (count: number) =>
      `Reopened ${count} sign-in tab${count === 1 ? "" : "s"}. Complete required sign-ins, then ask in 20 seconds.`,
    reopenSuccessLog: (count: number) => `Reopened ${count} sign-in tab${count === 1 ? "" : "s"}.`,
    reopenFailed: (message: string) => `Failed to reopen sign-in pages: ${message}. Please try again.`,
    reopenFailedLog: (message: string) => `Failed to reopen sign-in pages: ${message}`,
    opening: "Opening...",
    reopenButton: "Reopen sign-in pages",
    markReady: "Mark as ready",
    manualReady: "Manually switched to ready-to-ask state.",
    manualReadyLog: "Manually marked as ready to ask."
  },
  settings: {
    emailNotifications: "Email Notifications",
    enabled: "On",
    disabled: "Off",
    emailAutoSend: "Send email automatically when a task finishes",
    recipientEmail: "Recipient email",
    smtpUser: "SMTP account",
    smtpPass: "SMTP password",
    saving: "Saving...",
    saveEmail: "Save email settings",
    emailNote: "SMTP defaults come from environment variables. You can also change and persist the recipient email here.",
    platformSaving: "Saving provider settings...",
    testing: "Testing...",
    test: "Test"
  },
  history: {
    loading: "Loading...",
    refresh: "Refresh",
    clear: "Clear",
    empty: "No history yet. Turn on auto-save to keep questions, answers, and summaries here.",
    collapse: "Collapse",
    view: "View",
    exporting: "Saving...",
    save: "Save",
    delete: "Delete",
    tabAria: "Saved task result view"
  },
  logsPanel: {
    clear: "Clear logs",
    empty: "Program status and key logs will appear here."
  },
  hero: {
    titleNew: "What are you working on?",
    titleLoaded: "Continue this question",
    subtitleNew: "Manage providers, sign-in, email, history, and logs on the left. Ask and review answers in the center.",
    subtitleLoaded: "This saved task is loaded. Ask it again, or keep reviewing the summary and provider replies below.",
    noticeLogin: "You can run tasks after browser sign-in is ready",
    noticeSelect: "Select at least one provider on the left",
    noticeReady: "Ready for a multi-provider question",
    placeholder: "Ask anything",
    ask: "Ask",
    sessionReady: "Browser sessions are ready",
    sessionPreparing: "Preparing browser sign-in",
    runningHint: "Processing"
  },
  modes: {
    summaryOn: (providerName: string) => `Auto-summary · ${providerName}`,
    summaryOff: "Compare only, no auto-summary",
    autoSaveOn: "Auto-save to history",
    autoSaveOff: "View this run only, no auto-save"
  },
  waiting: {
    titleSummary: "Collecting answers and generating a summary",
    titleCompare: "Waiting for multi-provider answers",
    description: (count: number, names: string) =>
      `The question was sent to ${count} provider${count === 1 ? "" : "s"}: ${names}. Results will appear below as they return.`,
    tipSummary: (providerName: string) => `After every provider finishes, the summary from ${providerName} will appear first.`,
    tipCompare: "When results return, switch by provider to review each original answer.",
    sent: "Sent",
    fetching: "Fetching",
    waiting: "Waiting",
    summarySuffix: "summary",
    pending: "Runs after all providers finish"
  },
  result: {
    taskStatus: (status: string) => `Task status: ${status}`,
    fallbackSummary: (total: number, completed: number, failed: number) =>
      `Returned ${total} result${total === 1 ? "" : "s"}, ${completed} succeeded, ${failed} failed`,
    summary: (total: number, completed: number, completedNames: string, failed: number, failedNames: string) =>
      `Returned ${total} result${total === 1 ? "" : "s"}, ${completed} succeeded: ${completedNames}; ${failed} failed: ${failedNames}`,
    manualVerification: "Manual verification required",
    manualVerificationMessage: (names: string) => `${names} need browser verification before you run the task again.`,
    tabsAria: "Result view",
    emptySummaryTitle: "No summary yet",
    emptySummaryDescription: "After the run finishes, the summarized answer will appear here first.",
    emptyTitle: "Answers will be gathered here",
    emptyDescription: "After asking, the summary appears first, followed by tabs for each provider's original reply."
  },
  summary: {
    answerTitle: "Summary",
    answerTitleWithProvider: (providerName: string) => `Summary - ${providerName}`
  },
  feedback: {
    configSaved: "Settings saved.",
    saveFailed: (message: string) => `Save failed: ${message}`,
    emailSaving: "Saving email settings...",
    emailSaved: "Email settings saved.",
    testing: "Testing, please wait...",
    testSucceeded: (message: string) => `Test succeeded: ${message}`,
    returnedResult: "Received a result.",
    noReturnedResult: "No result returned.",
    testFailed: (message: string) => `Test failed: ${message}`
  },
  logs: {
    historyReadFailed: (message: string) => `Failed to read history: ${message}`,
    appLoaded: (count: number) => `Home loaded. Found ${count} provider${count === 1 ? "" : "s"}.`,
    configReadFailed: (message: string) => `Failed to read base config: ${message}`,
    providerSaving: (providerName: string) => `Saving ${providerName} settings.`,
    providerSaved: (providerName: string) => `${providerName} settings saved.`,
    providerSaveFailed: (providerName: string, message: string) => `Failed to save ${providerName} settings: ${message}`,
    emailSaving: "Saving email settings.",
    emailSaved: "Email settings saved.",
    emailSaveFailed: (message: string) => `Failed to save email settings: ${message}`,
    providerTesting: (providerName: string) => `Testing ${providerName}.`,
    providerTestSucceeded: (providerName: string) => `${providerName} test succeeded.`,
    providerTestFailed: (providerName: string, message: string) => `${providerName} test failed: ${message}`,
    taskStarted: (providerNames: string) => `Starting task. Target providers: ${providerNames}.`,
    autoSummaryEnabled: (providerName: string) => `Auto-summary is on. ${providerName} will summarize all answers.`,
    autoSaveEnabled: "Auto-save is on. The task will be written to local history when finished.",
    emailEnabled: (email: string) => `Email sending is on. The finished task will be sent to ${email}.`,
    taskCompleted: (summary: string) => `Task completed. ${summary}.`,
    providerStatus: (providerName: string, status: string, message?: string) =>
      `${providerName} status: ${status}${message ? `, ${message}` : ""}`,
    providerManualVerification: (providerName: string) =>
      `${providerName} requires manual verification. Complete it in the browser, then ask again.`,
    autoSummaryStatus: (providerName: string, status: string, message?: string) =>
      `${providerName} auto-summary status: ${status}${message ? `, ${message}` : ""}`,
    emailSent: (email: string) => `Attempted to send email to ${email}.`,
    taskFailed: (message: string) => `Task failed: ${message}`,
    historyLoaded: (question: string) => `Loaded history item: ${question}`,
    historyDeleted: "History item deleted.",
    historyDeleteFailed: (message: string) => `Failed to delete history item: ${message}`,
    historyCleared: "History cleared.",
    historyClearFailed: (message: string) => `Failed to clear history: ${message}`,
    exportCanceled: "Text file save was canceled.",
    exportSaved: (path: string) => `Task saved to local file: ${path}`,
    exportFailed: (message: string) => `Failed to save task text: ${message}`
  },
  saveAll: {
    title: "Save All Answers",
    txt: "Save as TXT",
    md: "Save as MD",
    pdf: "Save as PDF",
    saving: "Saving...",
    saved: (path: string) => `All answers saved: ${path}`,
    canceled: "Save canceled.",
    failed: (message: string) => `Failed to save all answers: ${message}`
  },
  resummarize: {
    button: "Re-summarize",
    running: "Re-summarizing...",
    success: "Re-summarization completed.",
    failed: (message: string) => `Re-summarization failed: ${message}`,
    noAnswers: "No completed answers available for summarization."
  },
  edit: {
    edit: "Edit",
    save: "Save edits",
    cancel: "Cancel",
    editing: "Editing",
    saved: (title: string) => `Edits saved for ${title}.`
  },
  testQuestion: "Please reply with OK only"
};

const UI_COPY: Record<Language, UiCopy> = {
  zh: zhCopy,
  en: enCopy
};

function readStoredLanguage(): Language {
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : "zh";
}

function formatAnswerBody(answer: TaskResponse["answers"][number], copy: UiCopy) {
  if (answer.answer?.answerText) {
    return answer.answer.answerText;
  }

  if (answer.errorCode === "MANUAL_VERIFICATION_REQUIRED") {
    return copy.answer.manualVerificationRequired;
  }

  if (answer.errorCode === "LOGIN_REQUIRED") {
    return copy.answer.loginRequired;
  }

  return answer.errorMessage ?? copy.answer.noResult;
}

function statusLabel(status: string, copy: UiCopy) {
  return copy.statusLabels[status] ?? status;
}

function providerName(providerId: ProviderId) {
  return PROVIDER_LABELS[providerId] ?? providerId;
}

function formatProviderNames(answers: TaskResponse["answers"], copy: UiCopy, fallback = copy.common.none) {
  if (answers.length === 0) {
    return fallback;
  }

  return answers.map((answer) => providerName(answer.providerId as ProviderId)).join(copy.common.listSeparator);
}

function formatResultSummary(answers: TaskResponse["answers"], copy: UiCopy) {
  const completed = answers.filter((answer) => answer.status === "completed");
  const failed = answers.filter((answer) => answer.status !== "completed");

  return copy.result.summary(
    answers.length,
    completed.length,
    formatProviderNames(completed, copy),
    failed.length,
    formatProviderNames(failed, copy)
  );
}

function getPreferredSummary(
  source:
    | Pick<TaskResponse, "synthesis" | "autoSummary">
    | Pick<SavedTaskHistoryItem, "synthesis" | "autoSummary">,
  copy: UiCopy
) {
  if (source.autoSummary) {
    return {
      title: copy.summary.answerTitleWithProvider(
        PROVIDER_LABELS[source.autoSummary.providerId as ProviderId] ?? source.autoSummary.providerId
      ),
      status: source.autoSummary.status,
      body: formatAnswerBody(source.autoSummary, copy)
    };
  }

  if (source.synthesis) {
    return {
      title: copy.summary.answerTitle,
      status: "completed",
      body: source.synthesis.finalAnswer
    };
  }

  return null;
}

export function HomePage() {
  const [language, setLanguage] = useState<Language>(() => readStoredLanguage());
  const copy = UI_COPY[language];
  const copyRef = useRef(copy);
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([
    "chatgpt",
    "claude",
    "gemini",
    "kimi",
    "doubao",
    "grok"
  ]);
  const [autoSummarize, setAutoSummarize] = useState(true);
  const [summaryProviderId, setSummaryProviderId] = useState<ProviderId>("chatgpt");
  const [autoSave, setAutoSave] = useState(true);
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [providerProgress, setProviderProgress] = useState<ProviderProgress>({});
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const progressTimersRef = useRef<number[]>([]);
  const elapsedTimerRef = useRef<number | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingProviderId, setTestingProviderId] = useState<ProviderId | null>(null);
  const [result, setResult] = useState<TaskResponse | null>(null);
  const [providerFeedback, setProviderFeedback] = useState<Partial<Record<ProviderId, ProviderFeedback>>>({});
  const [loginReady, setLoginReady] = useState(false);
  const [loginOpening, setLoginOpening] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [historyItems, setHistoryItems] = useState<SavedTaskHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpandedId, setHistoryExpandedId] = useState<string | null>(null);
  const [historyActiveTabs, setHistoryActiveTabs] = useState<Record<string, string>>({});
  const [historyExportingId, setHistoryExportingId] = useState<string | null>(null);
  const [saveAllFormat, setSaveAllFormat] = useState<"txt" | "md" | "pdf" | null>(null);
  const [resummarizing, setResummarizing] = useState(false);
  const [loadedHistoryItemId, setLoadedHistoryItemId] = useState<string | null>(null);
  const [emailFeedback, setEmailFeedback] = useState<ProviderFeedback | null>(null);
  const [loginHint, setLoginHint] = useState(() => copy.login.preparing);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeResultTab, setActiveResultTab] = useState("summary");
  const autoLoginTimerRef = useRef<number | null>(null);
  const questionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldFocusQuestionRef = useRef(false);
  const emailSettings = settings?.email ?? {
    enabled: false,
    recipientEmail: "",
    smtpHost: "",
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: "",
    smtpPass: ""
  };

  const completedCount = result?.answers.filter((answer) => answer.status === "completed").length ?? 0;
  const failedCount = result ? result.answers.length - completedCount : 0;
  const resultSummary = result ? formatResultSummary(result.answers, copy) : "";

  function handleLanguageChange(nextLanguage: Language) {
    setLanguage(nextLanguage);
    setLoginHint(loginReady ? UI_COPY[nextLanguage].login.ready : UI_COPY[nextLanguage].login.browserOpened);
  }

  function appendLog(level: LogLevel, message: string) {
    const timestamp = new Date().toLocaleTimeString(copyRef.current.locale, { hour12: false });
    setLogs((current) => [
      ...current.slice(-199),
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp,
        level,
        message
      }
    ]);
  }

  async function refreshHistory() {
    setHistoryLoading(true);
    try {
      setHistoryItems(await window.multiAiApi.listHistory());
    } catch (error) {
      appendLog("error", copy.logs.historyReadFailed(error instanceof Error ? error.message : String(error)));
    } finally {
      setHistoryLoading(false);
    }
  }

  function clearAutoLoginTimer() {
    if (autoLoginTimerRef.current !== null) {
      window.clearTimeout(autoLoginTimerRef.current);
      autoLoginTimerRef.current = null;
    }
  }

  function scheduleAutoLoginReady() {
    clearAutoLoginTimer();
    setLoginReady(false);
    setLoginHint(copy.login.browserOpened);
    appendLog("info", copy.login.browserOpenedLog);

    autoLoginTimerRef.current = window.setTimeout(() => {
      const currentCopy = copyRef.current;
      setLoginReady(true);
      setLoginHint(currentCopy.login.ready);
      appendLog("success", currentCopy.login.readyLog);
      autoLoginTimerRef.current = null;
    }, 20000);
  }

  useEffect(() => {
    copyRef.current = copy;
  }, [copy]);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = copy.htmlLang;
  }, [copy.htmlLang, language]);

  useEffect(() => {
    let active = true;

    void Promise.all([window.multiAiApi.listProviders(), window.multiAiApi.getSettings()])
      .then(([providerList, appSettings]) => {
        if (!active) {
          return;
        }

        setProviders(providerList);
        setSettings(appSettings);
        appendLog("success", copy.logs.appLoaded(providerList.length));
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        appendLog("error", copy.logs.configReadFailed(error instanceof Error ? error.message : String(error)));
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, []);

  useEffect(() => {
    setLoginHint(copy.login.startupOpened(selectedProviderIds.length));
    appendLog("info", copy.login.startupLog(selectedProviderIds.length));
    scheduleAutoLoginReady();

    return () => {
      clearAutoLoginTimer();
    };
  }, []);

  const providerMap = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers]
  );

  const verificationRequiredProviders = useMemo(() => {
    if (!result) {
      return [];
    }

    return result.answers.filter((answer) => answer.errorCode === "MANUAL_VERIFICATION_REQUIRED");
  }, [result]);

  const resultTabs = useMemo<ResultTab[]>(() => {
    if (!result) {
      return [];
    }

    return [
      { id: "summary", label: copy.common.summary, kind: "summary" },
      ...result.answers.map((answer) => ({
        id: `provider-${answer.providerId}`,
        label: PROVIDER_LABELS[answer.providerId as ProviderId] ?? answer.providerId,
        status: answer.status,
        providerId: answer.providerId as ProviderId,
        kind: "provider" as const
      }))
    ];
  }, [copy.common.summary, result]);

  useEffect(() => {
    if (resultTabs.length === 0) {
      return;
    }

    setActiveResultTab((current) =>
      resultTabs.some((tab) => tab.id === current) ? current : resultTabs[0]?.id ?? "summary"
    );
  }, [resultTabs]);

  useEffect(() => {
    if (running || !shouldFocusQuestionRef.current) {
      return;
    }

    questionInputRef.current?.focus();
    shouldFocusQuestionRef.current = false;
  }, [running]);

  function updateLocalProviderSetting(
    providerId: ProviderId,
    patch: Partial<AppSettings["providers"][ProviderId]>
  ) {
    setSettings((current) =>
      current
        ? {
            ...current,
            providers: {
              ...current.providers,
              [providerId]: {
                ...current.providers[providerId],
                ...patch,
                providerId
              }
            }
          }
        : current
    );
  }

  function updateEmailSettings(patch: Partial<AppSettings["email"]>) {
    setSettings((current) =>
      current
        ? {
            ...current,
            email: {
              ...current.email,
              ...patch
            }
          }
        : current
    );
  }

  async function saveProviderSettings(providerId: ProviderId) {
    if (!settings) {
      return null;
    }

    setSavingSettings(true);
    appendLog("info", copy.logs.providerSaving(PROVIDER_LABELS[providerId]));

    try {
      const next = await window.multiAiApi.updateProviderSettings(providerId, settings.providers[providerId]);
      setSettings(next);
      setProviderFeedback((current) => ({
        ...current,
        [providerId]: { kind: "success", message: copy.feedback.configSaved }
      }));
      appendLog("success", copy.logs.providerSaved(PROVIDER_LABELS[providerId]));
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProviderFeedback((current) => ({
        ...current,
        [providerId]: {
          kind: "error",
          message: copy.feedback.saveFailed(message)
        }
      }));
      appendLog("error", copy.logs.providerSaveFailed(PROVIDER_LABELS[providerId], message));
      return null;
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveEmailSettings() {
    if (!settings) {
      return null;
    }

    setSavingSettings(true);
    setEmailFeedback({ kind: "info", message: copy.feedback.emailSaving });
    appendLog("info", copy.logs.emailSaving);

    try {
      const next = await window.multiAiApi.saveSettings(settings);
      setSettings(next);
      setEmailFeedback({ kind: "success", message: copy.feedback.emailSaved });
      appendLog("success", copy.logs.emailSaved);
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setEmailFeedback({ kind: "error", message: copy.feedback.saveFailed(message) });
      appendLog("error", copy.logs.emailSaveFailed(message));
      return null;
    } finally {
      setSavingSettings(false);
    }
  }

  async function testProviderSettings(providerId: ProviderId) {
    setTestingProviderId(providerId);
    setProviderFeedback((current) => ({
      ...current,
      [providerId]: { kind: "info", message: copy.feedback.testing }
    }));
    appendLog("info", copy.logs.providerTesting(PROVIDER_LABELS[providerId]));

    try {
      const saved = await saveProviderSettings(providerId);
      if (!saved) {
        return;
      }

      const response = await window.multiAiApi.createTask({
        question: copy.testQuestion,
        providerIds: [providerId],
        autoSynthesize: false,
        timeoutMs: 45000
      });

      const answer = response.answers[0];
      if (answer?.status === "completed") {
        setProviderFeedback((current) => ({
          ...current,
          [providerId]: {
            kind: "success",
            message: copy.feedback.testSucceeded(answer.answer?.answerText ?? copy.feedback.returnedResult)
          }
        }));
        appendLog("success", copy.logs.providerTestSucceeded(PROVIDER_LABELS[providerId]));
      } else {
        const message = answer?.errorMessage ?? copy.feedback.noReturnedResult;
        setProviderFeedback((current) => ({
          ...current,
          [providerId]: {
            kind: "error",
            message: copy.feedback.testFailed(message)
          }
        }));
        appendLog("error", copy.logs.providerTestFailed(PROVIDER_LABELS[providerId], message));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProviderFeedback((current) => ({
        ...current,
        [providerId]: {
          kind: "error",
          message: copy.feedback.testFailed(message)
        }
      }));
      appendLog("error", copy.logs.providerTestFailed(PROVIDER_LABELS[providerId], message));
    } finally {
      setTestingProviderId(null);
    }
  }

  function startProviderProgress(providerIds: string[]) {
    // 清理旧计时器
    for (const t of progressTimersRef.current) window.clearTimeout(t);
    progressTimersRef.current = [];
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }

    // 初始化：全部平台 = "sent"
    const initial: ProviderProgress = {};
    for (const id of providerIds) initial[id] = "sent";
    setProviderProgress(initial);
    setElapsedSeconds(0);

    // 2s 后切换到 "fetching"
    const t1 = window.setTimeout(() => {
      setProviderProgress((prev) => {
        const next = { ...prev };
        for (const id of providerIds) next[id] = "fetching";
        return next;
      });
    }, 2000);

    // 8s 后切换到 "waiting"
    const t2 = window.setTimeout(() => {
      setProviderProgress((prev) => {
        const next = { ...prev };
        for (const id of providerIds) next[id] = "waiting";
        return next;
      });
    }, 8000);

    progressTimersRef.current = [t1, t2];

    // 已用时计数器
    const startTime = Date.now();
    elapsedTimerRef.current = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
  }

  function stopProviderProgress() {
    for (const t of progressTimersRef.current) window.clearTimeout(t);
    progressTimersRef.current = [];
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }

  async function handleSubmit() {
    if (running || selectedProviderIds.length === 0 || !loginReady || !question.trim()) {
      return;
    }

    setRunning(true);
    setResult(null);
    startProviderProgress(selectedProviderIds);
    appendLog(
      "info",
      copy.logs.taskStarted(selectedProviderIds
        .map((id) => PROVIDER_LABELS[id as ProviderId] ?? id)
        .join(copy.common.listSeparator))
    );

    if (autoSummarize) {
      appendLog("info", copy.logs.autoSummaryEnabled(PROVIDER_LABELS[summaryProviderId]));
    }
    if (autoSave) {
      appendLog("info", copy.logs.autoSaveEnabled);
    }
    if (emailSettings.enabled && emailSettings.recipientEmail.trim()) {
      appendLog("info", copy.logs.emailEnabled(emailSettings.recipientEmail.trim()));
    }

    const payload: CreateTaskInput = {
      question: question.trim(),
      providerIds: selectedProviderIds as CreateTaskInput["providerIds"],
      autoSynthesize: true,
      autoSave,
      autoSummarize,
      summaryProviderId,
      timeoutMs: 240000
    };

    try {
      const response = await window.multiAiApi.createTask(payload);
      setResult(response);
      setActiveResultTab("summary");
      setLoadedHistoryItemId(null);
      setQuestion("");
      shouldFocusQuestionRef.current = true;
      appendLog("success", copy.logs.taskCompleted(formatResultSummary(response.answers, copy)));

      for (const answer of response.answers) {
        const label = PROVIDER_LABELS[answer.providerId as ProviderId] ?? answer.providerId;
        appendLog(
          answer.status === "completed" ? "success" : "error",
          copy.logs.providerStatus(label, statusLabel(answer.status, copy), answer.errorMessage)
        );

        if (answer.errorCode === "MANUAL_VERIFICATION_REQUIRED") {
          appendLog("info", copy.logs.providerManualVerification(label));
        }
      }

      if (response.autoSummary) {
        const label = PROVIDER_LABELS[response.autoSummary.providerId as ProviderId] ?? response.autoSummary.providerId;
        appendLog(
          response.autoSummary.status === "completed" ? "success" : "error",
          copy.logs.autoSummaryStatus(
            label,
            statusLabel(response.autoSummary.status, copy),
            response.autoSummary.errorMessage
          )
        );
      }

      if (autoSave) {
        await refreshHistory();
      }
      if (emailSettings.enabled && emailSettings.recipientEmail.trim()) {
        appendLog("success", copy.logs.emailSent(emailSettings.recipientEmail.trim()));
      }
    } catch (error) {
      appendLog("error", copy.logs.taskFailed(error instanceof Error ? error.message : String(error)));
    } finally {
      stopProviderProgress();
      setRunning(false);
    }
  }

  async function handleReopenLoginPages() {

    try {
      const response = await window.multiAiApi.openProviderLoginPages();
      setLoginHint(copy.login.reopenSuccess(response.opened));
      appendLog("success", copy.login.reopenSuccessLog(response.opened));
      scheduleAutoLoginReady();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoginHint(copy.login.reopenFailed(message));
      appendLog("error", copy.login.reopenFailedLog(message));
    } finally {
      setLoginOpening(false);
    }
  }

  function getHistoryTabs(item: SavedTaskHistoryItem): ResultTab[] {
    return [
      { id: "summary", label: copy.common.summary, kind: "summary" },
      ...item.answers.map((answer) => ({
        id: `provider-${answer.providerId}`,
        label: PROVIDER_LABELS[answer.providerId as ProviderId] ?? answer.providerId,
        status: answer.status,
        providerId: answer.providerId as ProviderId,
        kind: "provider" as const
      }))
    ];
  }

  function handleViewHistoryItem(item: SavedTaskHistoryItem) {
    setLoadedHistoryItemId(item.id);
    setQuestion(item.task.question);
    setResult({
      task: item.task,
      answers: item.answers,
      synthesis: item.synthesis,
      autoSummary: item.autoSummary,
      events: item.events
    } as TaskResponse);
    setActiveResultTab("summary");
    setHistoryActiveTabs((current) => ({
      ...current,
      [item.id]: current[item.id] ?? "summary"
    }));
    setHistoryExpandedId((current) => (current === item.id ? null : item.id));
    appendLog("info", copy.logs.historyLoaded(item.task.question.slice(0, 40)));
  }

  async function handleDeleteHistoryItem(id: string) {
    try {
      setHistoryItems(await window.multiAiApi.deleteHistory(id));
      if (historyExpandedId === id) {
        setHistoryExpandedId(null);
      }
      if (loadedHistoryItemId === id) {
        setLoadedHistoryItemId(null);
        setQuestion("");
        setResult(null);
        setActiveResultTab("summary");
      }
      appendLog("success", copy.logs.historyDeleted);
    } catch (error) {
      appendLog("error", copy.logs.historyDeleteFailed(error instanceof Error ? error.message : String(error)));
    }
  }

  async function handleClearHistory() {
    try {
      setHistoryItems(await window.multiAiApi.clearHistory());
      setLoadedHistoryItemId(null);
      setHistoryExpandedId(null);
      setHistoryActiveTabs({});
      setQuestion("");
      setResult(null);
      setActiveResultTab("summary");
      appendLog("success", copy.logs.historyCleared);
    } catch (error) {
      appendLog("error", copy.logs.historyClearFailed(error instanceof Error ? error.message : String(error)));
    }
  }

  async function handleExportHistoryItem(id: string) {
    setHistoryExportingId(id);

    try {
      const exportResult = await window.multiAiApi.exportHistoryToText(id);

      if (exportResult.canceled) {
        appendLog("info", copy.logs.exportCanceled);
        return;
      }

      appendLog("success", copy.logs.exportSaved(exportResult.path ?? copy.statusLabels.completed));
    } catch (error) {
      appendLog("error", copy.logs.exportFailed(error instanceof Error ? error.message : String(error)));
    } finally {
      setHistoryExportingId(null);
    }
  }

  async function handleSaveAll(format: "txt" | "md" | "pdf") {
    if (!result) return;

    setSaveAllFormat(format);

    try {
      // Build the payload from the current result
      const payload = {
        question: result.task.question,
        createdAt: result.task.createdAt,
        finishedAt: result.task.finishedAt,
        status: result.task.status,
        providerIds: result.task.providerIds as string[],
        answers: result.answers.map((a) => ({
          providerId: a.providerId as string,
          status: a.status,
          answerText: a.answer?.answerText,
          errorMessage: a.errorMessage
        })),
        synthesis: result.synthesis ? { finalAnswer: result.synthesis.finalAnswer } : undefined,
        autoSummary: result.autoSummary
          ? {
              providerId: result.autoSummary.providerId as string,
              status: result.autoSummary.status,
              answerText: result.autoSummary.answer?.answerText,
              errorMessage: result.autoSummary.errorMessage
            }
          : undefined
      };

      let saveResult: { canceled: boolean; path?: string };

      if (format === "pdf") {
        saveResult = await window.multiAiApi.exportPdfTask(payload);
      } else {
        saveResult = await window.multiAiApi.saveAllAnswers({ data: payload, format });
      }

      if (saveResult.canceled) {
        appendLog("info", copy.saveAll.canceled);
      } else {
        appendLog("success", copy.saveAll.saved(saveResult.path ?? ""));
      }
    } catch (error) {
      appendLog("error", copy.saveAll.failed(error instanceof Error ? error.message : String(error)));
    } finally {
      setSaveAllFormat(null);
    }
  }

  async function handleResummarize() {
    if (!result || resummarizing) return;

    const completedAnswers = result.answers.filter(
      (a) => a.status === "completed" && a.answer?.answerText
    );
    if (completedAnswers.length === 0) {
      appendLog("error", copy.resummarize.noAnswers);
      return;
    }

    setResummarizing(true);
    appendLog("info", copy.resummarize.running);

    try {
      const summaryResult = await window.multiAiApi.resummarize({
        question: result.task.question,
        answers: result.answers.map((a) => ({
          providerId: a.providerId as string,
          status: a.status,
          answerText: a.answer?.answerText,
          errorMessage: a.errorMessage
        })),
        summaryProviderId: summaryProviderId
      });

      setResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          autoSummary: summaryResult
        };
      });

      setActiveResultTab("summary");

      if (summaryResult.status === "completed") {
        appendLog("success", copy.resummarize.success);
      } else {
        appendLog("error", copy.resummarize.failed(summaryResult.errorMessage ?? "Unknown error"));
      }
    } catch (error) {
      appendLog("error", copy.resummarize.failed(error instanceof Error ? error.message : String(error)));
    } finally {
      setResummarizing(false);
    }
  }

  function handleAnswerEdit(providerId: string, newBody: string) {
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        answers: prev.answers.map((a) => {
          if (a.providerId !== providerId) return a;
          return {
            ...a,
            answer: a.answer
              ? { ...a.answer, answerText: newBody }
              : {
                  id: `edited-${Date.now()}`,
                  taskProviderId: `tp-${providerId}`,
                  providerId: a.providerId as ProviderId,
                  question: prev.task.question,
                  answerText: newBody,
                  createdAt: new Date().toISOString()
                },
            status: "completed" as const
          };
        })
      };
    });

    const label = PROVIDER_LABELS[providerId as ProviderId] ?? providerId;
    appendLog("success", copy.edit.saved(label));
  }

  const selectedProviderCount = selectedProviderIds.length;
  const trimmedQuestion = question.trim();
  const submitDisabled = running || selectedProviderCount === 0 || !loginReady || !trimmedQuestion;
  const selectedProviderNames =
    selectedProviderIds.length > 0
      ? selectedProviderIds.map((id) => PROVIDER_LABELS[id as ProviderId] ?? id).join(copy.common.listSeparator)
      : copy.common.noSelectedProvider;
  const selectedProviderSummary =
    selectedProviderIds.length > 0
      ? selectedProviderIds
          .map((id) => PROVIDER_LABELS[id as ProviderId] ?? id)
          .join(copy.common.providerListSeparator)
      : copy.common.selectedProviderFallback;
  const waitingTitle = autoSummarize ? copy.waiting.titleSummary : copy.waiting.titleCompare;
  const waitingDescription = copy.waiting.description(selectedProviderCount, selectedProviderNames);
  const waitingTip = autoSummarize
    ? copy.waiting.tipSummary(PROVIDER_LABELS[summaryProviderId])
    : copy.waiting.tipCompare;
  const summaryModeText = autoSummarize
    ? copy.modes.summaryOn(PROVIDER_LABELS[summaryProviderId])
    : copy.modes.summaryOff;
  const autoSaveText = autoSave ? copy.modes.autoSaveOn : copy.modes.autoSaveOff;
  const heroTitle = loadedHistoryItemId ? copy.hero.titleLoaded : copy.hero.titleNew;
  const heroSubtitle = loadedHistoryItemId
    ? copy.hero.subtitleLoaded
    : copy.hero.subtitleNew;
  const heroNotice = !loginReady
    ? copy.hero.noticeLogin
    : selectedProviderCount === 0
      ? copy.hero.noticeSelect
      : copy.hero.noticeReady;
  const heroNoticeClass = `hero-notice${!loginReady || selectedProviderCount === 0 ? " hero-notice-warning" : ""}`;

  return (
    <div className={`app-frame${sidebarOpen ? " app-frame-sidebar-open" : ""}`}>
      {sidebarOpen ? <button className="sidebar-backdrop" type="button" onClick={() => setSidebarOpen(false)} /> : null}

      <aside
        id="options-sidebar"
        className={`app-sidebar${sidebarOpen ? " app-sidebar-open" : ""}`}
      >
        <div className="app-sidebar-inner">
          <div className="sidebar-brand-row">
            <div className="brand-lockup brand-lockup-sidebar">
              <img className="brand-logo" src="./branding/duoask-icon.png" alt={copy.brand.logoAlt} />
              <div className="brand-copy">
                <p className="eyebrow">{BRAND.enName}</p>
                <h1>{copy.brand.displayName}</h1>
                <p className="brand-subtitle">{copy.brand.tagline}</p>
              </div>
            </div>
            <button
              className="sidebar-close"
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label={copy.common.collapseSidebar}
              title={copy.common.collapseSidebar}
            >
              <span className="sidebar-close-icon" aria-hidden="true">
                <span />
                <span />
              </span>
            </button>
          </div>

          <section className="sidebar-panel sidebar-panel-primary">
            <div className="sidebar-panel-head">
              <div>
                <p className="eyebrow">{copy.sidebar.runEyebrow}</p>
                <h2>{copy.sidebar.platformModeTitle}</h2>
              </div>
              <span className={`sidebar-status-badge ${loginReady ? "sidebar-status-badge-ready" : "sidebar-status-badge-waiting"}`}>
                {loginReady ? copy.common.ready : copy.common.waitingLogin}
              </span>
            </div>

            <p className="sidebar-summary">{selectedProviderSummary}</p>

            <div className="sidebar-field">
              <div className="section-title-row">
                <span>{copy.sidebar.chooseProviders}</span>
                <span className="muted-text">{copy.common.selectedCount(selectedProviderCount)}</span>
              </div>
              <ProviderSelector
                providers={providers}
                selectedProviderIds={selectedProviderIds}
                onToggle={(providerId) => {
                  setSelectedProviderIds((current) =>
                    current.includes(providerId)
                      ? current.filter((id) => id !== providerId)
                      : [...current, providerId]
                  );
                }}
              />
            </div>

            <div className="sidebar-switches">
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={autoSummarize}
                  onChange={(event) => setAutoSummarize(event.target.checked)}
                />
                <span>{copy.sidebar.autoSummarize}</span>
              </label>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(event) => setAutoSave(event.target.checked)}
                />
                <span>{copy.sidebar.autoSave}</span>
              </label>
            </div>

            <label className="field-label sidebar-select-field">
              {copy.sidebar.summaryProvider}
              <select
                className="settings-select summary-provider-select"
                value={summaryProviderId}
                onChange={(event) => setSummaryProviderId(event.target.value as ProviderId)}
                disabled={!autoSummarize}
              >
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="sidebar-mini-metrics">
              <span className="mini-chip">{summaryModeText}</span>
              <span className="mini-chip">{autoSaveText}</span>
            </div>
          </section>

          <details className="sidebar-panel sidebar-panel-detail" open>
            <summary>
              <span>
                <span className="eyebrow">{copy.sidebar.connectionEyebrow}</span>
                <strong>{copy.sidebar.loginSession}</strong>
              </span>
              <span className="summary-chevron">{copy.common.expand}</span>
            </summary>
            <div className="sidebar-panel-body">
              <p className="login-hint">{loginHint}</p>
              <div className="side-actions">
                <button className="secondary-button" onClick={handleReopenLoginPages} disabled={loginOpening}>
                  {loginOpening ? copy.login.opening : copy.login.reopenButton}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    clearAutoLoginTimer();
                    setLoginReady(true);
                    setLoginHint(copy.login.manualReady);
                    appendLog("success", copy.login.manualReadyLog);
                  }}
                >
                  {copy.login.markReady}
                </button>
              </div>
            </div>
          </details>

          <details className="sidebar-panel sidebar-panel-detail">
            <summary>
              <span>
                <span className="eyebrow">{copy.sidebar.settingsEyebrow}</span>
                <strong>{copy.sidebar.providerTestEmail}</strong>
              </span>
              <span className="summary-chevron">{copy.common.expand}</span>
            </summary>
            <div className="sidebar-panel-body settings-content">
              <article className="settings-card">
                <div className="settings-card-header">
                  <strong>{copy.settings.emailNotifications}</strong>
                  <span className="pill">{emailSettings.enabled ? copy.settings.enabled : copy.settings.disabled}</span>
                </div>

                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={emailSettings.enabled}
                    onChange={(event) => updateEmailSettings({ enabled: event.target.checked })}
                    disabled={!settings}
                  />
                  <span>{copy.settings.emailAutoSend}</span>
                </label>

                <label className="field-label small-label" htmlFor="recipient-email">
                  {copy.settings.recipientEmail}
                </label>
                <input
                  id="recipient-email"
                  className="settings-input"
                  type="email"
                  value={emailSettings.recipientEmail}
                  onChange={(event) => updateEmailSettings({ recipientEmail: event.target.value })}
                  placeholder="name@example.com"
                  disabled={!settings}
                />

                <label className="field-label small-label" htmlFor="smtp-user">
                  {copy.settings.smtpUser}
                </label>
                <input
                  id="smtp-user"
                  className="settings-input"
                  type="text"
                  value={emailSettings.smtpUser}
                  onChange={(event) => updateEmailSettings({ smtpUser: event.target.value })}
                  disabled={!settings}
                />

                <label className="field-label small-label" htmlFor="smtp-pass">
                  {copy.settings.smtpPass}
                </label>
                <input
                  id="smtp-pass"
                  className="settings-input"
                  type="password"
                  value={emailSettings.smtpPass}
                  onChange={(event) => updateEmailSettings({ smtpPass: event.target.value })}
                  disabled={!settings}
                />

                <div className="settings-actions">
                  <button
                    className="secondary-button settings-button"
                    onClick={() => void saveEmailSettings()}
                    disabled={!settings || savingSettings}
                  >
                    {savingSettings ? copy.settings.saving : copy.settings.saveEmail}
                  </button>
                </div>

                {emailFeedback ? (
                  <p className={`settings-feedback settings-feedback-${emailFeedback.kind}`}>
                    {emailFeedback.message}
                  </p>
                ) : null}
                <p className="settings-note">
                  {copy.settings.emailNote}
                </p>
              </article>

              <div className="settings-grid">
                {providers.map((provider) => {
                  const providerId = provider.id as ProviderId;
                  const feedback = providerFeedback[providerId];
                  const isTesting = testingProviderId === providerId;

                  return (
                    <article className="settings-card" key={provider.id}>
                      <div className="settings-card-header">
                        <strong>{provider.name}</strong>
                        <span className="pill">{copy.common.browser}</span>
                      </div>

                      <div className="settings-actions">
                        <button
                          className="secondary-button settings-button"
                          onClick={() => void testProviderSettings(providerId)}
                          disabled={!settings || isTesting}
                        >
                          {isTesting ? copy.settings.testing : copy.settings.test}
                        </button>
                      </div>

                      {feedback ? (
                        <p className={`settings-feedback settings-feedback-${feedback.kind}`}>
                          {feedback.message}
                        </p>
                      ) : null}
                      <p className="settings-note">{copy.providerNotes[providerId]}</p>
                    </article>
                  );
                })}
              </div>
              {savingSettings ? <p className="notice-text">{copy.settings.platformSaving}</p> : null}
            </div>
          </details>

          <details className="sidebar-panel sidebar-panel-detail">
            <summary>
              <span>
                <span className="eyebrow">{copy.sidebar.historyEyebrow}</span>
                <strong>{copy.sidebar.recentTasks}</strong>
              </span>
              <span className="summary-chevron">{copy.common.expand}</span>
            </summary>
            <div className="sidebar-panel-body">
              <div className="history-toolbar">
                <button className="secondary-button log-clear-button" onClick={() => void refreshHistory()} disabled={historyLoading}>
                  {historyLoading ? copy.history.loading : copy.history.refresh}
                </button>
                <button
                  className="secondary-button log-clear-button"
                  onClick={() => void handleClearHistory()}
                  disabled={historyItems.length === 0}
                >
                  {copy.history.clear}
                </button>
              </div>
              {historyItems.length === 0 ? (
                <p className="log-empty">{copy.history.empty}</p>
              ) : (
                <div className="history-list">
                  {historyItems.slice(0, 8).map((item) => {
                    const expanded = historyExpandedId === item.id;
                    const summary = getPreferredSummary(item, copy);

                    return (
                      <article className="history-item" key={item.id}>
                        <div className="history-item-header">
                          <div>
                            <strong>{item.task.question}</strong>
                            <p className="history-meta">
                              {new Date(item.savedAt).toLocaleString(copy.locale)} · {copy.common.resultCount(item.answers.length)}
                            </p>
                          </div>
                        </div>
                        <div className="history-actions">
                          <button className="secondary-button log-clear-button" onClick={() => handleViewHistoryItem(item)}>
                            {expanded ? copy.history.collapse : copy.history.view}
                          </button>
                          <button
                            className="secondary-button log-clear-button"
                            onClick={() => void handleExportHistoryItem(item.id)}
                            disabled={historyExportingId === item.id}
                          >
                            {historyExportingId === item.id ? copy.history.exporting : copy.history.save}
                          </button>
                          <button
                            className="secondary-button log-clear-button"
                            onClick={() => void handleDeleteHistoryItem(item.id)}
                          >
                            {copy.history.delete}
                          </button>
                        </div>
                        {expanded ? (
                          <div className="history-detail">
                            <div className="result-tabs history-tabs" role="tablist" aria-label={copy.history.tabAria}>
                              {getHistoryTabs(item).map((tab) => {
                                const isActive = (historyActiveTabs[item.id] ?? "summary") === tab.id;

                                return (
                                  <button
                                    key={tab.id}
                                    className={`tab-button${isActive ? " tab-button-active" : ""}`}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() =>
                                      setHistoryActiveTabs((current) => ({
                                        ...current,
                                        [item.id]: tab.id
                                      }))
                                    }
                                  >
                                    {tab.label}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="history-tab-panel">
                              {(historyActiveTabs[item.id] ?? "summary") === "summary" ? (
                                summary ? (
                                  <>
                                    <p className="field-label small-label">{summary.title}</p>
                                    <pre>{summary.body || copy.answer.emptySummary}</pre>
                                  </>
                                ) : (
                                  <p className="log-empty">{copy.answer.noHistorySummary}</p>
                                )
                              ) : (
                                getHistoryTabs(item).map((tab) => {
                                  if ((historyActiveTabs[item.id] ?? "summary") !== tab.id) {
                                    return null;
                                  }

                                  const answer = item.answers.find((entry) => `provider-${entry.providerId}` === tab.id);
                                  if (!answer) {
                                    return null;
                                  }

                                  return <pre key={tab.id}>{formatAnswerBody(answer, copy)}</pre>;
                                })
                              )}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </details>

          <details className="sidebar-panel sidebar-panel-detail">
            <summary>
              <span>
                <span className="eyebrow">{copy.sidebar.logsEyebrow}</span>
                <strong>{copy.sidebar.runLogs}</strong>
              </span>
              <span className="summary-chevron">{copy.common.expand}</span>
            </summary>
            <div className="sidebar-panel-body">
              <div className="log-panel-header">
                <button
                  className="secondary-button log-clear-button"
                  onClick={() => setLogs([])}
                  disabled={logs.length === 0}
                >
                  {copy.logsPanel.clear}
                </button>
              </div>
              <div className="log-list">
                {logs.length === 0 ? (
                  <p className="log-empty">{copy.logsPanel.empty}</p>
                ) : (
                  logs.map((log) => (
                    <div className={`log-entry log-entry-${log.level}`} key={log.id}>
                      <span className="log-time">{log.timestamp}</span>
                      <span className="log-message">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </details>
        </div>
      </aside>

      <main className="main-stage">
        <header className="main-toolbar">
          <button
            className="sidebar-toggle"
            type="button"
            onClick={() => setSidebarOpen((current) => !current)}
            aria-expanded={sidebarOpen}
            aria-controls="options-sidebar"
            aria-label={sidebarOpen ? copy.common.collapseSidebar : copy.common.expandSidebar}
            title={sidebarOpen ? copy.common.collapseSidebar : copy.common.expandSidebar}
          >
            <span className="sidebar-toggle-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
          <div className="main-toolbar-actions">
            <div className="language-switch" role="group" aria-label={copy.languageSwitchAria}>
              <span className="language-switch-label">{copy.languageLabel}</span>
              {(["zh", "en"] as const).map((option) => (
                <button
                  key={option}
                  className={`language-option${language === option ? " language-option-active" : ""}`}
                  type="button"
                  aria-pressed={language === option}
                  onClick={() => handleLanguageChange(option)}
                >
                  {copy.languages[option]}
                </button>
              ))}
            </div>
            <div className="main-toolbar-meta">
              <span className="toolbar-chip">{copy.common.providerCount(selectedProviderCount)}</span>
              <span className="toolbar-chip">{loginReady ? copy.common.canAsk : copy.common.waitingLogin}</span>
            </div>
          </div>
        </header>

        <section className="hero-stage">
          <p className="hero-mark">{BRAND.enName.toUpperCase()}</p>
          <h2>{heroTitle}</h2>
          <p className="hero-subtitle">{heroSubtitle}</p>

          <div className={`hero-composer${running ? " hero-composer-busy" : ""}`} aria-busy={running}>
            <span className="hero-composer-prefix">+</span>
            <textarea
              id="question"
              ref={questionInputRef}
              className="hero-input"
              value={question}
              disabled={running}
              onChange={(event) => {
                setLoadedHistoryItemId(null);
                setQuestion(event.target.value);
              }}
              rows={2}
              placeholder={copy.hero.placeholder}
            />
            <div className="hero-composer-actions">
              <span className={`hero-composer-hint${running ? " hero-composer-hint-busy" : ""}`}>
                {running ? copy.hero.runningHint : copy.common.providerCount(selectedProviderCount)}
              </span>
              <button
                className="hero-submit"
                onClick={handleSubmit}
                disabled={submitDisabled}
              >
                {running ? (
                  <span className="hero-submit-busy">
                    <span className="hero-submit-spinner" aria-hidden="true" />
                    {copy.common.processing}
                  </span>
                ) : (
                  copy.hero.ask
                )}
              </button>
            </div>
          </div>

          <div className="hero-state-row">
            <span className="hero-pill">{summaryModeText}</span>
            <span className="hero-pill">{autoSaveText}</span>
            <span className={`hero-pill ${loginReady ? "hero-pill-ready" : "hero-pill-waiting"}`}>
              {loginReady ? copy.hero.sessionReady : copy.hero.sessionPreparing}
            </span>
          </div>

          <p className={heroNoticeClass}>{heroNotice}</p>
        </section>

        {result ? (
          <section className="results-stack">
            <TaskProgress
              title={copy.result.taskStatus(statusLabel(result.task.status, copy))}
              description={resultSummary || copy.result.fallbackSummary(result.answers.length, completedCount, failedCount)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
              <span className="eyebrow" style={{ margin: 0, marginRight: '8px' }}>{copy.saveAll.title}</span>
              <button
                className="secondary-button"
                style={{ fontSize: '12px', padding: '4px 10px', minHeight: 'auto' }}
                disabled={saveAllFormat !== null}
                onClick={() => void handleSaveAll('txt')}
              >
                {saveAllFormat === 'txt' ? copy.saveAll.saving : copy.saveAll.txt}
              </button>
              <button
                className="secondary-button"
                style={{ fontSize: '12px', padding: '4px 10px', minHeight: 'auto' }}
                disabled={saveAllFormat !== null}
                onClick={() => void handleSaveAll('md')}
              >
                {saveAllFormat === 'md' ? copy.saveAll.saving : copy.saveAll.md}
              </button>
              <button
                className="secondary-button"
                style={{ fontSize: '12px', padding: '4px 10px', minHeight: 'auto' }}
                disabled={saveAllFormat !== null}
                onClick={() => void handleSaveAll('pdf')}
              >
                {saveAllFormat === 'pdf' ? copy.saveAll.saving : copy.saveAll.pdf}
              </button>
            </div>
            {verificationRequiredProviders.length > 0 ? (
              <section className="panel warning-panel">
                <p className="eyebrow">{copy.result.manualVerification}</p>
                <p className="notice-text">
                  {copy.result.manualVerificationMessage(
                    verificationRequiredProviders
                      .map((answer) => PROVIDER_LABELS[answer.providerId as ProviderId] ?? answer.providerId)
                      .join(copy.common.listSeparator)
                  )}
                </p>
              </section>
            ) : null}
            <section className="result-panel">
              <div className="result-tabs" role="tablist" aria-label={copy.result.tabsAria}>
                {resultTabs.map((tab) => {
                  const isActive = activeResultTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      className={`tab-button${isActive ? " tab-button-active" : ""}`}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveResultTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="result-tab-panel">
                {activeResultTab === "summary" ? (
                  (() => {
                    const summary = getPreferredSummary(result, copy);

                    if (!result.autoSummary && result.synthesis) {
                      return result.synthesis ? (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                            <button
                              className="secondary-button"
                              style={{ fontSize: '12px', padding: '5px 14px', minHeight: 'auto', fontWeight: 600 }}
                              disabled={resummarizing}
                              onClick={() => void handleResummarize()}
                            >
                              {resummarizing ? copy.resummarize.running : copy.resummarize.button}
                            </button>
                          </div>
                          <SynthesisPanel synthesis={result.synthesis} label={copy.summary.answerTitle} />
                        </div>
                      ) : null;
                    }

                    if (summary) {
                      return (
                        <div className="auto-summary-result">
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                            <button
                              className="secondary-button"
                              style={{ fontSize: '12px', padding: '5px 14px', minHeight: 'auto', fontWeight: 600 }}
                              disabled={resummarizing}
                              onClick={() => void handleResummarize()}
                            >
                              {resummarizing ? copy.resummarize.running : copy.resummarize.button}
                            </button>
                          </div>
                          <AnswerCard
                            title={summary.title}
                            status={summary.status}
                            statusText={statusLabel(summary.status, copy)}
                            body={summary.body}
                          />
                        </div>
                      );
                    }

                    return (
                      <div className="empty-tab-panel">
                        <p className="eyebrow">{copy.common.summary}</p>
                        <h3>{copy.result.emptySummaryTitle}</h3>
                        <p>{copy.result.emptySummaryDescription}</p>
                      </div>
                    );
                  })()
                ) : (
                  result.answers.map((answer) => {
                    const providerId = answer.providerId as ProviderId;
                    const provider = providerMap.get(providerId);
                    const tabId = `provider-${answer.providerId}`;

                    if (tabId !== activeResultTab) {
                      return null;
                    }

                    return (
                      <AnswerCard
                        key={answer.providerId}
                        title={provider?.name ?? PROVIDER_LABELS[providerId] ?? answer.providerId}
                        status={answer.status}
                        statusText={statusLabel(answer.status, copy)}
                        body={formatAnswerBody(answer, copy)}
                        onEdit={(newBody) => handleAnswerEdit(answer.providerId as string, newBody)}
                      />
                    );
                  })
                )}
              </div>
            </section>
          </section>
        ) : running ? (
          <section className="results-stack" aria-live="polite">
            <section className="panel waiting-panel">
              <div className="waiting-panel-copy">
                <p className="eyebrow">{copy.common.processing}</p>
                <h3>{waitingTitle}</h3>
                <p>{waitingDescription}</p>
                <p className="waiting-panel-note">{waitingTip}</p>
              </div>
              <div className="waiting-panel-visual">
                <div className="waiting-progress-header">
                  <span className="waiting-spinner" aria-hidden="true" />
                  <span className="waiting-elapsed">
                    {copy.common.elapsed(
                      elapsedSeconds < 60
                        ? `${elapsedSeconds}s`
                        : `${Math.floor(elapsedSeconds / 60)}m${elapsedSeconds % 60}s`
                    )}
                  </span>
                </div>
                <div className="waiting-provider-list">
                  {selectedProviderIds.map((id) => {
                    const phase = providerProgress[id] ?? "sent";
                    const label = PROVIDER_LABELS[id as ProviderId] ?? id;
                    const phaseInfo = {
                      sent:     { icon: "📤", text: copy.waiting.sent, cls: "phase-sent" },
                      fetching: { icon: "⚡", text: copy.waiting.fetching, cls: "phase-fetching" },
                      waiting:  { icon: "⏳", text: copy.waiting.waiting, cls: "phase-waiting" }
                    }[phase];
                    return (
                      <div key={id} className={`waiting-provider-row ${phaseInfo.cls}`}>
                        <span className="waiting-provider-icon">{phaseInfo.icon}</span>
                        <span className="waiting-provider-name">{label}</span>
                        <span className="waiting-provider-phase">
                          {phaseInfo.text}
                          {phase === "waiting" ? <span className="phase-dots"><span /><span /><span /></span> : null}
                        </span>
                      </div>
                    );
                  })}
                  {autoSummarize ? (
                    <div className="waiting-provider-row phase-pending">
                      <span className="waiting-provider-icon">🧠</span>
                      <span className="waiting-provider-name">
                        {PROVIDER_LABELS[summaryProviderId]} {copy.waiting.summarySuffix}
                      </span>
                      <span className="waiting-provider-phase">{copy.waiting.pending}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </section>
        ) : (
          <section className="empty-results empty-results-quiet">
            <p className="eyebrow">{copy.common.result}</p>
            <h2>{copy.result.emptyTitle}</h2>
            <p>{copy.result.emptyDescription}</p>
          </section>
        )}
      </main>
    </div>
  );
}
