import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createId,
  nowIso,
  type ProviderAnswer,
  type ProviderRunResult,
  type ProviderSettings
} from "@multi-ai/shared";
import type { ProviderAdapter, ProviderContext } from "@multi-ai/providers";

interface JsonRecord {
  [key: string]: JsonValue;
}

type JsonValue = string | number | boolean | null | JsonRecord | JsonValue[];

const DEFAULT_MODELS: Record<string, string> = {
  chatgpt: "gpt-4.1",
  gemini: "gemini-2.5-flash",
  kimi: "kimi-k2.5",
  doubao: "doubao-seed-1-6-250615"
};
const execFileAsync = promisify(execFile);

export class ApiProviderWorker {
  constructor(private readonly provider: ProviderAdapter) {}

  async run(ctx: ProviderContext, prompt: string): Promise<ProviderRunResult> {
    const settings = ctx.settings;
    if (!settings?.apiKey) {
      return {
        providerId: this.provider.id,
        status: "failed",
        errorCode: "API_KEY_MISSING",
        errorMessage: `${this.provider.name} API Key is missing`
      };
    }

    try {
      const started = Date.now();
      const answerText = await this.requestProviderAnswer(this.provider.id, settings, prompt, ctx.timeoutMs);
      const createdAt = nowIso();

      const answer: ProviderAnswer = {
        id: createId("answer"),
        taskProviderId: createId("tp"),
        providerId: this.provider.id,
        question: prompt,
        answerText,
        rawText: answerText,
        createdAt
      };

      return {
        providerId: this.provider.id,
        status: "completed",
        answer,
        elapsedMs: Date.now() - started
      };
    } catch (error) {
      const details =
        error instanceof Error
          ? [error.message, error.cause instanceof Error ? error.cause.message : ""]
              .filter(Boolean)
              .join(" | ")
          : String(error);

      return {
        providerId: this.provider.id,
        status: "failed",
        errorCode: "API_REQUEST_FAILED",
        errorMessage: details
      };
    }
  }

  private async requestProviderAnswer(
    providerId: ProviderContext["providerId"],
    settings: ProviderSettings,
    prompt: string,
    timeoutMs: number
  ): Promise<string> {
    switch (providerId) {
      case "chatgpt":
        return this.callOpenAI(settings, prompt, timeoutMs);
      case "gemini":
        return this.callGemini(settings, prompt, timeoutMs);
      case "kimi":
        return this.callMoonshot(settings, prompt, timeoutMs);
      case "doubao":
        return this.callDoubao(settings, prompt, timeoutMs);
      default:
        throw new Error(`Unsupported API provider: ${String(providerId)}`);
    }
  }

  private async callOpenAI(
    settings: ProviderSettings,
    prompt: string,
    timeoutMs: number
  ): Promise<string> {
    const response = await this.postJson(
      `${this.normalizeBaseUrl(settings.apiBaseUrl, "https://api.openai.com")}/v1/responses`,
      {
        model: settings.model || DEFAULT_MODELS.chatgpt,
        input: prompt
      },
      {
        Authorization: `Bearer ${settings.apiKey}`
      },
      timeoutMs
    );

    const text =
      this.pickString(response.output_text) ||
      this.extractFromOpenAIOutput(response.output) ||
      this.extractContentText(response.content);

    return this.requireAnswer(text, "OpenAI");
  }

  private async callGemini(
    settings: ProviderSettings,
    prompt: string,
    timeoutMs: number
  ): Promise<string> {
    const baseUrl = this.normalizeBaseUrl(
      settings.apiBaseUrl,
      "https://generativelanguage.googleapis.com"
    );
    const model = settings.model || DEFAULT_MODELS.gemini;
    const url = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;

    const response = await this.postJson(
      url,
      {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      },
      {},
      timeoutMs
    );

    const candidates = Array.isArray(response.candidates) ? response.candidates : [];
    const parts = candidates.flatMap((candidate) => {
      const content = this.asRecord(candidate)?.content;
      const partList = Array.isArray(this.asRecord(content)?.parts) ? (this.asRecord(content)?.parts as JsonValue[]) : [];
      return partList;
    });
    const text = parts
      .map((part) => this.pickString(this.asRecord(part)?.text))
      .filter(Boolean)
      .join("\n");

    return this.requireAnswer(text, "Gemini");
  }

  private async callMoonshot(
    settings: ProviderSettings,
    prompt: string,
    timeoutMs: number
  ): Promise<string> {
    const response = await this.postJson(
      `${this.normalizeBaseUrl(settings.apiBaseUrl, "https://api.moonshot.cn")}/v1/chat/completions`,
      {
        model: settings.model || DEFAULT_MODELS.kimi,
        messages: [{ role: "user", content: prompt }]
      },
      {
        Authorization: `Bearer ${settings.apiKey}`
      },
      timeoutMs
    );

    const text = this.extractOpenAICompatibleChoice(response);
    return this.requireAnswer(text, "Kimi");
  }

  private async callDoubao(
    settings: ProviderSettings,
    prompt: string,
    timeoutMs: number
  ): Promise<string> {
    const response = await this.postJson(
      `${this.normalizeBaseUrl(settings.apiBaseUrl, "https://ark.cn-beijing.volces.com/api/v3")}/chat/completions`,
      {
        model: settings.model || DEFAULT_MODELS.doubao,
        messages: [{ role: "user", content: prompt }]
      },
      {
        Authorization: `Bearer ${settings.apiKey}`
      },
      timeoutMs
    );

    const text = this.extractOpenAICompatibleChoice(response);
    return this.requireAnswer(text, "Doubao");
  }

  private async postJson(
    url: string,
    body: JsonRecord,
    headers: Record<string, string>,
    timeoutMs: number
  ): Promise<JsonRecord> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const text = await response.text();
      let json: JsonRecord = {};

      if (text) {
        try {
          json = JSON.parse(text) as JsonRecord;
        } catch {
          throw new Error(`API returned non-JSON response (${response.status}): ${text.slice(0, 240)}`);
        }
      }

      if (!response.ok) {
        const errorRecord = this.asRecord(json.error);
        const message =
          this.pickString(errorRecord?.message) ||
          this.pickString(json.message) ||
          text.slice(0, 240) ||
          response.statusText;
        throw new Error(`HTTP ${response.status}: ${message}`);
      }

      return json;
    } catch (error) {
      if (this.shouldUsePowerShellFallback(error)) {
        return this.postJsonViaPowerShell(url, body, headers, timeoutMs);
      }

      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private extractOpenAICompatibleChoice(response: JsonRecord): string {
    const choices = Array.isArray(response.choices) ? response.choices : [];
    const firstChoice = this.asRecord(choices[0]);
    const message = this.asRecord(firstChoice?.message);
    const content = message?.content;

    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => this.pickString(this.asRecord(item)?.text))
        .filter(Boolean)
        .join("\n");
    }

    return "";
  }

  private extractFromOpenAIOutput(output: JsonValue | undefined): string {
    if (!Array.isArray(output)) {
      return "";
    }

    return output
      .flatMap((item) => {
        const record = this.asRecord(item);
        const content = record?.content;
        return Array.isArray(content) ? content : [];
      })
      .map((item) => this.pickString(this.asRecord(item)?.text))
      .filter(Boolean)
      .join("\n");
  }

  private extractContentText(content: JsonValue | undefined): string {
    if (!Array.isArray(content)) {
      return "";
    }

    return content
      .map((item) => this.pickString(this.asRecord(item)?.text))
      .filter(Boolean)
      .join("\n");
  }

  private normalizeBaseUrl(value: string | undefined, fallback: string): string {
    return (value || fallback).replace(/\/+$/, "");
  }

  private requireAnswer(text: string, providerName: string): string {
    if (!text.trim()) {
      throw new Error(`${providerName} API returned an empty answer`);
    }

    return text.trim();
  }

  private asRecord(value: JsonValue | undefined): JsonRecord | undefined {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      return undefined;
    }

    return value;
  }

  private pickString(value: JsonValue | undefined): string {
    return typeof value === "string" ? value : "";
  }

  private shouldUsePowerShellFallback(error: unknown): boolean {
    return process.platform === "win32" && error instanceof Error && error.message === "fetch failed";
  }

  private async postJsonViaPowerShell(
    url: string,
    body: JsonRecord,
    headers: Record<string, string>,
    timeoutMs: number
  ): Promise<JsonRecord> {
    const bodyJson = JSON.stringify(body, null, 0);
    const headersJson = JSON.stringify(headers, null, 0);
    const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
    const script = `
$ProgressPreference = 'SilentlyContinue'
$headerObject = @'
${headersJson}
'@ | ConvertFrom-Json
$headers = @{}
if ($headerObject) {
  $headerObject.PSObject.Properties | ForEach-Object {
    $headers[$_.Name] = [string]$_.Value
  }
}
$body = @'
${bodyJson}
'@
try {
  $response = Invoke-RestMethod -Uri '${url}' -Method Post -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec ${timeoutSec}
  $response | ConvertTo-Json -Depth 100 -Compress
} catch {
  if ($_.ErrorDetails.Message) {
    Write-Output ('POWERSHELL_ERROR::' + $_.ErrorDetails.Message)
  } else {
    Write-Output ('POWERSHELL_ERROR::' + $_.Exception.Message)
  }
  exit 1
}
`;

    const encodedCommand = Buffer.from(script, "utf16le").toString("base64");

    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand],
        { windowsHide: true, maxBuffer: 1024 * 1024 * 4 }
      );

      const output = stdout.trim();
      if (!output) {
        return {};
      }

      return JSON.parse(output) as JsonRecord;
    } catch (error) {
      if (error instanceof Error) {
        const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout.trim() : "";
        const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
        const normalizedStdout = stdout.replace(/^POWERSHELL_ERROR::/, "");
        throw new Error(normalizedStdout || stderr || error.message);
      }

      throw error;
    }
  }
}
