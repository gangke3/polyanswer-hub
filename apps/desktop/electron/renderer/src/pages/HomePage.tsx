import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  CreateTaskInput,
  ProviderExecutionMode,
  ProviderId,
  ProviderMeta,
  SavedTaskHistoryItem
} from "@multi-ai/shared";
import { AnswerCard } from "../components/AnswerCard.js";
import { ProviderSelector } from "../components/ProviderSelector.js";
import { SynthesisPanel } from "../components/SynthesisPanel.js";
import { TaskProgress } from "../components/TaskProgress.js";

type TaskResponse = Awaited<ReturnType<typeof window.multiAiApi.createTask>>;
type ProviderFeedback = { kind: "success" | "error" | "info"; message: string };
type LogLevel = "info" | "success" | "error";
type LogEntry = { id: string; timestamp: string; level: LogLevel; message: string };

const PROVIDER_NOTES: Record<ProviderId, string> = {
  chatgpt: "浏览器模式适合手动登录和处理验证页，API 模式使用 OpenAI 官方接口。",
  gemini: "Gemini 当前最容易在浏览器模式下拿到真实结果。",
  kimi: "Kimi 浏览器模式通常需要先完成登录，未登录时会在结果中直接提示。",
  doubao: "豆包浏览器模式通常需要先完成登录，未登录时会在结果中直接提示。"
};

const PROVIDER_LABELS: Record<ProviderId, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  kimi: "Kimi",
  doubao: "Doubao"
};

function formatAnswerBody(answer: TaskResponse["answers"][number]) {
  if (answer.answer?.answerText) {
    return answer.answer.answerText;
  }

  if (answer.errorCode === "MANUAL_VERIFICATION_REQUIRED") {
    return "该平台需要你先在浏览器中完成人工验证，然后再重新执行提问。";
  }

  if (answer.errorCode === "LOGIN_REQUIRED") {
    return "该平台当前仍未完成登录，请先在浏览器中登录后再重试。";
  }

  return answer.errorMessage ?? "暂无结果";
}

export function HomePage() {
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([
    "chatgpt",
    "gemini",
    "kimi",
    "doubao"
  ]);
  const [autoSummarize, setAutoSummarize] = useState(true);
  const [summaryProviderId, setSummaryProviderId] = useState<ProviderId>("chatgpt");
  const [autoSave, setAutoSave] = useState(true);
  const [question, setQuestion] = useState("请比较四个平台对同一个问题的回答风格。");
  const [running, setRunning] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingProviderId, setTestingProviderId] = useState<ProviderId | null>(null);
  const [result, setResult] = useState<TaskResponse | null>(null);
  const [providerFeedback, setProviderFeedback] = useState<Partial<Record<ProviderId, ProviderFeedback>>>({});
  const [globalModeHint, setGlobalModeHint] = useState("");
  const [loginReady, setLoginReady] = useState(false);
  const [loginOpening, setLoginOpening] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [historyItems, setHistoryItems] = useState<SavedTaskHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpandedId, setHistoryExpandedId] = useState<string | null>(null);
  const [loginHint, setLoginHint] = useState(
    "程序启动后会弹出浏览器，并在同一个窗口中打开 4 个标签页。等待 20 秒后会自动进入可提问状态。"
  );
  const autoLoginTimerRef = useRef<number | null>(null);

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
    setLoginHint("浏览器已弹出，程序将等待 20 秒后自动进入可提问状态。");
    appendLog("info", "登录页已打开，开始等待 20 秒后自动进入可提问状态。");

    autoLoginTimerRef.current = window.setTimeout(() => {
      setLoginReady(true);
      setLoginHint("已自动进入可提问状态。如果某个平台仍未完成登录，执行时会在结果中提示需要登录。");
      appendLog("success", "已等待 20 秒，程序自动进入可提问状态。");
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
        appendLog("success", `主界面已加载，读取到 ${providerList.length} 个平台配置。`);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        appendLog("error", `读取主界面基础配置失败：${error instanceof Error ? error.message : String(error)}`);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrapLoginPages() {
      setLoginOpening(true);
      appendLog("info", "程序启动，正在自动打开登录页。");

      try {
        const response = await window.multiAiApi.openProviderLoginPages();
        if (!active) {
          return;
        }

        setLoginHint(`已自动打开 ${response.opened} 个登录标签页，等待 20 秒后自动进入可提问状态。`);
        appendLog("success", `已自动打开 ${response.opened} 个登录标签页。`);
        scheduleAutoLoginReady();
      } catch (error) {
        if (!active) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setLoginHint(`自动打开登录页失败：${message}。你可以点击“重新打开登录页”。`);
        appendLog("error", `自动打开登录页失败：${message}`);
      } finally {
        if (active) {
          setLoginOpening(false);
        }
      }
    }

    void bootstrapLoginPages();

    return () => {
      active = false;
      clearAutoLoginTimer();
    };
  }, []);

  const providerMap = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers]
  );

  const selectedModes = useMemo(() => {
    const modes: Partial<Record<ProviderId, ProviderExecutionMode>> = {};
    if (!settings) {
      return modes;
    }

    for (const providerId of selectedProviderIds as ProviderId[]) {
      modes[providerId] = settings.providers[providerId]?.mode ?? "browser";
    }

    return modes;
  }, [selectedProviderIds, settings]);

  const verificationRequiredProviders = useMemo(() => {
    if (!result) {
      return [];
    }

    return result.answers.filter((answer) => answer.errorCode === "MANUAL_VERIFICATION_REQUIRED");
  }, [result]);

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

  function applyGlobalMode(mode: ProviderExecutionMode) {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      const nextProviders = { ...current.providers };
      for (const providerId of Object.keys(nextProviders) as ProviderId[]) {
        nextProviders[providerId] = {
          ...nextProviders[providerId],
          mode
        };
      }

      return {
        ...current,
        providers: nextProviders
      };
    });

    setGlobalModeHint(
      `已将 4 个平台统一切换为${mode === "api" ? " API 模式" : "浏览器模式"}，你仍然可以逐个平台单独调整。`
    );
    appendLog("info", `已将全部平台切换为${mode === "api" ? "API 模式" : "浏览器模式"}。`);
  }

  async function saveProviderSettings(providerId: ProviderId) {
    if (!settings) {
      return null;
    }

    setSavingSettings(true);
    appendLog("info", `正在保存 ${PROVIDER_LABELS[providerId]} 的配置。`);

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

  async function testProviderSettings(providerId: ProviderId) {
    setTestingProviderId(providerId);
    setProviderFeedback((current) => ({
      ...current,
      [providerId]: { kind: "info", message: "正在测试，请稍候..." }
    }));
    appendLog("info", `正在测试 ${PROVIDER_LABELS[providerId]}。`);

    try {
      const saved = await saveProviderSettings(providerId);
      if (!saved) {
        return;
      }

      const mode = saved.providers[providerId]?.mode ?? "browser";
      const response = await window.multiAiApi.createTask({
        question: "请只回复 OK",
        providerIds: [providerId],
        autoSynthesize: false,
        timeoutMs: 45000,
        providerModes: { [providerId]: mode }
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

  async function handleSubmit() {
    setRunning(true);
    setResult(null);
    appendLog(
      "info",
      `开始执行任务（逐个平台依次提问），目标平台：${selectedProviderIds
        .map((id) => PROVIDER_LABELS[id as ProviderId] ?? id)
        .join("、")}。`
    );

    if (autoSummarize) {
      appendLog("info", `自动总结已开启，将使用 ${PROVIDER_LABELS[summaryProviderId]} 总结全部答案。`);
    }
    if (autoSave) {
      appendLog("info", "自动保存已开启，任务完成后会写入本地历史记录。");
    }

    const payload: CreateTaskInput = {
      question,
      providerIds: selectedProviderIds as CreateTaskInput["providerIds"],
      autoSynthesize: true,
      autoSave,
      autoSummarize,
      summaryProviderId,
      timeoutMs: 240000,
      providerModes: selectedModes
    };

    try {
      const response = await window.multiAiApi.createTask(payload);
      setResult(response);
      appendLog("success", `任务完成，共返回 ${response.answers.length} 个平台结果。`);

      for (const answer of response.answers) {
        const label = PROVIDER_LABELS[answer.providerId as ProviderId] ?? answer.providerId;
        appendLog(
          answer.status === "completed" ? "success" : "error",
          `${label} 状态：${answer.status}${answer.errorMessage ? `，${answer.errorMessage}` : ""}`
        );

        if (answer.errorCode === "MANUAL_VERIFICATION_REQUIRED") {
          appendLog("info", `${label} 需要人工验证。请先到浏览器中完成验证后再重新执行提问。`);
        }
      }

      if (response.autoSummary) {
        const label = PROVIDER_LABELS[response.autoSummary.providerId as ProviderId] ?? response.autoSummary.providerId;
        appendLog(
          response.autoSummary.status === "completed" ? "success" : "error",
          `${label} 自动总结状态：${response.autoSummary.status}${
            response.autoSummary.errorMessage ? `，${response.autoSummary.errorMessage}` : ""
          }`
        );
      }

      if (autoSave) {
        await refreshHistory();
      }
    } catch (error) {
      appendLog("error", `执行任务失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunning(false);
    }
  }

  async function handleReopenLoginPages() {
    setLoginOpening(true);
    appendLog("info", "正在重新打开登录页。");

    try {
      const response = await window.multiAiApi.openProviderLoginPages();
      setLoginHint(`已重新打开 ${response.opened} 个登录标签页，等待 20 秒后自动进入可提问状态。`);
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

  function handleViewHistoryItem(item: SavedTaskHistoryItem) {
    setQuestion(item.task.question);
    setResult({
      task: item.task,
      answers: item.answers,
      synthesis: item.synthesis,
      autoSummary: item.autoSummary,
      events: item.events
    } as TaskResponse);
    setHistoryExpandedId((current) => (current === item.id ? null : item.id));
    appendLog("info", `已载入历史记录：${item.task.question.slice(0, 40)}`);
  }

  async function handleDeleteHistoryItem(id: string) {
    try {
      setHistoryItems(await window.multiAiApi.deleteHistory(id));
      if (historyExpandedId === id) {
        setHistoryExpandedId(null);
      }
      appendLog("success", "历史记录已删除。");
    } catch (error) {
      appendLog("error", `删除历史记录失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function handleClearHistory() {
    try {
      setHistoryItems(await window.multiAiApi.clearHistory());
      setHistoryExpandedId(null);
      appendLog("success", "历史记录已清空。");
    } catch (error) {
      appendLog("error", `清空历史记录失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <div className="page-shell">
      <section className="hero">
        <p className="eyebrow">PolyAnswer Hub</p>
        <h1>一个问题，同时交给 ChatGPT、Gemini、Kimi 和 Doubao</h1>
        <p className="lead">
          浏览器模式会在程序刷新后自动弹出浏览器并打开登录页，等待 20 秒后自动进入可提问状态。
        </p>
      </section>

      <section className="panel">
        <p className="eyebrow">平台配置</p>

        <div className="global-mode-bar">
          <span className="global-mode-label">统一切换全部平台模式</span>
          <div className="global-mode-actions">
            <button className="secondary-button settings-button" onClick={() => applyGlobalMode("api")} disabled={!settings}>
              全部切换为 API
            </button>
            <button
              className="secondary-button settings-button"
              onClick={() => applyGlobalMode("browser")}
              disabled={!settings}
            >
              全部切换为浏览器
            </button>
          </div>
        </div>
        {globalModeHint ? <p className="settings-feedback settings-feedback-info">{globalModeHint}</p> : null}

        <div className="settings-grid">
          {providers.map((provider) => {
            const providerId = provider.id as ProviderId;
            const providerSettings = settings?.providers[providerId];
            const feedback = providerFeedback[providerId];
            const isTesting = testingProviderId === providerId;
            const mode = providerSettings?.mode ?? "browser";
            const showApiFields = mode === "api";

            return (
              <div className="settings-card" key={provider.id}>
                <div className="settings-card-header">
                  <strong>{provider.name}</strong>
                  <span className="pill">{mode === "api" ? "API" : "浏览器"}</span>
                </div>

                <label className="field-label small-label">执行方式</label>
                <select
                  className="settings-select"
                  value={mode}
                  onChange={(event) =>
                    updateLocalProviderSetting(providerId, {
                      mode: event.target.value as ProviderExecutionMode
                    })
                  }
                >
                  <option value="browser">浏览器模式</option>
                  <option value="api">API 模式</option>
                </select>

                {showApiFields ? (
                  <>
                    <div className="api-settings-block">
                      <label className="field-label small-label">API Key</label>
                      <input
                        className="settings-input"
                        type="password"
                        value={providerSettings?.apiKey ?? ""}
                        placeholder={`填写 ${provider.name} 的 API Key`}
                        onChange={(event) =>
                          updateLocalProviderSetting(providerId, { apiKey: event.target.value })
                        }
                      />

                      <label className="field-label small-label">API Base URL</label>
                      <input
                        className="settings-input"
                        type="text"
                        value={providerSettings?.apiBaseUrl ?? ""}
                        placeholder="可修改，默认已按平台预填"
                        onChange={(event) =>
                          updateLocalProviderSetting(providerId, { apiBaseUrl: event.target.value })
                        }
                      />

                      <label className="field-label small-label">模型名</label>
                      <input
                        className="settings-input"
                        type="text"
                        value={providerSettings?.model ?? ""}
                        placeholder="可修改，默认已按平台预填"
                        onChange={(event) =>
                          updateLocalProviderSetting(providerId, { model: event.target.value })
                        }
                      />
                    </div>

                    <div className="settings-actions">
                      <button
                        className="secondary-button settings-button"
                        onClick={() => void saveProviderSettings(providerId)}
                        disabled={!settings || isTesting}
                      >
                        保存
                      </button>
                      <button
                        className="primary-button settings-button"
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
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
        {savingSettings ? <p className="notice-text">正在保存平台配置...</p> : null}
      </section>

      <section className="panel">
        <p className="eyebrow">浏览器登录</p>
        <p className="login-hint">{loginHint}</p>
        <div className="actions">
          <button className="secondary-button" onClick={handleReopenLoginPages} disabled={loginOpening}>
            {loginOpening ? "正在打开登录页..." : "重新打开登录页"}
          </button>
          <button
            className="primary-button"
            onClick={() => {
              clearAutoLoginTimer();
              setLoginReady(true);
              setLoginHint("已手动进入可提问状态。");
              appendLog("success", "用户手动确认进入可提问状态。");
            }}
          >
            立即进入可提问状态
          </button>
        </div>
      </section>

      <section className="panel">
        <label className="field-label" htmlFor="question">
          问题
        </label>
        <textarea
          id="question"
          className="question-input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={5}
        />

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

        <div className="summary-control">
          <label className="summary-toggle">
            <input
              type="checkbox"
              checked={autoSave}
              onChange={(event) => setAutoSave(event.target.checked)}
            />
            <span>自动保存到历史记录</span>
          </label>
        </div>

        <div className="summary-control">
          <label className="summary-toggle">
            <input
              type="checkbox"
              checked={autoSummarize}
              onChange={(event) => setAutoSummarize(event.target.checked)}
            />
            <span>自动总结</span>
          </label>
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
        </div>

        <div className="actions">
          <button
            className="primary-button"
            onClick={handleSubmit}
            disabled={running || selectedProviderIds.length === 0 || !loginReady}
          >
            {running ? "执行中..." : "开始逐个平台提问"}
          </button>
        </div>
        {!loginReady ? (
          <p className="notice-text">浏览器已打开，等待 20 秒后程序会自动允许你开始提问。</p>
        ) : null}
      </section>

      {result ? (
        <>
          <TaskProgress
            title={`任务状态：${result.task.status}`}
            description={`已返回 ${result.answers.length} 个平台结果`}
          />
          {verificationRequiredProviders.length > 0 ? (
            <section className="panel">
              <p className="eyebrow">人工验证提示</p>
              <p className="notice-text">
                以下平台需要先到浏览器中完成人工验证，然后再重新执行提问：
                {verificationRequiredProviders
                  .map((answer) => PROVIDER_LABELS[answer.providerId as ProviderId] ?? answer.providerId)
                  .join("、")}
              </p>
            </section>
          ) : null}
          {result.synthesis ? <SynthesisPanel synthesis={result.synthesis} /> : null}
          <section className="answer-grid">
            {result.answers.map((answer) => {
              const providerId = answer.providerId as ProviderId;
              const provider = providerMap.get(providerId);

              return (
                <AnswerCard
                  key={answer.providerId}
                  title={provider?.name ?? PROVIDER_LABELS[providerId] ?? answer.providerId}
                  status={answer.status}
                  body={formatAnswerBody(answer)}
                />
              );
            })}
          </section>
          {result.autoSummary ? (
            <div className="auto-summary-result">
              <AnswerCard
                title={`自动总结 - ${
                  PROVIDER_LABELS[result.autoSummary.providerId as ProviderId] ?? result.autoSummary.providerId
                }`}
                status={result.autoSummary.status}
                body={formatAnswerBody(result.autoSummary)}
              />
            </div>
          ) : null}
        </>
      ) : null}

      <section className="panel history-panel">
        <div className="log-panel-header">
          <p className="eyebrow">历史记录</p>
          <div className="history-actions">
            <button className="secondary-button log-clear-button" onClick={() => void refreshHistory()} disabled={historyLoading}>
              {historyLoading ? "读取中..." : "刷新"}
            </button>
            <button
              className="secondary-button log-clear-button"
              onClick={() => void handleClearHistory()}
              disabled={historyItems.length === 0}
            >
              清空历史
            </button>
          </div>
        </div>
        {historyItems.length === 0 ? (
          <p className="log-empty">暂无历史记录。开启自动保存后，问题、所有答案和总结会保存在这里。</p>
        ) : (
          <div className="history-list">
            {historyItems.map((item) => {
              const expanded = historyExpandedId === item.id;
              const summaryText = item.autoSummary?.answer?.answerText ?? item.autoSummary?.errorMessage ?? "";

              return (
                <article className="history-item" key={item.id}>
                  <div className="history-item-header">
                    <div>
                      <strong>{item.task.question}</strong>
                      <p className="history-meta">
                        {new Date(item.savedAt).toLocaleString("zh-CN")} · {item.answers.length} 个平台结果
                      </p>
                    </div>
                    <div className="history-actions">
                      <button className="secondary-button log-clear-button" onClick={() => handleViewHistoryItem(item)}>
                        {expanded ? "收起" : "查看"}
                      </button>
                      <button
                        className="secondary-button log-clear-button"
                        onClick={() => void handleDeleteHistoryItem(item.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="history-detail">
                      <p className="field-label small-label">问题</p>
                      <pre>{item.task.question}</pre>
                      <p className="field-label small-label">答案</p>
                      {item.answers.map((answer) => (
                        <pre key={answer.providerId}>
                          {PROVIDER_LABELS[answer.providerId as ProviderId] ?? answer.providerId}: {formatAnswerBody(answer)}
                        </pre>
                      ))}
                      {item.autoSummary ? (
                        <>
                          <p className="field-label small-label">总结答案</p>
                          <pre>{summaryText || "暂无总结结果"}</pre>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel log-panel">
        <div className="log-panel-header">
          <p className="eyebrow">运行日志</p>
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
      </section>
    </div>
  );
}
