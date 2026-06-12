import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";

const require = createRequire(import.meta.url);
const { BrowserWindow, dialog } = require("electron") as typeof import("electron");

const PDF_STYLES = `
  @page {
    size: A4;
    margin: 20mm 18mm;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    line-height: 1.7;
    color: #1a1a1a;
    margin: 0;
    padding: 0;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  h1 {
    font-size: 22px;
    font-weight: 700;
    margin: 0 0 6px 0;
    padding-bottom: 8px;
    border-bottom: 2px solid #3b82f6;
    color: #111;
  }
  h2 {
    font-size: 17px;
    font-weight: 600;
    margin: 28px 0 10px 0;
    color: #1e40af;
    page-break-after: avoid;
  }
  .meta-table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0 16px 0;
    font-size: 12px;
  }
  .meta-table td {
    padding: 5px 10px;
    border: 1px solid #d1d5db;
  }
  .meta-table td:first-child {
    font-weight: 600;
    background: #f3f4f6;
    width: 120px;
    color: #374151;
  }
  .question-block {
    background: #f0f7ff;
    border-left: 4px solid #3b82f6;
    padding: 12px 16px;
    margin: 14px 0;
    border-radius: 0 6px 6px 0;
    font-size: 14px;
  }
  .answer-block {
    background: #fafafa;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px 18px;
    margin: 12px 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 13px;
    line-height: 1.75;
    page-break-inside: auto;
  }
  .answer-block p { margin: 0 0 8px 0; }
  .answer-block p:last-child { margin-bottom: 0; }
  .status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    margin-left: 8px;
  }
  .status-completed { background: #d1fae5; color: #065f46; }
  .status-failed { background: #fee2e2; color: #991b1b; }
  .status-other { background: #e5e7eb; color: #374151; }
  .section-divider {
    border: none;
    border-top: 1px solid #e5e7eb;
    margin: 24px 0;
  }
  .synthesis-block {
    background: #fefce8;
    border: 1px solid #fbbf24;
    border-radius: 8px;
    padding: 16px 18px;
    margin: 12px 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 13px;
    line-height: 1.75;
  }
  .footer-note {
    margin-top: 30px;
    padding-top: 10px;
    border-top: 1px solid #d1d5db;
    font-size: 11px;
    color: #9ca3af;
    text-align: center;
  }
`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadgeClass(status: string): string {
  if (status === "completed") return "status-completed";
  if (status === "failed") return "status-failed";
  return "status-other";
}

function statusText(status: string): string {
  const labels: Record<string, string> = {
    completed: "已完成",
    failed: "失败",
    running: "运行中",
    partial_completed: "部分完成",
    cancelled: "已取消",
    timeout: "超时"
  };
  return labels[status] ?? status;
}

const PROVIDER_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  kimi: "Kimi",
  doubao: "Doubao",
  grok: "Grok"
};

function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id;
}

interface PdfTaskData {
  question: string;
  createdAt: string;
  finishedAt?: string;
  status: string;
  providerIds: string[];
  answers: Array<{
    providerId: string;
    status: string;
    answerText?: string;
    errorMessage?: string;
  }>;
  synthesis?: {
    finalAnswer: string;
  };
  autoSummary?: {
    providerId: string;
    status: string;
    answerText?: string;
    errorMessage?: string;
  };
}

function buildPdfHtml(data: PdfTaskData): string {
  const completed = data.answers.filter((a) => a.status === "completed");
  const failed = data.answers.filter((a) => a.status !== "completed");

  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>${PDF_STYLES}</style>
</head>
<body>
  <h1>多问任务记录</h1>
  <div class="question-block">${escapeHtml(data.question)}</div>
  <table class="meta-table">
    <tr><td>创建时间</td><td>${escapeHtml(data.createdAt)}</td></tr>
    <tr><td>完成时间</td><td>${escapeHtml(data.finishedAt ?? "未完成")}</td></tr>
    <tr><td>任务状态</td><td>${escapeHtml(statusText(data.status))}</td></tr>
    <tr><td>返回结果</td><td>${data.answers.length} 个</td></tr>
    <tr><td>成功平台</td><td>${completed.length} 个（${completed.map((a) => providerLabel(a.providerId)).join("、")}）</td></tr>
    <tr><td>失败平台</td><td>${failed.length} 个（${failed.map((a) => providerLabel(a.providerId)).join("、")}）</td></tr>
    <tr><td>平台</td><td>${data.providerIds.map(providerLabel).join("、")}</td></tr>
  </table>`;

  // Synthesis / auto-summary section
  if (data.autoSummary) {
    const name = providerLabel(data.autoSummary.providerId);
    const body = data.autoSummary.answerText ?? data.autoSummary.errorMessage ?? "无内容";
    html += `
  <h2>综合答案 - ${escapeHtml(name)} <span class="status-badge ${statusBadgeClass(data.autoSummary.status)}">${statusText(data.autoSummary.status)}</span></h2>
  <div class="synthesis-block">${escapeHtml(body)}</div>
  <hr class="section-divider">`;
  } else if (data.synthesis) {
    html += `
  <h2>综合结论</h2>
  <div class="synthesis-block">${escapeHtml(data.synthesis.finalAnswer)}</div>
  <hr class="section-divider">`;
  }

  // Per-provider answers
  for (let i = 0; i < data.answers.length; i++) {
    const answer = data.answers[i];
    const name = providerLabel(answer.providerId);
    const body = answer.answerText ?? answer.errorMessage ?? `状态：${statusText(answer.status)}`;
    html += `
  <h2>平台 ${i + 1}：${escapeHtml(name)} <span class="status-badge ${statusBadgeClass(answer.status)}">${statusText(answer.status)}</span></h2>
  <div class="answer-block">${escapeHtml(body)}</div>
  <hr class="section-divider">`;
  }

  html += `
  <div class="footer-note">由多问 DuoAsk 生成</div>
</body>
</html>`;

  return html;
}

function buildSingleContentHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>${PDF_STYLES}</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="answer-block">${escapeHtml(body)}</div>
  <div class="footer-note">由多问 DuoAsk 生成</div>
</body>
</html>`;
}

export async function savePdfFromHtml(html: string, defaultFileName: string, ownerWindow?: InstanceType<typeof BrowserWindow>): Promise<{ canceled: boolean; path?: string }> {
  const defaultPath = path.join(
    (require("electron") as typeof import("electron")).app.getPath("documents"),
    defaultFileName
  );

  const saveResult = ownerWindow
    ? await dialog.showSaveDialog(ownerWindow, {
        defaultPath,
        filters: [{ name: "PDF Files", extensions: ["pdf"] }]
      })
    : await dialog.showSaveDialog({
        defaultPath,
        filters: [{ name: "PDF Files", extensions: ["pdf"] }]
      });

  if (saveResult.canceled || !saveResult.filePath) {
    return { canceled: true };
  }

  const pdfWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      offscreen: true
    }
  });

  try {
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    // Give the renderer a moment to lay out
    await new Promise((resolve) => setTimeout(resolve, 400));

    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      displayHeaderFooter: false,
      pageSize: "A4"
    });

    await fs.writeFile(saveResult.filePath, pdfBuffer);
    return { canceled: false, path: saveResult.filePath };
  } finally {
    pdfWindow.close();
  }
}

export async function saveTaskAsPdf(data: PdfTaskData, defaultFileName: string, ownerWindow?: InstanceType<typeof BrowserWindow>): Promise<{ canceled: boolean; path?: string }> {
  const html = buildPdfHtml(data);
  return savePdfFromHtml(html, defaultFileName, ownerWindow);
}

export async function saveContentAsPdf(title: string, body: string, defaultFileName: string, ownerWindow?: InstanceType<typeof BrowserWindow>): Promise<{ canceled: boolean; path?: string }> {
  const html = buildSingleContentHtml(title, body);
  return savePdfFromHtml(html, defaultFileName, ownerWindow);
}
