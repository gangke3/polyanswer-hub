import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  PROVIDER_IDS,
  PROVIDERS,
  type CreateTaskInput,
  type ProviderId,
  type ProviderRunResult
} from "@multi-ai/shared";
import { BRAND } from "../../common/brand.js";
import { createTask } from "../ipc/task.ipc.js";
import { openProviderLoginPages } from "../ipc/provider.ipc.js";

const DEFAULT_API_HOST = process.env.DUOASK_API_HOST || process.env.POLYANSWER_API_HOST || "127.0.0.1";
const DEFAULT_API_PORT = Number(process.env.DUOASK_API_PORT || process.env.POLYANSWER_API_PORT || "3719");
const API_TOKEN = process.env.DUOASK_API_TOKEN?.trim() || process.env.POLYANSWER_API_TOKEN?.trim() || "";
const JSON_BODY_LIMIT_BYTES = 1024 * 1024;

export interface DesktopApiServerHandle {
  host: string;
  port: number;
  close: () => Promise<void>;
}

interface ApiErrorShape {
  error: string;
  details?: string;
}

interface AskRequestBody {
  question?: unknown;
  prompt?: unknown;
  providerIds?: unknown;
  autoSynthesize?: unknown;
  autoSave?: unknown;
  autoSummarize?: unknown;
  summaryProviderId?: unknown;
  timeoutMs?: unknown;
}

interface ApiProviderAnswerShape {
  providerId: ProviderId;
  providerName: string;
  status: ProviderRunResult["status"];
  answerText: string;
  elapsedMs?: number;
  errorCode?: string;
  errorMessage?: string;
  answer: ProviderRunResult["answer"] | null;
}

function setJsonHeaders(response: ServerResponse, statusCode: number): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  setJsonHeaders(response, statusCode);
  response.end(JSON.stringify(payload, null, 2));
}

function sendError(response: ServerResponse, statusCode: number, error: string, details?: string): void {
  const payload: ApiErrorShape = { error };
  if (details) {
    payload.details = details;
  }

  sendJson(response, statusCode, payload);
}

function isAuthorized(request: IncomingMessage): boolean {
  if (!API_TOKEN) {
    return true;
  }

  const authorization = request.headers.authorization;
  return authorization === `Bearer ${API_TOKEN}`;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalLength = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalLength += buffer.length;

    if (totalLength > JSON_BODY_LIMIT_BYTES) {
      throw new Error(`Request body exceeds ${JSON_BODY_LIMIT_BYTES} bytes.`);
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  const bodyText = Buffer.concat(chunks).toString("utf8").trim();
  if (!bodyText) {
    return {};
  }

  return JSON.parse(bodyText);
}

function normalizeProviderIds(rawValue: unknown): ProviderId[] {
  if (rawValue == null) {
    return [...PROVIDER_IDS];
  }

  if (!Array.isArray(rawValue)) {
    throw new Error("providerIds must be an array when provided.");
  }

  if (rawValue.length === 0) {
    return [...PROVIDER_IDS];
  }

  const normalized = rawValue.map((value) => {
    if (typeof value !== "string") {
      throw new Error("Each providerIds item must be a string.");
    }

    if (!PROVIDER_IDS.includes(value as ProviderId)) {
      throw new Error(`Unsupported providerId: ${value}`);
    }

    return value as ProviderId;
  });

  return Array.from(new Set(normalized));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeTimeoutMs(value: unknown): number {
  if (value == null) {
    return 240000;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("timeoutMs must be a positive number.");
  }

  return Math.floor(value);
}

function normalizeSummaryProviderId(rawValue: unknown, providerIds: ProviderId[]): ProviderId | undefined {
  if (typeof rawValue === "string" && providerIds.includes(rawValue as ProviderId)) {
    return rawValue as ProviderId;
  }

  if (providerIds.includes("chatgpt")) {
    return "chatgpt";
  }

  return providerIds[0];
}

function buildTaskInput(body: AskRequestBody): CreateTaskInput {
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const finalQuestion = question || prompt;

  if (!finalQuestion) {
    throw new Error("question is required.");
  }

  const providerIds = normalizeProviderIds(body.providerIds);
  const summaryProviderId = normalizeSummaryProviderId(body.summaryProviderId, providerIds);

  return {
    question: finalQuestion,
    providerIds,
    autoSynthesize: normalizeBoolean(body.autoSynthesize, true),
    autoSave: normalizeBoolean(body.autoSave, true),
    autoSummarize: normalizeBoolean(body.autoSummarize, false),
    summaryProviderId,
    timeoutMs: normalizeTimeoutMs(body.timeoutMs)
  };
}

function pickBestAnswer(result: Awaited<ReturnType<typeof createTask>>): {
  answer: string;
  source: string;
} | null {
  const autoSummaryResult = result.autoSummary;
  const autoSummary = autoSummaryResult?.answer?.answerText?.trim();
  if (autoSummary && autoSummaryResult) {
    return { answer: autoSummary, source: `autoSummary:${autoSummaryResult.providerId}` };
  }

  const synthesisAnswer = result.synthesis?.finalAnswer?.trim();
  if (synthesisAnswer) {
    return { answer: synthesisAnswer, source: "synthesis" };
  }

  const firstCompleted = result.answers.find((item) => item.answer?.answerText?.trim());
  if (firstCompleted?.answer?.answerText) {
    return {
      answer: firstCompleted.answer.answerText.trim(),
      source: `provider:${firstCompleted.providerId}`
    };
  }

  return null;
}

function getProviderName(providerId: ProviderId): string {
  return PROVIDERS.find((provider) => provider.id === providerId)?.name ?? providerId;
}

function buildProviderAnswers(result: Awaited<ReturnType<typeof createTask>>): ApiProviderAnswerShape[] {
  return result.answers.map((item) => ({
    providerId: item.providerId,
    providerName: getProviderName(item.providerId),
    status: item.status,
    answerText: item.answer?.answerText?.trim() ?? "",
    elapsedMs: item.elapsedMs,
    errorCode: item.errorCode,
    errorMessage: item.errorMessage,
    answer: item.answer ?? null
  }));
}

function buildAskResponse(result: Awaited<ReturnType<typeof createTask>>) {
  const bestAnswer = pickBestAnswer(result);
  const providerAnswers = buildProviderAnswers(result);
  const providerAnswersById = providerAnswers.reduce(
    (accumulator, item) => {
      accumulator[item.providerId] = item;
      return accumulator;
    },
    {} as Partial<Record<ProviderId, ApiProviderAnswerShape>>
  );

  return {
    ok: true,
    taskId: result.task.id,
    question: result.task.question,
    providerIds: result.task.providerIds,
    status: result.task.status,
    answer: bestAnswer?.answer || "",
    answerSource: bestAnswer?.source || null,
    comprehensiveAnswer: bestAnswer
      ? {
          text: bestAnswer.answer,
          source: bestAnswer.source
        }
      : null,
    synthesisAnswer: result.synthesis?.finalAnswer?.trim() || null,
    providerAnswers,
    providerAnswersById,
    synthesis: result.synthesis ?? null,
    autoSummary: result.autoSummary ?? null,
    result
  };
}

async function handleAsk(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = (await readJsonBody(request)) as AskRequestBody;
  const input = buildTaskInput(body);
  const result = await createTask(input);
  sendJson(response, 200, buildAskResponse(result));
}

async function handleOpenLogin(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = (await readJsonBody(request)) as { providerIds?: unknown };
  const providerIds = body.providerIds == null ? undefined : normalizeProviderIds(body.providerIds);
  const opened = await openProviderLoginPages(providerIds);
  sendJson(response, 200, { ok: true, ...opened });
}

async function routeRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method || "GET";
  const url = new URL(request.url || "/", `http://${request.headers.host || `${DEFAULT_API_HOST}:${DEFAULT_API_PORT}`}`);

  if (method === "OPTIONS") {
    setJsonHeaders(response, 204);
    response.end();
    return;
  }

  if (!isAuthorized(request)) {
    sendError(response, 401, "Unauthorized", "Missing or invalid bearer token.");
    return;
  }

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      name: BRAND.localApiName,
      host: DEFAULT_API_HOST,
      port: DEFAULT_API_PORT,
      auth: API_TOKEN ? "bearer" : "none",
      providers: PROVIDERS.map((provider) => ({
        id: provider.id,
        name: provider.name,
        enabled: provider.enabled
      }))
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/providers") {
    sendJson(response, 200, { ok: true, providers: PROVIDERS });
    return;
  }

  if (method === "POST" && (url.pathname === "/api/ask" || url.pathname === "/api/tasks")) {
    await handleAsk(request, response);
    return;
  }

  if (method === "POST" && url.pathname === "/api/login/open") {
    await handleOpenLogin(request, response);
    return;
  }

  sendError(response, 404, "Not Found", `No route for ${method} ${url.pathname}`);
}

export async function startDesktopApiServer(): Promise<DesktopApiServerHandle> {
  const server = http.createServer((request, response) => {
    void routeRequest(request, response).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[desktop-api] ${message}`);
      sendError(response, 500, "Internal Server Error", message);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(DEFAULT_API_PORT, DEFAULT_API_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });

  console.log(
    `[desktop-api] Listening on http://${DEFAULT_API_HOST}:${DEFAULT_API_PORT} (${API_TOKEN ? "bearer token enabled" : "no auth"})`
  );

  return {
    host: DEFAULT_API_HOST,
    port: DEFAULT_API_PORT,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}
