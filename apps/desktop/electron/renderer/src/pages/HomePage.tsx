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

const PROVIDER_NOTES: Record<ProviderId, string> = {
  chatgpt: "浏览器模式适合手动登录和处理验证页。",
  claude: "Claude 浏览器模式需要先登录 claude.ai，首次接入建议先手动确认会话已可用。",
  gemini: "Gemini 当前建议优先使用浏览器模式，便于复用已登录会话。",
  kimi: "Kimi 浏览器模式通常需要先完成登录，未登录时任务会提示重新验证。",
  doubao: "豆包浏览器模式通常需要先完成登录，未登录时任务会提示重新验证。",
  grok: "Grok 浏览器模式需要先登录 grok.com，登录后即可正常使用。"
};

function formatAnswerBody(answer: TaskResponse["answers"][number]) {
  if (answer.answer?.answerText) {
    return answer.answer.answerText;
  }

  if (answer.errorCode === "MANUAL_VERIFICATION_REQUIRED") {
    return "该平台需要先在浏览器中完成人工验证，然后重新运行任务。";
  }

  if (answer.errorCode === "LOGIN_REQUIRED") {
    return "该平台当前尚未登录，请先在浏览器中登录后重试。";
  }

  return answer.errorMessage ?? "暂无结果";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    completed: "已完成",
    failed: "失败",
    running: "运行中",
    partial_completed: "部分完成",
    cancelled: "已取消",
    draft: "草稿"
  };

  return labels[status] ?? status;
}

function providerName(providerId: ProviderId) {
  return PROVIDER_LABELS[providerId] ?? providerId;
}

function formatProviderNames(answers: TaskResponse["answers"], fallback = "无") {
  if (answers.length === 0) {
    return fallback;
  }

  return answers.map((answer) => providerName(answer.providerId as ProviderId)).join("、");
}

function formatResultSummary(answers: TaskResponse["answers"]) {
  const completed = answers.filter((answer) => answer.status === "completed");
  const failed = answers.filter((answer) => answer.status !== "completed");

  return `已返回 ${answers.length} 个结果，成功 ${completed.length} 个：${formatProviderNames(
    completed
  )}；失败 ${failed.length} 个：${formatProviderNames(failed)}`;
}

function getPreferredSummary(
  source:
    | Pick<TaskResponse, "synthesis" | "autoSummary">
    | Pick<SavedTaskHistoryItem, "synthesis" | "autoSummary">
) {
  if (source.autoSummary) {
    return {
      title: `综合答案 - ${
        PROVIDER_LABELS[source.autoSummary.providerId as ProviderId] ?? source.autoSummary.providerId
      }`,
      status: source.autoSummary.status,
      body: formatAnswerBody(source.autoSummary)
    };
  }

  if (source.synthesis) {
    return {
      title: "综合答案",
      status: "completed",
      body: source.synthesis.finalAnswer
    };
  }

  return null;
}

export function HomePage() {
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
  const [loadedHistoryItemId, setLoadedHistoryItemId] = useState<string | null>(null);
  const [emailFeedback, setEmailFeedback] = useState<ProviderFeedback | null>(null);
  const [loginHint, setLoginHint] = useState("正在准备浏览器登录页，稍后会自动进入可提问状态。");
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
  const resultSummary = result ? formatResultSummary(result.answers) : "";

  function appendLog(level: LogLevel, message: string) {
    const timestamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
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
      appendLog("error", `读取历史记录失败：${error instanceof Error ? error.message : String(error)}`);
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
    setLoginHint("浏览器已打开，请完成需要登录的平台。程序会在 20 秒后自动允许提问。");
    appendLog("info", "登录页已打开，开始等待 20 秒。");

    autoLoginTimerRef.current = window.setTimeout(() => {
      setLoginReady(true);
      setLoginHint("已进入可提问状态。若某个平台仍未登录，任务结果中会提示继续登录。");
      appendLog("success", "已自动进入可提问状态。");
      autoLoginTimerRef.current = null;
    }, 20000);
  }

  useEffect(() => {
    let active = true;

    void Promise.all([window.multiAiApi.listProviders(), window.multiAiApi.getSettings()])
      .then(([providerList, appSettings]) => {
        if (!active) {
          return;
        }

        setProviders(providerList);
        setSettings(appSettings);
        appendLog("success", `主页面已加载，读取到 ${providerList.length} 个平台。`);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        appendLog("error", `读取基础配置失败：${error instanceof Error ? error.message : String(error)}`);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, []);

  useEffect(() => {
    setLoginHint(`程序已在启动时打开 ${selectedProviderIds.length} 个登录标签页。请完成必要登录，20 秒后可开始提问。`);
    appendLog("info", `程序启动时会由主进程打开 ${selectedProviderIds.length} 个登录标签页。`);
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
      { id: "summary", label: "综合", kind: "summary" },
      ...result.answers.map((answer) => ({
        id: `provider-${answer.providerId}`,
        label: PROVIDER_LABELS[answer.providerId as ProviderId] ?? answer.providerId,
        status: answer.status,
        providerId: answer.providerId as ProviderId,
        kind: "provider" as const
      }))
    ];
  }, [result]);

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
    appendLog("info", `正在保存 ${PROVIDER_LABELS[providerId]} 配置。`);

    try {
      const next = await window.multiAiApi.updateProviderSettings(providerId, settings.providers[providerId]);
      setSettings(next);
      setProviderFeedback((current) => ({
        ...current,
        [providerId]: { kind: "success", message: "配置已保存。" }
      }));
      appendLog("success", `${PROVIDER_LABELS[providerId]} 配置已保存。`);
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProviderFeedback((current) => ({
        ...current,
        [providerId]: {
          kind: "error",
          message: `保存失败：${message}`
        }
      }));
      appendLog("error", `保存 ${PROVIDER_LABELS[providerId]} 配置失败：${message}`);
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
    setEmailFeedback({ kind: "info", message: "正在保存邮件设置..." });
    appendLog("info", "正在保存邮件设置。");

    try {
      const next = await window.multiAiApi.saveSettings(settings);
      setSettings(next);
      setEmailFeedback({ kind: "success", message: "邮件设置已保存。" });
      appendLog("success", "邮件设置已保存。");
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setEmailFeedback({ kind: "error", message: `保存失败：${message}` });
      appendLog("error", `保存邮件设置失败：${message}`);
      return null;
    } finally {
      setSavingSettings(false);
    }
  }

  async function testProviderSettings(providerId: ProviderId) {
    setTestingProviderId(providerId);
    setProviderFeedback((current) => ({
      ...current,
      [providerId]: { kind: "info", message: "正在测试，请稍等..." }
    }));
    appendLog("info", `正在测试 ${PROVIDER_LABELS[providerId]}。`);

    try {
      const saved = await saveProviderSettings(providerId);
      if (!saved) {
        return;
      }

      const response = await window.multiAiApi.createTask({
        question: "请只回复 OK",
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
            message: `测试成功：${answer.answer?.answerText ?? "已返回结果。"}`
          }
        }));
        appendLog("success", `${PROVIDER_LABELS[providerId]} 测试成功。`);
      } else {
        const message = answer?.errorMessage ?? "未返回结果。";
        setProviderFeedback((current) => ({
          ...current,
          [providerId]: {
            kind: "error",
            message: `测试失败：${message}`
          }
        }));
        appendLog("error", `${PROVIDER_LABELS[providerId]} 测试失败：${message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProviderFeedback((current) => ({
        ...current,
        [providerId]: {
          kind: "error",
          message: `测试失败：${message}`
        }
      }));
      appendLog("error", `${PROVIDER_LABELS[providerId]} 测试失败：${message}`);
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
      `开始执行任务，目标平台：${selectedProviderIds
        .map((id) => PROVIDER_LABELS[id as ProviderId] ?? id)
        .join("、")}。`
    );

    if (autoSummarize) {
      appendLog("info", `自动总结已开启，将使用 ${PROVIDER_LABELS[summaryProviderId]} 总结全部答案。`);
    }
    if (autoSave) {
      appendLog("info", "自动保存已开启，任务完成后会写入本地历史记录。");
    }
    if (emailSettings.enabled && emailSettings.recipientEmail.trim()) {
      appendLog("info", `邮件发送已开启，任务完成后会自动发送到 ${emailSettings.recipientEmail.trim()}。`);
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
      appendLog("success", `任务完成，${formatResultSummary(response.answers)}。`);

      for (const answer of response.answers) {
        const label = PROVIDER_LABELS[answer.providerId as ProviderId] ?? answer.providerId;
        appendLog(
          answer.status === "completed" ? "success" : "error",
          `${label} 状态：${statusLabel(answer.status)}${answer.errorMessage ? `，${answer.errorMessage}` : ""}`
        );

        if (answer.errorCode === "MANUAL_VERIFICATION_REQUIRED") {
          appendLog("info", `${label} 需要人工验证。请到浏览器中完成验证后重新提问。`);
        }
      }

      if (response.autoSummary) {
        const label = PROVIDER_LABELS[response.autoSummary.providerId as ProviderId] ?? response.autoSummary.providerId;
        appendLog(
          response.autoSummary.status === "completed" ? "success" : "error",
          `${label} 自动总结状态：${statusLabel(response.autoSummary.status)}${
            response.autoSummary.errorMessage ? `，${response.autoSummary.errorMessage}` : ""
          }`
        );
      }

      if (autoSave) {
        await refreshHistory();
      }
      if (emailSettings.enabled && emailSettings.recipientEmail.trim()) {
        appendLog("success", `邮件已尝试自动发送到 ${emailSettings.recipientEmail.trim()}。`);
      }
    } catch (error) {
      appendLog("error", `执行任务失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      stopProviderProgress();
      setRunning(false);
    }
  }

  async function handleReopenLoginPages() {

    try {
      const response = await window.multiAiApi.openProviderLoginPages();
      setLoginHint(`已重新打开 ${response.opened} 个登录标签页。请完成必要登录，20 秒后可开始提问。`);
      appendLog("success", `已重新打开 ${response.opened} 个登录标签页。`);
      scheduleAutoLoginReady();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoginHint(`重新打开登录页失败：${message}。请再试一次。`);
      appendLog("error", `重新打开登录页失败：${message}`);
    } finally {
      setLoginOpening(false);
    }
  }

  function getHistoryTabs(item: SavedTaskHistoryItem): ResultTab[] {
    return [
      { id: "summary", label: "综合", kind: "summary" },
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
    appendLog("info", `已载入历史记录：${item.task.question.slice(0, 40)}`);
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
      appendLog("success", "历史记录已删除。");
    } catch (error) {
      appendLog("error", `删除历史记录失败：${error instanceof Error ? error.message : String(error)}`);
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
      appendLog("success", "历史记录已清空。");
    } catch (error) {
      appendLog("error", `清空历史记录失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function handleExportHistoryItem(id: string) {
    setHistoryExportingId(id);

    try {
      const exportResult = await window.multiAiApi.exportHistoryToText(id);

      if (exportResult.canceled) {
        appendLog("info", "已取消保存文本文件。");
        return;
      }

      appendLog("success", `任务已保存到本地文件：${exportResult.path ?? "已完成"}`);
    } catch (error) {
      appendLog("error", `保存任务文本失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setHistoryExportingId(null);
    }
  }

  const selectedProviderCount = selectedProviderIds.length;
  const trimmedQuestion = question.trim();
  const submitDisabled = running || selectedProviderCount === 0 || !loginReady || !trimmedQuestion;
  const selectedProviderNames =
    selectedProviderIds.length > 0
      ? selectedProviderIds.map((id) => PROVIDER_LABELS[id as ProviderId] ?? id).join("、")
      : "未选择平台";
  const selectedProviderSummary =
    selectedProviderIds.length > 0
      ? selectedProviderIds
          .map((id) => PROVIDER_LABELS[id as ProviderId] ?? id)
          .join(" · ")
      : "还没有选择平台";
  const waitingTitle = autoSummarize ? "正在收集回答并生成综合结论" : "正在等待多平台回答返回";
  const waitingDescription = `问题已发送到 ${selectedProviderCount} 个平台：${selectedProviderNames}。返回结果后会直接展示在下方。`;
  const waitingTip = autoSummarize
    ? `全部平台完成后，会优先展示 ${PROVIDER_LABELS[summaryProviderId]} 生成的综合答案。`
    : "结果返回后，你可以按平台切换查看每一份原始回复。";
  const summaryModeText = autoSummarize
    ? `自动总结 · ${PROVIDER_LABELS[summaryProviderId]}`
    : "仅对比，不自动总结";
  const autoSaveText = autoSave ? "自动保存到历史" : "仅本次查看，不自动保存";
  const heroTitle = loadedHistoryItemId ? "继续这个问题" : "你在忙什么？";
  const heroSubtitle = loadedHistoryItemId
    ? "这条历史任务已经载入，你可以直接再次提问，或在下方继续查看综合结果与各平台回复。"
    : "左侧统一管理平台、登录、邮件、历史与日志，中间区域只负责提问与查看答案。";
  const heroNotice = !loginReady
    ? "浏览器登录准备完成后即可运行"
    : selectedProviderCount === 0
      ? "请先在左侧选择至少一个平台"
      : "准备就绪，可以开始一次多平台提问";
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
              <img className="brand-logo" src="./branding/duoask-icon.png" alt={`${BRAND.displayName} 标志`} />
              <div className="brand-copy">
                <p className="eyebrow">{BRAND.enName}</p>
                <h1>{BRAND.displayName}</h1>
                <p className="brand-subtitle">{BRAND.shortTagline}</p>
              </div>
            </div>
            <button
              className="sidebar-close"
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="收起侧栏"
              title="收起侧栏"
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
                <p className="eyebrow">本次运行</p>
                <h2>平台与模式</h2>
              </div>
              <span className={`sidebar-status-badge ${loginReady ? "sidebar-status-badge-ready" : "sidebar-status-badge-waiting"}`}>
                {loginReady ? "已就绪" : "等待登录"}
              </span>
            </div>

            <p className="sidebar-summary">{selectedProviderSummary}</p>

            <div className="sidebar-field">
              <div className="section-title-row">
                <span>选择平台</span>
                <span className="muted-text">{selectedProviderCount} 个已选</span>
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
                <span>自动总结所有答案</span>
              </label>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(event) => setAutoSave(event.target.checked)}
                />
                <span>自动保存到历史记录</span>
              </label>
            </div>

            <label className="field-label sidebar-select-field">
              总结平台
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
                <span className="eyebrow">连接</span>
                <strong>登录与会话</strong>
              </span>
              <span className="summary-chevron">展开</span>
            </summary>
            <div className="sidebar-panel-body">
              <p className="login-hint">{loginHint}</p>
              <div className="side-actions">
                <button className="secondary-button" onClick={handleReopenLoginPages} disabled={loginOpening}>
                  {loginOpening ? "打开中..." : "重新打开登录页"}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    clearAutoLoginTimer();
                    setLoginReady(true);
                    setLoginHint("已手动切换为可提问状态。");
                    appendLog("success", "已手动标记为可提问状态。");
                  }}
                >
                  标记为已就绪
                </button>
              </div>
            </div>
          </details>

          <details className="sidebar-panel sidebar-panel-detail">
            <summary>
              <span>
                <span className="eyebrow">设置</span>
                <strong>平台测试与邮件</strong>
              </span>
              <span className="summary-chevron">展开</span>
            </summary>
            <div className="sidebar-panel-body settings-content">
              <article className="settings-card">
                <div className="settings-card-header">
                  <strong>邮件通知</strong>
                  <span className="pill">{emailSettings.enabled ? "已开启" : "已关闭"}</span>
                </div>

                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={emailSettings.enabled}
                    onChange={(event) => updateEmailSettings({ enabled: event.target.checked })}
                    disabled={!settings}
                  />
                  <span>任务完成后自动发送邮件</span>
                </label>

                <label className="field-label small-label" htmlFor="recipient-email">
                  接收邮箱
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
                  SMTP 账号
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
                  SMTP 密码
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
                    {savingSettings ? "保存中..." : "保存邮件设置"}
                  </button>
                </div>

                {emailFeedback ? (
                  <p className={`settings-feedback settings-feedback-${emailFeedback.kind}`}>
                    {emailFeedback.message}
                  </p>
                ) : null}
                <p className="settings-note">
                  默认复用 `D:\\FOND` 中的 SMTP 配置，也可以单独修改收件邮箱并持久保存。
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
                        <span className="pill">浏览器</span>
                      </div>

                      <div className="settings-actions">
                        <button
                          className="secondary-button settings-button"
                          onClick={() => void testProviderSettings(providerId)}
                          disabled={!settings || isTesting}
                        >
                          {isTesting ? "测试中..." : "测试"}
                        </button>
                      </div>

                      {feedback ? (
                        <p className={`settings-feedback settings-feedback-${feedback.kind}`}>
                          {feedback.message}
                        </p>
                      ) : null}
                      <p className="settings-note">{PROVIDER_NOTES[providerId]}</p>
                    </article>
                  );
                })}
              </div>
              {savingSettings ? <p className="notice-text">正在保存平台配置...</p> : null}
            </div>
          </details>

          <details className="sidebar-panel sidebar-panel-detail">
            <summary>
              <span>
                <span className="eyebrow">历史</span>
                <strong>最近任务</strong>
              </span>
              <span className="summary-chevron">展开</span>
            </summary>
            <div className="sidebar-panel-body">
              <div className="history-toolbar">
                <button className="secondary-button log-clear-button" onClick={() => void refreshHistory()} disabled={historyLoading}>
                  {historyLoading ? "读取中..." : "刷新"}
                </button>
                <button
                  className="secondary-button log-clear-button"
                  onClick={() => void handleClearHistory()}
                  disabled={historyItems.length === 0}
                >
                  清空
                </button>
              </div>
              {historyItems.length === 0 ? (
                <p className="log-empty">暂无历史记录。开启自动保存后，问题、答案和综合结论会保存在这里。</p>
              ) : (
                <div className="history-list">
                  {historyItems.slice(0, 8).map((item) => {
                    const expanded = historyExpandedId === item.id;
                    const summary = getPreferredSummary(item);

                    return (
                      <article className="history-item" key={item.id}>
                        <div className="history-item-header">
                          <div>
                            <strong>{item.task.question}</strong>
                            <p className="history-meta">
                              {new Date(item.savedAt).toLocaleString("zh-CN")} · {item.answers.length} 个结果
                            </p>
                          </div>
                        </div>
                        <div className="history-actions">
                          <button className="secondary-button log-clear-button" onClick={() => handleViewHistoryItem(item)}>
                            {expanded ? "收起" : "查看"}
                          </button>
                          <button
                            className="secondary-button log-clear-button"
                            onClick={() => void handleExportHistoryItem(item.id)}
                            disabled={historyExportingId === item.id}
                          >
                            {historyExportingId === item.id ? "保存中..." : "保存"}
                          </button>
                          <button
                            className="secondary-button log-clear-button"
                            onClick={() => void handleDeleteHistoryItem(item.id)}
                          >
                            删除
                          </button>
                        </div>
                        {expanded ? (
                          <div className="history-detail">
                            <div className="result-tabs history-tabs" role="tablist" aria-label="历史任务结果视图">
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
                                    <pre>{summary.body || "暂无综合内容。"}</pre>
                                  </>
                                ) : (
                                  <p className="log-empty">这条历史任务还没有综合结果。</p>
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

                                  return <pre key={tab.id}>{formatAnswerBody(answer)}</pre>;
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
                <span className="eyebrow">日志</span>
                <strong>运行日志</strong>
              </span>
              <span className="summary-chevron">展开</span>
            </summary>
            <div className="sidebar-panel-body">
              <div className="log-panel-header">
                <button
                  className="secondary-button log-clear-button"
                  onClick={() => setLogs([])}
                  disabled={logs.length === 0}
                >
                  清空日志
                </button>
              </div>
              <div className="log-list">
                {logs.length === 0 ? (
                  <p className="log-empty">这里会显示程序执行状态和关键日志。</p>
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
            aria-label={sidebarOpen ? "收起侧栏" : "展开侧栏"}
            title={sidebarOpen ? "收起侧栏" : "展开侧栏"}
          >
            <span className="sidebar-toggle-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
          <div className="main-toolbar-meta">
            <span className="toolbar-chip">{selectedProviderCount} 个平台</span>
            <span className="toolbar-chip">{loginReady ? "可提问" : "等待登录"}</span>
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
              placeholder="有问题，尽管问"
            />
            <div className="hero-composer-actions">
              <span className={`hero-composer-hint${running ? " hero-composer-hint-busy" : ""}`}>
                {running ? "正在处理中" : `${selectedProviderCount} 平台`}
              </span>
              <button
                className="hero-submit"
                onClick={handleSubmit}
                disabled={submitDisabled}
              >
                {running ? (
                  <span className="hero-submit-busy">
                    <span className="hero-submit-spinner" aria-hidden="true" />
                    处理中
                  </span>
                ) : (
                  "提问"
                )}
              </button>
            </div>
          </div>

          <div className="hero-state-row">
            <span className="hero-pill">{summaryModeText}</span>
            <span className="hero-pill">{autoSaveText}</span>
            <span className={`hero-pill ${loginReady ? "hero-pill-ready" : "hero-pill-waiting"}`}>
              {loginReady ? "浏览器会话已就绪" : "浏览器登录准备中"}
            </span>
          </div>

          <p className={heroNoticeClass}>{heroNotice}</p>
        </section>

        {result ? (
          <section className="results-stack">
            <TaskProgress
              title={`任务状态：${statusLabel(result.task.status)}`}
              description={resultSummary || `已返回 ${result.answers.length} 个结果，成功 ${completedCount} 个，失败 ${failedCount} 个`}
            />
            {verificationRequiredProviders.length > 0 ? (
              <section className="panel warning-panel">
                <p className="eyebrow">需要人工验证</p>
                <p className="notice-text">
                  {verificationRequiredProviders
                    .map((answer) => PROVIDER_LABELS[answer.providerId as ProviderId] ?? answer.providerId)
                    .join("、")}
                  需要先到浏览器中完成验证，然后重新运行任务。
                </p>
              </section>
            ) : null}
            <section className="result-panel">
              <div className="result-tabs" role="tablist" aria-label="结果视图">
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
                    const summary = getPreferredSummary(result);

                    if (!result.autoSummary && result.synthesis) {
                      return result.synthesis ? <SynthesisPanel synthesis={result.synthesis} /> : null;
                    }

                    if (summary) {
                      return (
                        <div className="auto-summary-result">
                          <AnswerCard title={summary.title} status={summary.status} body={summary.body} />
                        </div>
                      );
                    }

                    return (
                      <div className="empty-tab-panel">
                        <p className="eyebrow">综合</p>
                        <h3>还没有综合结果</h3>
                        <p>运行完成后，这里会优先展示总结后的答案。</p>
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
                        body={formatAnswerBody(answer)}
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
                <p className="eyebrow">处理中</p>
                <h3>{waitingTitle}</h3>
                <p>{waitingDescription}</p>
                <p className="waiting-panel-note">{waitingTip}</p>
              </div>
              <div className="waiting-panel-visual">
                <div className="waiting-progress-header">
                  <span className="waiting-spinner" aria-hidden="true" />
                  <span className="waiting-elapsed">
                    已等待 {elapsedSeconds < 60
                      ? `${elapsedSeconds}s`
                      : `${Math.floor(elapsedSeconds / 60)}m${elapsedSeconds % 60}s`}
                  </span>
                </div>
                <div className="waiting-provider-list">
                  {selectedProviderIds.map((id) => {
                    const phase = providerProgress[id] ?? "sent";
                    const label = PROVIDER_LABELS[id as ProviderId] ?? id;
                    const phaseInfo = {
                      sent:     { icon: "📤", text: "已发送",   cls: "phase-sent" },
                      fetching: { icon: "⚡", text: "正在获取", cls: "phase-fetching" },
                      waiting:  { icon: "⏳", text: "等待回复", cls: "phase-waiting" }
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
                      <span className="waiting-provider-name">{PROVIDER_LABELS[summaryProviderId]} 总结</span>
                      <span className="waiting-provider-phase">全部完成后执行</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </section>
        ) : (
          <section className="empty-results empty-results-quiet">
            <p className="eyebrow">结果</p>
            <h2>答案会在这里聚合</h2>
            <p>提问后会先展示综合答案，再按平台切换查看原始回复。</p>
          </section>
        )}
      </main>
    </div>
  );
}
